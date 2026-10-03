-- Groundproof: initial schema
create extension if not exists pgcrypto;

create type public.verdict as enum ('pending', 'verified', 'review', 'flagged');
create type public.member_role as enum ('owner', 'reporter');

-- ---------- tables ----------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  postcode text not null check (postcode ~ '^[A-Z]{2}-[0-9]{2}-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}$'),
  nipost_address jsonb,
  nipost_building_use text,
  nipost_level smallint,
  anchored_at timestamptz,
  anchor_lat double precision,
  anchor_lng double precision,
  created_at timestamptz not null default now()
);

create table public.property_members (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  amount_gbp numeric(10,2),
  sort int not null default 0,
  completed_checkin_id uuid,
  created_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  reporter_id uuid not null references auth.users(id),
  milestone_id uuid references public.milestones(id) on delete set null,
  is_anchor boolean not null default false,
  lat double precision not null,
  lng double precision not null,
  gps_accuracy_m real not null,
  is_mocked boolean not null default false,
  device_time timestamptz not null,
  server_time timestamptz not null default now(),
  photo_paths text[] not null check (cardinality(photo_paths) between 1 and 8),
  note text check (note is null or char_length(note) <= 500),
  nipost_postcode text,
  nipost_distance_m real,
  nipost_confidence text,
  nipost_mock boolean,
  verdict public.verdict not null default 'pending',
  verdict_reason text,
  verified_at timestamptz
);
create index on public.checkins (property_id, server_time desc);

alter table public.milestones
  add constraint milestones_completed_fk
  foreign key (completed_checkin_id) references public.checkins(id) on delete set null;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by uuid not null default auth.uid() references auth.users(id),
  used_by uuid references auth.users(id),
  used_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  plan text check (plan in ('watch', 'build')),
  created_at timestamptz not null default now()
);

-- ---------- helpers (security definer avoids recursive RLS) ----------
create or replace function public.is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from property_members where property_id = pid and user_id = auth.uid());
$$;

create or replace function public.is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from property_members where property_id = pid and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_reporter(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from property_members where property_id = pid and user_id = auth.uid() and role = 'reporter');
$$;

-- Reporter redeems an invite code from the mobile app
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;

  select * into inv from invites
   where code = upper(trim(p_code)) and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'Invite code is invalid or expired'; end if;

  insert into property_members (property_id, user_id, role)
  values (inv.property_id, auth.uid(), 'reporter')
  on conflict (property_id, user_id) do nothing;

  update invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return inv.property_id;
end;
$$;
revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------- RLS ----------
alter table public.properties enable row level security;
alter table public.property_members enable row level security;
alter table public.milestones enable row level security;
alter table public.checkins enable row level security;
alter table public.invites enable row level security;
alter table public.waitlist enable row level security;

-- properties are created by the add-property edge function (service role)
create policy "members read properties" on public.properties
  for select to authenticated using (public.is_member(id));
create policy "owner renames property" on public.properties
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "members read members" on public.property_members
  for select to authenticated using (public.is_member(property_id));

create policy "members read milestones" on public.milestones
  for select to authenticated using (public.is_member(property_id));
create policy "owner adds milestones" on public.milestones
  for insert to authenticated with check (public.is_owner(property_id) and completed_checkin_id is null);
create policy "owner edits milestones" on public.milestones
  for update to authenticated using (public.is_owner(property_id)) with check (public.is_owner(property_id));
create policy "owner deletes milestones" on public.milestones
  for delete to authenticated using (public.is_owner(property_id));

create policy "members read checkins" on public.checkins
  for select to authenticated using (public.is_member(property_id));
-- reporters submit raw check-ins only; verdict fields are written by verify-checkin (service role)
create policy "reporters submit checkins" on public.checkins
  for insert to authenticated with check (
    reporter_id = auth.uid()
    and public.is_reporter(property_id)
    and verdict = 'pending'
    and verdict_reason is null
    and nipost_postcode is null
    and verified_at is null
  );

create policy "owner reads invites" on public.invites
  for select to authenticated using (public.is_owner(property_id));
create policy "owner creates invites" on public.invites
  for insert to authenticated with check (public.is_owner(property_id));

create policy "anyone joins waitlist" on public.waitlist
  for insert to anon, authenticated with check (true);

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkins', 'checkins', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

-- path convention: <property_id>/<checkin_id>/<n>.jpg
create policy "reporters upload photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'checkins'
    and public.is_reporter(((storage.foldername(name))[1])::uuid)
  );
create policy "members view photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'checkins'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );
