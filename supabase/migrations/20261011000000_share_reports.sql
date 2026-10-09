-- Shareable read-only property reports. The owner creates or revokes a link; anyone with it can view the report.
alter table public.properties add column share_token text unique
  check (share_token is null or share_token ~ '^[A-Za-z0-9_-]{20,64}$');
