-- Approved reporter applicants can set up their profile and prices straight away,
-- before they've joined any property. Matched by the email they applied with.

create or replace function public.is_approved_applicant() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reporter_applications
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and status = 'approved'
  );
$$;

-- Used by the profile insert policy.
create or replace function public.is_any_reporter() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from property_members where user_id = auth.uid() and role = 'reporter')
      or public.is_approved_applicant();
$$;

grant execute on function public.is_any_reporter() to authenticated;

-- What they told us when applying, to pre-fill their profile.
create or replace function public.my_reporter_application()
returns table (name text, state text, areas text)
language sql stable security definer set search_path = public as $$
  select name, state, areas from reporter_applications
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and status = 'approved'
   order by created_at desc limit 1;
$$;
grant execute on function public.my_reporter_application() to authenticated;
