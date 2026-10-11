-- Reporter profiles: a public page with a track record computed from real check-ins.
-- Reporters write their own name, state, areas and bio. The numbers come only from the
-- checkins table (verdicts written by verify-checkin), so they can't be edited or faked.

create table public.reporter_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  display_name text not null check (char_length(display_name) between 2 and 60),
  state text not null check (char_length(state) between 2 and 40),
  areas text not null check (char_length(areas) between 2 and 200),
  bio text check (bio is null or char_length(bio) <= 400),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reporter_profiles enable row level security;

create or replace function public.is_any_reporter() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from property_members where user_id = auth.uid() and role = 'reporter');
$$;

create policy "reporter reads own profile" on public.reporter_profiles
  for select to authenticated using (user_id = auth.uid());
create policy "reporter creates own profile" on public.reporter_profiles
  for insert to authenticated with check (user_id = auth.uid() and public.is_any_reporter());
create policy "reporter edits own profile" on public.reporter_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reporter deletes own profile" on public.reporter_profiles
  for delete to authenticated using (user_id = auth.uid());

-- Track record for one reporter. Pending check-ins don't count yet.
create or replace function public.reporter_record(uid uuid)
returns table (visits int, verified int, review int, flagged int, properties int, first_visit timestamptz, last_visit timestamptz)
language sql stable security definer set search_path = public as $$
  select
    count(*)::int,
    count(*) filter (where verdict = 'verified')::int,
    count(*) filter (where verdict = 'review')::int,
    count(*) filter (where verdict = 'flagged')::int,
    count(distinct property_id)::int,
    min(server_time),
    max(server_time)
  from checkins
  where reporter_id = uid and verdict <> 'pending';
$$;
revoke all on function public.reporter_record(uuid) from public, anon, authenticated;

-- The signed-in reporter's own numbers (for their account page).
create or replace function public.my_reporter_record()
returns table (visits int, verified int, review int, flagged int, properties int, first_visit timestamptz, last_visit timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public.reporter_record(auth.uid());
$$;
grant execute on function public.my_reporter_record() to authenticated;

-- Public directory, optionally by state. Best record first: most verified visits, fewest flags.
create or replace function public.reporter_directory(p_state text default null)
returns table (slug text, display_name text, state text, areas text, visits int, verified int, flagged int, last_visit timestamptz)
language sql stable security definer set search_path = public as $$
  select p.slug, p.display_name, p.state, p.areas, r.visits, r.verified, r.flagged, r.last_visit
  from reporter_profiles p
  cross join lateral public.reporter_record(p.user_id) r
  where p.is_public and (p_state is null or p.state = p_state)
  order by r.verified desc, r.flagged asc, r.last_visit desc nulls last
  limit 200;
$$;
grant execute on function public.reporter_directory(text) to anon, authenticated;

-- One public profile.
create or replace function public.reporter_public(p_slug text)
returns table (slug text, display_name text, state text, areas text, bio text, joined timestamptz,
               visits int, verified int, review int, flagged int, properties int, first_visit timestamptz, last_visit timestamptz)
language sql stable security definer set search_path = public as $$
  select p.slug, p.display_name, p.state, p.areas, p.bio, p.created_at,
         r.visits, r.verified, r.review, r.flagged, r.properties, r.first_visit, r.last_visit
  from reporter_profiles p
  cross join lateral public.reporter_record(p.user_id) r
  where p.slug = lower(p_slug) and p.is_public;
$$;
grant execute on function public.reporter_public(text) to anon, authenticated;
