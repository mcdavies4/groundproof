-- ValueCheck: evidence-led indicative valuations for land and homes in Nigeria (Lagos first).
--
-- market_observations   Reviewed market evidence. Written only with the service role (SQL editor / future admin
--                       function). Users never read the table directly: they get approved rows through
--                       valuecheck_candidates(), which hides private source references and contributor ids.
-- market_observation_events  Append-only audit trail of every status or verification change.
-- valuation_requests / valuation_results  A user's own submissions and saved reports. Results are insert-only.
--
-- Nothing here changes an existing table.

create table public.market_observations (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('land', 'residential')),
  state text not null check (char_length(state) between 2 and 40),
  lga text not null check (char_length(lga) between 2 and 40),
  neighbourhood text not null check (char_length(neighbourhood) between 2 and 80),
  property_type text not null check (char_length(property_type) between 2 and 30),
  price_ngn bigint not null check (price_ngn > 0),
  -- What the price actually is. Asking prices stay asking prices.
  price_basis text not null check (price_basis in ('asking', 'reported_sale', 'completed_sale')),
  land_area_sqm numeric check (land_area_sqm is null or land_area_sqm between 20 and 5000000),
  building_area_sqm numeric check (building_area_sqm is null or building_area_sqm between 10 and 20000),
  bedrooms int check (bedrooms is null or bedrooms between 0 and 20),
  condition text check (condition is null or condition in ('new', 'good', 'fair', 'needs_work')),
  observed_on date not null check (observed_on <= current_date + 1),
  source_type text not null check (source_type in ('portal_listing', 'agent', 'valuer', 'user', 'government', 'other')),
  -- Shown to users on reports, e.g. 'Agent submission'. Never put a name, phone number or link here.
  source_label text not null check (char_length(source_label) between 2 and 60),
  -- Private provenance: listing URL, document reference, licence or consent note. Never shown to users.
  source_ref text check (source_ref is null or char_length(source_ref) <= 500),
  verification text not null default 'unverified' check (verification in ('unverified', 'source_checked', 'transaction_verified')),
  -- Only 'approved' rows are used in valuations.
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by text,
  reviewed_at timestamptz,
  lat double precision check (lat is null or lat between 4.2 and 13.95),
  lng double precision check (lng is null or lng between 2.6 and 14.7),
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index market_observations_lookup on public.market_observations (category, state, lga, observed_on desc) where review_status = 'approved';
alter table public.market_observations enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) reads or writes this table.

create table public.market_observation_events (
  id bigint generated always as identity primary key,
  observation_id uuid not null references public.market_observations(id) on delete cascade,
  event text not null check (event in ('created', 'review_changed', 'verification_changed', 'edited')),
  from_review text,
  to_review text,
  from_verification text,
  to_verification text,
  actor text,
  at timestamptz not null default now()
);
create index on public.market_observation_events (observation_id, at);
alter table public.market_observation_events enable row level security;

create or replace function public.log_observation_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor_name text := coalesce(nullif(auth.jwt() ->> 'email', ''), current_user);
begin
  if tg_op = 'INSERT' then
    insert into market_observation_events (observation_id, event, to_review, to_verification, actor)
    values (new.id, 'created', new.review_status, new.verification, actor_name);
  else
    if new.review_status is distinct from old.review_status then
      insert into market_observation_events (observation_id, event, from_review, to_review, actor)
      values (new.id, 'review_changed', old.review_status, new.review_status, actor_name);
    end if;
    if new.verification is distinct from old.verification then
      insert into market_observation_events (observation_id, event, from_verification, to_verification, actor)
      values (new.id, 'verification_changed', old.verification, new.verification, actor_name);
    end if;
    if (new.price_ngn, new.price_basis, new.land_area_sqm, new.building_area_sqm, new.observed_on, new.neighbourhood)
       is distinct from (old.price_ngn, old.price_basis, old.land_area_sqm, old.building_area_sqm, old.observed_on, old.neighbourhood) then
      insert into market_observation_events (observation_id, event, actor) values (new.id, 'edited', actor_name);
    end if;
  end if;
  return new;
end;
$$;
create trigger market_observations_audit after insert or update on public.market_observations
  for each row execute function public.log_observation_change();

-- Approved evidence for one category and state, close enough to be a candidate comparable.
-- Hides source_ref, review notes and who submitted it. Signed-in users only.
create or replace function public.valuecheck_candidates(p_category text, p_state text, p_lga text)
returns table (
  id uuid, category text, state text, lga text, neighbourhood text, property_type text, price_ngn bigint, price_basis text,
  land_area_sqm numeric, building_area_sqm numeric, bedrooms int, condition text, observed_on date,
  source_type text, source_label text, verification text, lat double precision, lng double precision
)
language sql stable security definer set search_path = public as $$
  select o.id, o.category, o.state, o.lga, o.neighbourhood, o.property_type, o.price_ngn, o.price_basis,
         o.land_area_sqm, o.building_area_sqm, o.bedrooms, o.condition, o.observed_on,
         o.source_type, o.source_label, o.verification, o.lat, o.lng
  from market_observations o
  where auth.uid() is not null
    and o.review_status = 'approved'
    and o.category = p_category and o.state = p_state and o.lga = p_lga
    and o.observed_on >= current_date - interval '25 months'
  order by o.observed_on desc
  limit 500;
$$;
revoke all on function public.valuecheck_candidates(text, text, text) from public, anon;
grant execute on function public.valuecheck_candidates(text, text, text) to authenticated;

-- ---------- a user's own requests and reports ----------
create table public.valuation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('land', 'residential')),
  state text not null,
  lga text not null,
  neighbourhood text not null,
  -- Validated subject exactly as the engine saw it.
  subject jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.valuation_requests (user_id, created_at desc);
alter table public.valuation_requests enable row level security;
create policy "reads own valuation requests" on public.valuation_requests for select to authenticated using (user_id = auth.uid());
create policy "creates own valuation requests" on public.valuation_requests for insert to authenticated with check (user_id = auth.uid());
create policy "deletes own valuation requests" on public.valuation_requests for delete to authenticated using (user_id = auth.uid());

-- Fair use: a signed-in user can run 30 valuations a day.
create or replace function public.limit_valuation_requests() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from valuation_requests where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'VALUECHECK_LIMIT: You''ve reached today''s limit of 30 valuations. Try again tomorrow.';
  end if;
  return new;
end;
$$;
create trigger valuation_requests_limit before insert on public.valuation_requests
  for each row execute function public.limit_valuation_requests();

-- Reports are insert-only: no update policy, so a saved report can't be edited afterwards.
create table public.valuation_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.valuation_requests(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null check (status in ('insufficient', 'estimated')),
  calc_version text not null,
  valuation_date date not null,
  range_low bigint,
  range_high bigint,
  central bigint,
  confidence_score int,
  confidence_level text check (confidence_level is null or confidence_level in ('low', 'medium', 'high')),
  -- Full result including the comparables as they were at the time (an immutable snapshot).
  result jsonb not null,
  created_at timestamptz not null default now(),
  check (status = 'insufficient' or (range_low is not null and range_high is not null and range_high >= range_low))
);
alter table public.valuation_results enable row level security;
create policy "reads own valuation results" on public.valuation_results for select to authenticated using (user_id = auth.uid());
create policy "saves result for own request" on public.valuation_results for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.valuation_requests r where r.id = request_id and r.user_id = auth.uid()));
