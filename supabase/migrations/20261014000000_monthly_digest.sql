-- Monthly progress email: one row per property per month, so a summary is never sent twice
-- even if the scheduled job runs again. Only the monthly-digest edge function (service role) touches it.
create table public.digest_log (
  property_id uuid not null references public.properties(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  sent_at timestamptz not null default now(),
  recipients int not null default 0,
  primary key (property_id, month)
);
alter table public.digest_log enable row level security;
