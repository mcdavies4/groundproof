-- Pilot: 5 free check-ins per property (after the free anchor visit).
alter table public.properties alter column check_credits set default 5;

-- Top up existing properties that haven't bought anything, so early users get the same deal.
update public.properties p
   set check_credits = 5
 where p.check_credits < 5
   and not exists (select 1 from public.payments pay where pay.property_id = p.id and pay.status = 'successful');
