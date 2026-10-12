-- 1. Estate plan: the developer pays once for the whole estate (per unit, per month); every unit's visits are covered.
-- 2. Independent checks: a buyer on an estate unit can have a Groundproof reporter (not the developer's) visit their unit.
--    The buyer pays the reporter; Groundproof's checks come from the buyer's own independent-check credits
--    (free while matched visits are free in the pilot). Never the developer's plan.

alter table public.estates add column if not exists plan_units int, add column if not exists plan_expires_at timestamptz;

insert into public.app_settings (key, value) values ('estate_unit_price_ngn', '2000') on conflict do nothing;
create or replace function public.estate_unit_price() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from app_settings where key = 'estate_unit_price_ngn'), 2000);
$$;

create or replace function public.estate_plan_active(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from estates where id = eid and plan_expires_at > now());
$$;

-- Payments can now be for an estate, and for a buyer's independent checks.
alter table public.payments alter column property_id drop not null;
alter table public.payments add column if not exists estate_id uuid references public.estates(id) on delete cascade;
alter table public.payments add column if not exists units int;
alter table public.payments drop constraint if exists payments_product_check;
alter table public.payments add constraint payments_product_check
  check (product in ('pack3', 'watch_30', 'build_30', 'build_365', 'estate_30', 'estate_365', 'independent3'));
alter table public.payments drop constraint if exists payments_target_check;
alter table public.payments add constraint payments_target_check check (property_id is not null or estate_id is not null);

create table if not exists public.independent_credits (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits int not null default 0 check (credits >= 0),
  primary key (property_id, user_id)
);
alter table public.independent_credits enable row level security;
drop policy if exists "own independent credits" on public.independent_credits;
create policy "own independent credits" on public.independent_credits for select to authenticated using (user_id = auth.uid());

alter table public.matches add column if not exists kind text not null default 'owner';
alter table public.matches drop constraint if exists matches_kind_check;
alter table public.matches add constraint matches_kind_check check (kind in ('owner', 'independent'));
alter table public.matches add column if not exists buyer_id uuid references auth.users(id) on delete set null;
drop policy if exists "buyer reads own independent matches" on public.matches;
create policy "buyer reads own independent matches" on public.matches for select to authenticated using (buyer_id = auth.uid());

alter table public.ground_requests add column if not exists kind text not null default 'owner';
alter table public.ground_requests drop constraint if exists ground_requests_kind_check;
alter table public.ground_requests add constraint ground_requests_kind_check check (kind in ('owner', 'independent'));
alter table public.ground_requests add column if not exists property_id uuid references public.properties(id) on delete set null;

alter table public.checkins drop constraint if exists checkins_paid_by_check;
alter table public.checkins add constraint checkins_paid_by_check check (paid_by in ('anchor', 'plan', 'credit', 'matched', 'estate', 'buyer'));

-- The independent match for this reporter on this unit, if any.
create or replace function public.independent_match(pid uuid, rid uuid) returns public.matches
language sql stable security definer set search_path = public as $$
  select * from matches where property_id = pid and reporter_id = rid and status = 'active' and kind = 'independent' limit 1;
$$;

create or replace function public.checkins_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p properties%rowtype;
  m matches%rowtype;
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

  -- A buyer's independent reporter: the buyer covers it, never the developer.
  m := public.independent_match(p.id, new.reporter_id);
  if m.id is not null then
    if public.matched_visits_free() then
      new.paid_by := 'matched';
      return new;
    end if;
    update independent_credits set credits = credits - 1 where property_id = p.id and user_id = m.buyer_id and credits > 0;
    if found then
      new.paid_by := 'buyer';
      return new;
    end if;
    raise exception 'NO_CHECKINS_LEFT: The buyer who asked for this independent check needs to top up.';
  end if;

  -- Introduced by Groundproof: the owner pays the reporter only.
  if public.has_active_match(p.id, new.reporter_id) then
    new.paid_by := 'matched';
    return new;
  end if;

  if p.estate_id is not null and public.estate_plan_active(p.estate_id) then
    new.paid_by := 'estate';
    return new;
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

create or replace function public.checkin_block_reason(pid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  p properties%rowtype;
  m matches%rowtype;
  used int;
begin
  if not public.is_member(pid) then return 'You are not on this property.'; end if;
  select * into p from properties where id = pid;
  if p.anchored_at is null then return null; end if;
  m := public.independent_match(pid, auth.uid());
  if m.id is not null then
    if public.matched_visits_free() then return null; end if;
    if exists (select 1 from independent_credits where property_id = pid and user_id = m.buyer_id and credits > 0) then return null; end if;
    return 'The buyer who asked for this independent check needs to top up.';
  end if;
  if public.has_active_match(pid, auth.uid()) then return null; end if;
  if p.estate_id is not null and public.estate_plan_active(p.estate_id) then return null; end if;
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

create or replace function public.apply_payment(p_tx_ref text, p_provider_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  pay payments%rowtype;
  days int;
  new_plan text;
begin
  select * into pay from payments where tx_ref = p_tx_ref for update;
  if not found then raise exception 'Unknown tx_ref %', p_tx_ref; end if;
  if pay.status = 'successful' then return false; end if;  -- already applied

  update payments set status = 'successful', provider_txn_id = p_provider_id, paid_at = now() where id = pay.id;

  if pay.product in ('estate_30', 'estate_365') then
    days := case when pay.product = 'estate_365' then 365 else 30 end;
    update estates
       set plan_units = pay.units,
           plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + make_interval(days => days)
     where id = pay.estate_id;
    return true;
  end if;

  if pay.product = 'independent3' then
    insert into independent_credits (property_id, user_id, credits) values (pay.property_id, pay.user_id, 3)
    on conflict (property_id, user_id) do update set credits = independent_credits.credits + 3;
    return true;
  end if;

  if pay.product = 'pack3' then
    update properties set check_credits = check_credits + 3 where id = pay.property_id;
    return true;
  end if;

  new_plan := case when pay.product = 'watch_30' then 'watch' else 'build' end;
  days := case when pay.product = 'build_365' then 365 else 30 end;

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
