-- Satellite change check: an owner-triggered, advisory look at Sentinel-2 imagery around the property.
-- It never changes a check-in verdict. One run per property per day, enforced by the edge function.
alter table public.properties
  add column satellite_result jsonb,
  add column satellite_checked_at timestamptz;
