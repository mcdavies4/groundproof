-- Fair prices for matched reporters.
-- 1. Rate bands: Groundproof sets a min-max price per state and visit type (admin dashboard).
-- 2. Reporter rates: each reporter sets their price per visit type, and it must sit inside the band.
-- 3. Rules: reporters agree to them before their rates show; admins can suspend a reporter.
-- 4. Matches: an admin introduces an owner and a reporter at an agreed price. While the match is
--    active, that reporter's visits on that property don't use the owner's Groundproof credits
--    (pilot: the owner pays only the reporter's fee, never twice).

create table public.rate_bands (
  state text not null check (char_length(state) between 2 and 40),
  visit_type text not null check (visit_type in ('standard', 'distance', 'first')),
  min_ngn int not null check (min_ngn > 0),
  max_ngn int not null,
  updated_at timestamptz not null default now(),
  primary key (state, visit_type),
  check (max_ngn >= min_ngn and max_ngn <= min_ngn * 5)
);
alter table public.rate_bands enable row level security;
create policy "anyone reads rate bands" on public.rate_bands for select to anon, authenticated using (true);
-- Written only by the admin-stats function (service role).

alter table public.reporter_profiles
  add column agreed_rules_at timestamptz,
  add column suspended boolean not null default false;

-- Reporters can't lift their own suspension.
create or replace function public.protect_reporter_profile() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres'
     and new.suspended is distinct from old.suspended then
    raise exception 'Only Groundproof can change that.';
  end if;
  return new;
end;
$$;
create trigger reporter_profiles_protect before update on public.reporter_profiles
  for each row execute function public.protect_reporter_profile();

create table public.reporter_rates (
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_type text not null check (visit_type in ('standard', 'distance', 'first')),
  price_ngn int not null check (price_ngn > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, visit_type)
);
alter table public.reporter_rates enable row level security;
create policy "reporter reads own rates" on public.reporter_rates for select to authenticated using (user_id = auth.uid());
create policy "reporter sets own rates" on public.reporter_rates for insert to authenticated with check (user_id = auth.uid());
create policy "reporter edits own rates" on public.reporter_rates for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reporter removes own rates" on public.reporter_rates for delete to authenticated using (user_id = auth.uid());

-- A rate must sit inside the band for the reporter's state, and the rules must be agreed.
create or replace function public.check_reporter_rate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prof reporter_profiles%rowtype;
  band rate_bands%rowtype;
begin
  select * into prof from reporter_profiles where user_id = new.user_id;
  if not found then raise exception 'RATE_NO_PROFILE: Create your reporter profile first.'; end if;
  if prof.agreed_rules_at is null then raise exception 'RATE_RULES: Agree to the reporter rules first.'; end if;
  select * into band from rate_bands where state = prof.state and visit_type = new.visit_type;
  if not found then raise exception 'RATE_NO_BAND: Prices for % aren''t set yet. We''ll email you when they are.', prof.state; end if;
  if new.price_ngn < band.min_ngn or new.price_ngn > band.max_ngn then
    raise exception 'RATE_OUT_OF_BAND: In % this visit is ₦% to ₦%.', prof.state,
      to_char(band.min_ngn, 'FM999,999,999'), to_char(band.max_ngn, 'FM999,999,999');
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger reporter_rates_check before insert or update on public.reporter_rates
  for each row execute function public.check_reporter_rate();

-- ---------- matches ----------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ground_requests(id) on delete set null,
  owner_name text not null check (char_length(owner_name) between 1 and 100),
  owner_email text not null check (owner_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  visit_type text not null check (visit_type in ('standard', 'distance', 'first')),
  price_ngn int not null check (price_ngn > 0),
  frequency text not null check (frequency in ('once', 'monthly', 'fortnightly', 'weekly')),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on public.matches (property_id) where status = 'active';
alter table public.matches enable row level security;
create policy "reporter reads own matches" on public.matches for select to authenticated using (reporter_id = auth.uid());
create policy "owner reads matches on their property" on public.matches for select to authenticated
  using (property_id is not null and public.is_owner(property_id));
-- Created and ended by admins (admin-stats function).

create or replace function public.has_active_match(pid uuid, rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from matches where property_id = pid and reporter_id = rid and status = 'active');
$$;

-- ---------- matched visits don't use credits ----------
alter table public.checkins drop constraint if exists checkins_paid_by_check;
alter table public.checkins add constraint checkins_paid_by_check check (paid_by in ('anchor', 'plan', 'credit', 'matched'));

create or replace function public.checkins_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p properties%rowtype;
  used int;
begin
  select * into p from properties where id = new.property_id for update;

  if new.is_anchor then
    if p.anchored_at is not null then
      raise exception 'ALREADY_ANCHORED: This property is already anchored.';
    end if;
    new.paid_by := 'anchor';
    return new;
  end if;

  if p.anchored_at is null then
    raise exception 'NOT_ANCHORED: Do the anchor visit first.';
  end if;

  -- Introduced by Groundproof: the owner pays the reporter only.
  if public.has_active_match(p.id, new.reporter_id) then
    new.paid_by := 'matched';
    return new;
  end if;

  if p.plan = 'build' and p.plan_expires_at > now() then
    new.paid_by := 'plan';
    return new;
  end if;

  if p.plan = 'watch' and p.plan_expires_at > now() then
    select count(*) into used from checkins
     where property_id = p.id and paid_by = 'plan' and server_time > now() - interval '30 days';
    if used < public.watch_allowance() then
      new.paid_by := 'plan';
      return new;
    end if;
  end if;

  if p.check_credits > 0 then
    update properties set check_credits = check_credits - 1 where id = p.id;
    new.paid_by := 'credit';
    return new;
  end if;

  raise exception 'NO_CHECKINS_LEFT: No check-ins left on this property. Ask the owner to top up.';
end;
$$;

create or replace function public.plot_visit_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p properties%rowtype;
begin
  select * into p from properties where id = new.property_id for update;
  if p.kind <> 'plot' then raise exception 'NOT_A_PLOT: This property is a building. Use a normal check-in.'; end if;
  if public.has_active_match(p.id, new.reporter_id) then
    new.paid_by := 'matched';
  elsif p.plan in ('watch', 'build') and p.plan_expires_at > now() then
    new.paid_by := 'plan';
  elsif p.check_credits > 0 then
    update properties set check_credits = check_credits - 1 where id = p.id;
    new.paid_by := 'credit';
  else
    raise exception 'NO_CHECKINS_LEFT: No visits left on this plot. Ask the owner to top up.';
  end if;
  return new;
end;
$$;

create or replace function public.checkin_block_reason(pid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  p properties%rowtype;
  used int;
begin
  if not public.is_member(pid) then return 'You are not on this property.'; end if;
  select * into p from properties where id = pid;
  if p.anchored_at is null then return null; end if;
  if public.has_active_match(pid, auth.uid()) then return null; end if;
  if p.plan = 'build' and p.plan_expires_at > now() then return null; end if;
  if p.plan = 'watch' and p.plan_expires_at > now() then
    select count(*) into used from checkins
     where property_id = pid and paid_by = 'plan' and server_time > now() - interval '30 days';
    if used < public.watch_allowance() then return null; end if;
  end if;
  if p.check_credits > 0 then return null; end if;
  return 'No check-ins left on this property. Ask the owner to top up.';
end;
$$;

-- ---------- public directory: rates in, suspended out ----------
drop function if exists public.reporter_directory(text);
create function public.reporter_directory(p_state text default null)
returns table (slug text, display_name text, state text, areas text, visits int, verified int, flagged int, last_visit timestamptz, rates jsonb)
language sql stable security definer set search_path = public as $$
  select p.slug, p.display_name, p.state, p.areas, r.visits, r.verified, r.flagged, r.last_visit,
         coalesce((select jsonb_object_agg(rr.visit_type, rr.price_ngn) from reporter_rates rr where rr.user_id = p.user_id), '{}'::jsonb)
  from reporter_profiles p
  cross join lateral public.reporter_record(p.user_id) r
  where p.is_public and not p.suspended and (p_state is null or p.state = p_state)
  order by r.verified desc, r.flagged asc, r.last_visit desc nulls last
  limit 200;
$$;
grant execute on function public.reporter_directory(text) to anon, authenticated;

drop function if exists public.reporter_public(text);
create function public.reporter_public(p_slug text)
returns table (slug text, display_name text, state text, areas text, bio text, joined timestamptz,
               visits int, verified int, review int, flagged int, properties int, first_visit timestamptz, last_visit timestamptz, rates jsonb)
language sql stable security definer set search_path = public as $$
  select p.slug, p.display_name, p.state, p.areas, p.bio, p.created_at,
         r.visits, r.verified, r.review, r.flagged, r.properties, r.first_visit, r.last_visit,
         coalesce((select jsonb_object_agg(rr.visit_type, rr.price_ngn) from reporter_rates rr where rr.user_id = p.user_id), '{}'::jsonb)
  from reporter_profiles p
  cross join lateral public.reporter_record(p.user_id) r
  where p.slug = lower(p_slug) and p.is_public and not p.suspended;
$$;
grant execute on function public.reporter_public(text) to anon, authenticated;
