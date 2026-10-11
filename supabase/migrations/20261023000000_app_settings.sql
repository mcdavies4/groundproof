-- Platform switches the admin can flip without a code change.
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "anyone reads settings" on public.app_settings for select to anon, authenticated using (true);
-- Written only by the admin-stats function (service role).

-- Pilot: visits by a Groundproof-matched reporter don't use the owner's credits or plan.
insert into public.app_settings (key, value) values ('matched_visits_free', 'true') on conflict do nothing;

create or replace function public.matched_visits_free() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text = 'true' from app_settings where key = 'matched_visits_free'), true);
$$;

-- Used by check-in and plot-visit billing: a matched visit is free only while the switch is on.
create or replace function public.has_active_match(pid uuid, rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.matched_visits_free()
     and exists (select 1 from matches where property_id = pid and reporter_id = rid and status = 'active');
$$;
