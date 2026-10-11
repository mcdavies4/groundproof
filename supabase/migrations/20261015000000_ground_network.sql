-- "No one on the ground? We'll find someone."
-- Owners without a trusted person ask us to find one; people in Nigeria apply to do paid visits.
-- Both are written only by the submit-lead edge function (service role) and read on the admin dashboard.

create table public.ground_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) <= 30),
  state text not null check (char_length(state) <= 40),
  area text not null check (char_length(area) between 1 and 120),
  property_type text not null check (property_type in ('building', 'completed', 'land', 'rental')),
  frequency text not null check (frequency in ('once', 'monthly', 'fortnightly', 'weekly')),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'matched', 'closed')),
  created_at timestamptz not null default now()
);

create table public.reporter_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null check (char_length(phone) between 5 and 30),
  state text not null check (char_length(state) <= 40),
  areas text not null check (char_length(areas) between 1 and 300),
  occupation text not null check (occupation in ('surveyor', 'agent', 'builder', 'corps_member', 'student', 'other')),
  android boolean not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'approved', 'declined')),
  created_at timestamptz not null default now()
);

alter table public.ground_requests enable row level security;
alter table public.reporter_applications enable row level security;
