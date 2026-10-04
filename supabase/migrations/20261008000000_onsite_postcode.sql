-- Find the postcode on site, and anchor by coordinates when NIPOST has no building yet.

-- A property can start without a postcode; the reporter finds it at the anchor visit.
alter table public.properties alter column postcode drop not null;
alter table public.properties
  add column anchor_mode text check (anchor_mode in ('postcode', 'coordinates')),
  add column nipost_suggested_postcode text;   -- NIPOST later lists a building at a coordinates-anchored spot

-- What the reporter chose at the anchor visit (a claim; verify-checkin checks it against NIPOST).
alter table public.checkins
  add column anchor_choice text check (anchor_choice in ('postcode', 'coordinates')),
  add column claimed_postcode text check (claimed_postcode is null or claimed_postcode ~ '^[A-Z]{2}-[0-9]{2}-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}$'),
  add column match_type text check (match_type in ('postcode', 'coordinates')),
  add column distance_from_anchor_m real;

-- Existing anchored properties were anchored by postcode.
update public.properties set anchor_mode = 'postcode' where anchored_at is not null and anchor_mode is null;

-- Reporters still can't write any server judgement fields.
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
  );

-- Owners can rename a property but not rewrite how it was anchored.
drop policy "owner renames property" on public.properties;
create policy "owner renames property" on public.properties
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

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
       or new.owner_id is distinct from old.owner_id then
      raise exception 'Only the property name can be changed here.';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_property_anchor before update on public.properties
  for each row execute function public.protect_property_anchor();
