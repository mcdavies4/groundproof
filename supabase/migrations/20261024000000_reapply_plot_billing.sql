-- Re-applies the plot-visit billing rule from 20261021 (matched visits use no credits).
-- Needed because 20261020_plot_visits may be applied after 20261021 with --include-all,
-- which would otherwise leave the older version of this function in place. Safe to run any time.
create or replace function public.plot_visit_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p properties%rowtype;
begin
  select * into p from properties where id = new.property_id for update;
  if p.kind <> 'plot' then raise exception 'NOT_A_PLOT: This property is a building. Use a normal check-in.'; end if;
  if public.has_active_match(p.id, new.reporter_id) then
    new.paid_by := 'matched';
  elsif p.plan in ('watch', 'build') and p.plan_expires_at > now() then
    new.paid_by := 'plan';
  elsif p.check_credits > 0 then
    update properties set check_credits = check_credits - 1 where id = p.id;
    new.paid_by := 'credit';
  else
    raise exception 'NO_CHECKINS_LEFT: No visits left on this plot. Ask the owner to top up.';
  end if;
  return new;
end;
$$;
