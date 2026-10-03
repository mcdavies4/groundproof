-- Groundproof: device integrity, compass headings, AI photo comparison

alter table public.checkins
  add column is_emulator boolean not null default false,
  add column device_info jsonb,
  add column photo_headings real[],                 -- compass heading (0-360) per photo, null if unavailable
  add column photo_match text check (photo_match in ('match', 'mismatch', 'unsure', 'unavailable')),
  add column photo_note text,
  add column heading_ok boolean;

alter table public.properties
  add column anchor_front_heading real;             -- heading of the anchor's first ("front") photo

-- Reporters may send device facts and headings, but never the server's judgements.
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
  );
