-- Payment stages: each property chooses its own currency.
alter table public.properties
  add column payment_currency text not null default 'NGN'
  check (payment_currency in ('NGN', 'GBP', 'USD', 'EUR', 'CAD'));

-- Amounts entered so far were labelled in pounds; keep their meaning.
update public.properties p set payment_currency = 'GBP'
 where exists (select 1 from public.milestones m where m.property_id = p.id and m.amount_gbp is not null);

alter table public.milestones rename column amount_gbp to amount;
alter table public.milestones alter column amount type numeric(14,2);
