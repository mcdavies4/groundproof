-- Onboarding nudges for owners who stall, plus per-user email settings.

-- One row per property per nudge, so each is sent at most once.
create table public.nudge_log (
  property_id uuid not null references public.properties(id) on delete cascade,
  kind text not null check (kind in ('invite', 'anchor', 'first_visit')),
  sent_at timestamptz not null default now(),
  primary key (property_id, kind)
);
alter table public.nudge_log enable row level security;   -- service role only

-- Email settings. No row = everything on.
create table public.email_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tips boolean not null default true,      -- onboarding nudges
  digest boolean not null default true,    -- monthly summary
  updated_at timestamptz not null default now()
);
alter table public.email_prefs enable row level security;
create policy "own email prefs read" on public.email_prefs for select to authenticated using (user_id = auth.uid());
create policy "own email prefs insert" on public.email_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "own email prefs update" on public.email_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
