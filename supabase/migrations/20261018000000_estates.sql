-- Developer accounts: estates with many units, one reporter code for the whole estate,
-- buyers invited per unit, and a public "verified by Groundproof" estate page.

create table public.developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company text not null check (char_length(company) between 2 and 120),
  website text check (website is null or char_length(website) <= 200),
  phone text check (phone is null or char_length(phone) <= 30),
  approved boolean not null default false,
  max_units int not null default 200,
  created_at timestamptz not null default now()
);
alter table public.developers enable row level security;
create policy "developer reads own row" on public.developers for select to authenticated using (user_id = auth.uid());
-- Rows are created by the developer-apply edge function and approved from the admin dashboard.

create table public.estates (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  location text not null check (char_length(location) between 2 and 200),
  share_token text unique check (share_token is null or share_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  created_at timestamptz not null default now()
);
alter table public.estates enable row level security;

create or replace function public.is_approved_developer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from developers where user_id = auth.uid() and approved);
$$;

create or replace function public.is_estate_developer(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from estates where id = eid and developer_id = auth.uid());
$$;

create policy "developer reads estates" on public.estates for select to authenticated using (developer_id = auth.uid());
create policy "approved developer creates estates" on public.estates for insert to authenticated
  with check (developer_id = auth.uid() and public.is_approved_developer() and share_token is null);
create policy "developer edits estates" on public.estates for update to authenticated
  using (developer_id = auth.uid()) with check (developer_id = auth.uid());
create policy "developer deletes estates" on public.estates for delete to authenticated using (developer_id = auth.uid());

-- Units are ordinary properties that belong to an estate.
alter table public.properties add column estate_id uuid references public.estates(id) on delete set null;
create index on public.properties (estate_id);

-- Buyers of a unit can see which estate it's in.
create policy "unit members read their estate" on public.estates for select to authenticated using (
  exists (select 1 from properties p where p.estate_id = estates.id and public.is_member(p.id))
);

-- Reporters who joined with the estate code: on every unit, including units added later.
create table public.estate_reporters (
  estate_id uuid not null references public.estates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (estate_id, user_id)
);
alter table public.estate_reporters enable row level security;
create policy "developer reads estate reporters" on public.estate_reporters for select to authenticated
  using (public.is_estate_developer(estate_id));

create or replace function public.add_estate_reporters() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estate_id is not null and (tg_op = 'INSERT' or new.estate_id is distinct from old.estate_id) then
    insert into property_members (property_id, user_id, role)
    select new.id, er.user_id, 'reporter' from estate_reporters er where er.estate_id = new.estate_id
    on conflict (property_id, user_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger properties_estate_reporters
  after insert or update of estate_id on public.properties
  for each row execute function public.add_estate_reporters();

-- Estate invite codes: same table and code format as property codes.
alter table public.invites alter column property_id drop not null;
alter table public.invites add column estate_id uuid references public.estates(id) on delete cascade;
alter table public.invites add constraint invites_one_target check (num_nonnulls(property_id, estate_id) = 1);
create policy "developer reads estate invites" on public.invites for select to authenticated
  using (estate_id is not null and public.is_estate_developer(estate_id));
create policy "developer creates estate invites" on public.invites for insert to authenticated
  with check (property_id is null and estate_id is not null and public.is_estate_developer(estate_id));

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

  if inv.estate_id is not null then
    insert into estate_reporters (estate_id, user_id) values (inv.estate_id, auth.uid())
    on conflict do nothing;
    insert into property_members (property_id, user_id, role)
    select p.id, auth.uid(), 'reporter' from properties p where p.estate_id = inv.estate_id
    on conflict (property_id, user_id) do nothing;
  else
    insert into property_members (property_id, user_id, role)
    values (inv.property_id, auth.uid(), 'reporter')
    on conflict (property_id, user_id) do nothing;
  end if;

  update invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return coalesce(inv.property_id, inv.estate_id);
end;
$$;

-- Owners can't move a property into or out of an estate; only the estate-units function can.
create or replace function public.protect_property_anchor() returns trigger
language plpgsql as $$
begin
  -- The service role (edge functions) may change anything; signed-in users only the label.
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    if new.postcode is distinct from old.postcode
       or new.anchored_at is distinct from old.anchored_at
       or new.anchor_lat is distinct from old.anchor_lat
       or new.anchor_lng is distinct from old.anchor_lng
       or new.anchor_mode is distinct from old.anchor_mode
       or new.anchor_front_heading is distinct from old.anchor_front_heading
       or new.plan is distinct from old.plan
       or new.plan_expires_at is distinct from old.plan_expires_at
       or new.check_credits is distinct from old.check_credits
       or new.owner_id is distinct from old.owner_id
       or new.estate_id is distinct from old.estate_id then
      raise exception 'Only the property name can be changed here.';
    end if;
  end if;
  return new;
end;
$$;
