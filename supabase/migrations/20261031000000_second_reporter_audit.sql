-- Second-reporter audit: the owner asks a different reporter to repeat a visit independently, and Claude compares the two.

alter table public.checkins
  add column audit_of uuid references public.checkins(id) on delete set null,       -- set on the second visit: which visit it double-checks
  add column audit_result text check (audit_result in ('agree', 'disagree', 'unsure', 'unavailable')),
  add column audit_note text,
  add column audit_status text check (audit_status in ('agreed', 'disputed', 'unsure'));  -- set on the ORIGINAL visit once it has been double-checked
create index on public.checkins (audit_of) where audit_of is not null;

-- An audit request is an ordinary visit request that the original reporter can't answer.
alter table public.checkin_requests
  add column audit_of uuid references public.checkins(id) on delete cascade,
  add column exclude_reporter uuid references auth.users(id) on delete cascade;

-- Reporters send what the phone knows, never the server's judgements (now including the audit fields).
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
    and stage_match is null
    and code_match is null
    and audit_of is null
    and audit_result is null
    and audit_note is null
    and audit_status is null
  );
