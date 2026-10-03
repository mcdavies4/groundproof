-- Groundproof billing: prepaid plans + check-in credits (Flutterwave)

alter table public.properties
  add column plan text not null default 'none' check (plan in ('none', 'watch', 'build')),
  add column plan_expires_at timestamptz,
  add column check_credits int not null default 1 check (check_credits >= 0);  -- 1 = free first check-in

alter table public.checkins
  add column paid_by text check (paid_by in ('anchor', 'plan', 'credit'));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tx_ref text not null unique,
  user_id uuid not null references auth.users(id),
  property_id uuid not null references public.properties(id) on delete cascade,
  product text not null check (product in ('pack3', 'watch_30', 'build_30', 'build_365')),
  amount_ngn int not null check (amount_ngn > 0),
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed')),
  flw_transaction_id bigint,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.payments (property_id, created_at desc);

alter table public.payments enable row level security;
create policy "owners read their payments" on public.payments
  for select to authenticated using (user_id = auth.uid());

-- Watch plan allowance: check-ins per rolling 30 days
create or replace function public.watch_allowance() returns int
language sql immutable as $$ select 5 $$;

-- Why a non-anchor check-in can't happen right now (null = allowed). Used by the app before the camera opens.
create or replace function public.checkin_block_reason(pid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  p properties%rowtype;
  used int;
begin
  if not public.is_member(pid) then return 'You are not on this property.'; end if;
  select * into p from properties where id = pid;
  if p.anchored_at is null then return null; end if;  -- anchor visit is always free
  if p.plan = 'build' and p.plan_expires_at > now() then return null; end if;
  if p.plan = 'watch' and p.plan_expires_at > now() then
    select count(*) into used from checkins
     where property_id = pid and paid_by = 'plan' and server_time > now() - interval '30 days';
    if used < public.watch_allowance() then return null; end if;
  end if;
  if p.check_credits > 0 then return null; end if;
  return 'No check-ins left on this property. Ask the owner to top up.';
end;
$$;
grant execute on function public.checkin_block_reason(uuid) to authenticated;

-- Enforce and consume entitlement on every check-in insert (atomic, server-side)
create or replace function public.checkins_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p properties%rowtype;
  used int;
begin
  select * into p from properties where id = new.property_id for update;

  if new.is_anchor then
    if p.anchored_at is not null then
      raise exception 'ALREADY_ANCHORED: This property is already anchored.';
    end if;
    new.paid_by := 'anchor';
    return new;
  end if;

  if p.anchored_at is null then
    raise exception 'NOT_ANCHORED: Do the anchor visit first.';
  end if;

  if p.plan = 'build' and p.plan_expires_at > now() then
    new.paid_by := 'plan';
    return new;
  end if;

  if p.plan = 'watch' and p.plan_expires_at > now() then
    select count(*) into used from checkins
     where property_id = p.id and paid_by = 'plan' and server_time > now() - interval '30 days';
    if used < public.watch_allowance() then
      new.paid_by := 'plan';
      return new;
    end if;
  end if;

  if p.check_credits > 0 then
    update properties set check_credits = check_credits - 1 where id = p.id;
    new.paid_by := 'credit';
    return new;
  end if;

  raise exception 'NO_CHECKINS_LEFT: No check-ins left on this property. Ask the owner to top up.';
end;
$$;

create trigger checkins_entitlement
  before insert on public.checkins
  for each row execute function public.checkins_entitlement();

-- Apply a verified payment exactly once. Called only by edge functions (service role).
create or replace function public.apply_payment(p_tx_ref text, p_flw_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  pay payments%rowtype;
  days int;
  new_plan text;
begin
  select * into pay from payments where tx_ref = p_tx_ref for update;
  if not found then raise exception 'Unknown tx_ref %', p_tx_ref; end if;
  if pay.status = 'successful' then return false; end if;  -- already applied

  update payments set status = 'successful', flw_transaction_id = p_flw_id, paid_at = now() where id = pay.id;

  if pay.product = 'pack3' then
    update properties set check_credits = check_credits + 3 where id = pay.property_id;
    return true;
  end if;

  new_plan := case when pay.product = 'watch_30' then 'watch' else 'build' end;
  days := case when pay.product = 'build_365' then 365 else 30 end;

  -- Same plan still active: extend. Otherwise start the new period now.
  update properties
     set plan = new_plan,
         plan_expires_at = (case when plan = new_plan and plan_expires_at > now() then plan_expires_at else now() end)
                           + make_interval(days => days)
   where id = pay.property_id;
  return true;
end;
$$;
revoke all on function public.apply_payment(text, bigint) from public, anon, authenticated;
grant execute on function public.apply_payment(text, bigint) to service_role;
