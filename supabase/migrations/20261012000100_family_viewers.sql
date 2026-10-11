-- Family viewers, part 2.
-- An owner invites someone by email. When that person signs in with the same email,
-- the invite is claimed and they become a 'viewer' member: they can read the property,
-- check-ins, photos and report (existing is_member policies), get the email alerts,
-- and cannot change anything (every write policy needs is_owner or is_reporter).

create table public.viewer_invites (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (property_id, email)
);
create index on public.viewer_invites (email) where accepted_at is null;

alter table public.viewer_invites enable row level security;

-- Owners see who they've invited; viewers see their own row.
-- Inserts go through the invite-viewer edge function (service role), which also sends the email.
create policy "owner or invitee reads viewer invites" on public.viewer_invites
  for select to authenticated using (public.is_owner(property_id) or user_id = auth.uid());

-- Claim every pending invite for the signed-in email. Called when the dashboard loads.
create or replace function public.claim_viewer_invites() returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  n int := 0;
  inv record;
begin
  if me is null or my_email = '' then return 0; end if;

  for inv in
    select id, property_id from viewer_invites
     where email = my_email and accepted_at is null
     for update
  loop
    -- Someone who already owns or reports on the property keeps that role.
    insert into property_members (property_id, user_id, role)
    values (inv.property_id, me, 'viewer')
    on conflict (property_id, user_id) do nothing;

    update viewer_invites set user_id = me, accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.claim_viewer_invites() from public;
grant execute on function public.claim_viewer_invites() to authenticated;

-- Owner removes a viewer (or cancels a pending invite).
create or replace function public.remove_viewer(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv viewer_invites%rowtype;
begin
  select * into inv from viewer_invites where id = p_invite;
  if not found or not public.is_owner(inv.property_id) then
    raise exception 'Not allowed';
  end if;
  if inv.user_id is not null then
    delete from property_members
     where property_id = inv.property_id and user_id = inv.user_id and role = 'viewer';
  end if;
  delete from viewer_invites where id = inv.id;
end;
$$;
revoke all on function public.remove_viewer(uuid) from public;
grant execute on function public.remove_viewer(uuid) to authenticated;

-- A viewer stops watching a property.
create or replace function public.leave_property(p_property uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from property_members
   where property_id = p_property and user_id = auth.uid() and role = 'viewer';
  delete from viewer_invites
   where property_id = p_property and user_id = auth.uid();
end;
$$;
revoke all on function public.leave_property(uuid) from public;
grant execute on function public.leave_property(uuid) to authenticated;
