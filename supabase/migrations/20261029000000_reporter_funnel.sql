-- Reporter onboarding nudges: when each applicant was approved, and which reminder emails they've had.

alter table public.reporter_applications add column if not exists approved_at timestamptz;
update public.reporter_applications set approved_at = now() where status = 'approved' and approved_at is null;

-- One row per approved reporter and step; the primary key means each reminder goes once.
create table if not exists public.reporter_nudges (
  email text not null,
  stage text not null check (stage in ('approved', 'signed_in', 'profile', 'matched', 'joined')),
  sent_at timestamptz not null default now(),
  auto boolean not null default false,
  primary key (email, stage)
);
alter table public.reporter_nudges enable row level security;
-- No policies: only the service role (edge functions) reads or writes it.
