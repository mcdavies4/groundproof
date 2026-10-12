-- Pilot funnel: nudges sent to owners who've stalled at a step (by Emeka from the admin page, or automatically).
-- One row per owner per step; service role only.
create table if not exists public.pilot_nudges (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('signed_up', 'added', 'reporter', 'anchored')),
  sent_at timestamptz not null default now(),
  auto boolean not null default false,
  primary key (user_id, stage)
);
alter table public.pilot_nudges enable row level security;
