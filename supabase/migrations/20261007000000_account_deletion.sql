-- Account deletion (required by Google Play). Deleting a user removes their own properties
-- (with photos, check-ins and stages) and their memberships. Check-ins they made on someone
-- else's property and payment records are kept, unlinked from the deleted user.

alter table public.checkins alter column reporter_id drop not null;
alter table public.checkins drop constraint checkins_reporter_id_fkey;
alter table public.checkins add constraint checkins_reporter_id_fkey
  foreign key (reporter_id) references auth.users(id) on delete set null;

alter table public.payments alter column user_id drop not null;
alter table public.payments drop constraint payments_user_id_fkey;
alter table public.payments add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.invites alter column created_by drop not null;
alter table public.invites drop constraint invites_created_by_fkey;
alter table public.invites add constraint invites_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.invites drop constraint invites_used_by_fkey;
alter table public.invites add constraint invites_used_by_fkey
  foreign key (used_by) references auth.users(id) on delete set null;
