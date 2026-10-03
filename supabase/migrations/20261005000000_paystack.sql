-- Switch payment provider from Flutterwave to Paystack (provider-neutral column name)
alter table public.payments rename column flw_transaction_id to provider_txn_id;

drop function if exists public.apply_payment(text, bigint);

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
