-- Verification release 1: stage-match check, challenge code, and anti-spoofing evidence.

-- What Claude's photo check decided, kept for the owner's report and for tuning. Set by verify-checkin, never by the phone.
alter table public.checkins
  add column stage_match text check (stage_match in ('match', 'mismatch', 'unsure', 'unavailable')),
  add column code_match text check (code_match in ('seen', 'not_seen', 'not_issued', 'unavailable'));

-- Owners can require a challenge code on every check-in (like require_video).
alter table public.properties add column require_code boolean not null default false;

-- Codes handed to reporters at the start of a check-in. No policies: only get_challenge() and the edge functions touch it.
create table public.checkin_challenges (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);
create index on public.checkin_challenges (property_id, reporter_id, created_at desc);
alter table public.checkin_challenges enable row level security;

-- The reporter's app calls this when a check-in opens. Returns null when the owner doesn't require a code.
-- A code issued in the last 2 hours is reused, so reopening the screen doesn't change it.
create or replace function public.get_challenge(p_property uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  need boolean;
  existing text;
  fresh text;
begin
  if not public.is_reporter(p_property) then raise exception 'Not allowed'; end if;
  select require_code into need from properties where id = p_property;
  if not coalesce(need, false) then return null; end if;
  select code into existing from checkin_challenges
    where property_id = p_property and reporter_id = auth.uid() and created_at > now() - interval '2 hours'
    order by created_at desc limit 1;
  if existing is not null then return existing; end if;
  fresh := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into checkin_challenges (property_id, reporter_id, code) values (p_property, auth.uid(), fresh);
  return fresh;
end;
$$;
revoke all on function public.get_challenge(uuid) from public;
grant execute on function public.get_challenge(uuid) to authenticated;

-- Reporters may send what the phone knows, but never the server's judgements.
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
  );
