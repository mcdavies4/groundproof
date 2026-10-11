-- Stage C: offline check-ins, and owners requesting a check-in.

-- ---------- offline check-ins ----------
-- device_time is when the photos were taken (the GPS fix time).
-- uploaded_device_time is the phone's clock at upload. The gap between them is how long the
-- check-in waited on the phone with no signal; the phone clock is checked against the server
-- at upload. taken_offline is set by verify-checkin, never by the phone.
alter table public.checkins
  add column uploaded_device_time timestamptz,
  add column taken_offline boolean not null default false;

drop policy "reporters submit checkins" on public.checkins;
create policy "reporters submit checkins" on public.checkins
  for insert to authenticated with check (
    reporter_id = auth.uid()
    and public.is_reporter(property_id)
    and verdict = 'pending'
    and verdict_reason is null
    and nipost_postcode is null
    and verified_at is null
    and photo_match is null
    and photo_note is null
    and heading_ok is null
    and match_type is null
    and distance_from_anchor_m is null
    and taken_offline = false
  );

-- ---------- check-in requests ----------
create table public.checkin_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  due_by date,
  created_at timestamptz not null default now(),
  fulfilled_checkin_id uuid references public.checkins(id) on delete set null,
  fulfilled_at timestamptz,
  cancelled_at timestamptz
);
-- One open request per property at a time.
create unique index checkin_requests_one_open
  on public.checkin_requests (property_id) where fulfilled_at is null and cancelled_at is null;
create index on public.checkin_requests (property_id, created_at desc);

alter table public.checkin_requests enable row level security;

-- Owner, reporters and family viewers can all see requests.
-- Created by the request-checkin edge function (it also emails the reporters);
-- fulfilled by verify-checkin.
create policy "members read checkin requests" on public.checkin_requests
  for select to authenticated using (public.is_member(property_id));

create or replace function public.cancel_checkin_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r checkin_requests%rowtype;
begin
  select * into r from checkin_requests where id = p_request;
  if not found or not public.is_owner(r.property_id) then raise exception 'Not allowed'; end if;
  update checkin_requests set cancelled_at = now()
   where id = p_request and fulfilled_at is null and cancelled_at is null;
end;
$$;
revoke all on function public.cancel_checkin_request(uuid) from public;
grant execute on function public.cancel_checkin_request(uuid) to authenticated;
