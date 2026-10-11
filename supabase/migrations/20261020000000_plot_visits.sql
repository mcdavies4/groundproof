-- Plot visits for land buyers: walk to each survey beacon and compare the ground with the plan.

alter table public.properties
  add column kind text not null default 'building' check (kind in ('building', 'plot')),
  add column beacons jsonb check (beacons is null or (jsonb_typeof(beacons) = 'array' and jsonb_array_length(beacons) between 3 and 30)),
  add column plan_accuracy_m real check (plan_accuracy_m is null or plan_accuracy_m between 0 and 100);

-- Owners can't rewrite a plot's beacons after creating it (that would change past results).
create or replace function public.protect_property_anchor() returns trigger
language plpgsql as $$
begin
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
       or new.estate_id is distinct from old.estate_id
       or new.kind is distinct from old.kind
       or new.beacons is distinct from old.beacons
       or new.plan_accuracy_m is distinct from old.plan_accuracy_m then
      raise exception 'Only the property name can be changed here.';
    end if;
  end if;
  return new;
end;
$$;

create table public.plot_visits (
  id uuid primary key,                                   -- made on the phone, so retries are safe
  property_id uuid not null references public.properties(id) on delete cascade,
  reporter_id uuid not null references auth.users(id),
  device_time timestamptz not null,
  uploaded_device_time timestamptz,
  is_emulator boolean not null default false,
  device_info jsonb,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  verdict text not null default 'pending' check (verdict in ('pending', 'match', 'partial', 'mismatch', 'flagged')),
  verdict_reason text,
  area_plan_m2 real,
  area_ground_m2 real,
  checked_at timestamptz,
  paid_by text
);
create index on public.plot_visits (property_id, created_at desc);

create table public.beacon_checks (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.plot_visits(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  beacon_index int not null check (beacon_index between 0 and 29),
  found boolean not null,
  lat double precision,
  lng double precision,
  accuracy_m real,
  is_mocked boolean not null default false,
  photo_path text,
  taken_at timestamptz,
  note text check (note is null or char_length(note) <= 200),
  distance_m real,                                      -- written by verify-plot-visit
  status text check (status in ('match', 'off', 'far', 'missing')),
  unique (visit_id, beacon_index)
);

alter table public.plot_visits enable row level security;
alter table public.beacon_checks enable row level security;

create policy "members read plot visits" on public.plot_visits for select to authenticated using (public.is_member(property_id));
create policy "reporters submit plot visits" on public.plot_visits for insert to authenticated with check (
  reporter_id = auth.uid() and public.is_reporter(property_id)
  and verdict = 'pending' and verdict_reason is null and checked_at is null
  and area_plan_m2 is null and area_ground_m2 is null
);
create policy "members read beacon checks" on public.beacon_checks for select to authenticated using (public.is_member(property_id));
create policy "reporters submit beacon checks" on public.beacon_checks for insert to authenticated with check (
  public.is_reporter(property_id) and distance_m is null and status is null
  and exists (select 1 from plot_visits v where v.id = visit_id and v.property_id = beacon_checks.property_id and v.reporter_id = auth.uid())
);

-- Plot visits use the property's check-in credits or plan, like check-ins.
create or replace function public.plot_visit_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p properties%rowtype;
begin
  select * into p from properties where id = new.property_id for update;
  if p.kind <> 'plot' then raise exception 'NOT_A_PLOT: This property is a building. Use a normal check-in.'; end if;
  if p.plan in ('watch', 'build') and p.plan_expires_at > now() then
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
create trigger plot_visits_entitlement before insert on public.plot_visits
  for each row execute function public.plot_visit_entitlement();

-- Building check-ins can't be made on a plot.
create or replace function public.checkins_not_on_plots() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from properties where id = new.property_id and kind = 'plot') then
    raise exception 'IS_A_PLOT: This is a plot. Use a plot visit.';
  end if;
  return new;
end;
$$;
-- Named to run before checkins_entitlement (triggers fire in name order).
create trigger a_checkins_not_on_plots before insert on public.checkins
  for each row execute function public.checkins_not_on_plots();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plot-photos', 'plot-photos', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;
create policy "reporters upload beacon photos" on storage.objects for insert to authenticated with check (
  bucket_id = 'plot-photos' and public.is_reporter(((storage.foldername(name))[1])::uuid)
);
create policy "members view beacon photos" on storage.objects for select to authenticated using (
  bucket_id = 'plot-photos' and public.is_member(((storage.foldername(name))[1])::uuid)
);
