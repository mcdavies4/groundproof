-- Referral credits: an owner's invite link. When the friend's first verified visit lands, both get 3 free check-ins.
-- Feedback: one short survey per owner after their 3rd verified visit.

create table public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
create table public.referrals (
  referred_id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  referred_property_id uuid references public.properties(id) on delete set null,
  referrer_property_id uuid references public.properties(id) on delete set null,
  referrer_pending int not null default 0,   -- credits waiting for a referrer with no property yet
  referrer_capped boolean not null default false,
  notified_at timestamptz,
  check (referrer_id <> referred_id)
);
create index on public.referrals (referrer_id);
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
create policy "own code" on public.referral_codes for select to authenticated using (user_id = auth.uid());
create policy "own referrals" on public.referrals for select to authenticated using (referrer_id = auth.uid() or referred_id = auth.uid());

-- The user's code, made on first use. Short, no look-alike characters.
create or replace function public.referral_code_for(uid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text; alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789'; i int;
begin
  select code into c from referral_codes where user_id = uid;
  if c is not null then return c; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    begin
      insert into referral_codes (user_id, code) values (uid, c);
      return c;
    exception when unique_violation then
      select code into c from referral_codes where user_id = uid;   -- raced with ourselves
      if c is not null then return c; end if;
    end;
  end loop;
end $$;
revoke all on function public.referral_code_for(uuid) from public, anon, authenticated;

create or replace function public.my_referral_code() returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return referral_code_for(auth.uid());
end $$;
grant execute on function public.my_referral_code() to authenticated;

create or replace function public.my_referral_stats(out joined int, out rewarded int) 
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(rewarded_at)::int from referrals where referrer_id = auth.uid();
$$;
grant execute on function public.my_referral_stats() to authenticated;

-- New account with a ?ref code in its sign-up data: remember who sent them. Never blocks a sign-up.
create or replace function public.claim_referral() returns trigger
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  begin
    select user_id into r from public.referral_codes where code = lower(nullif(trim(new.raw_user_meta_data->>'ref'), ''));
    if r is not null and r <> new.id then
      insert into public.referrals (referred_id, referrer_id) values (new.id, r) on conflict do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists on_auth_user_referral on auth.users;
create trigger on_auth_user_referral after insert on auth.users for each row execute function public.claim_referral();

-- The friend's first verified visit (not the anchor) pays out. Referrers earn on up to 10 friends.
create or replace function public.reward_referral() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; ref public.referrals; rp uuid; earned int;
begin
  if new.is_anchor or new.verdict <> 'verified' or old.verdict = 'verified' then return new; end if;
  select owner_id into owner from properties where id = new.property_id and estate_id is null;
  if owner is null then return new; end if;
  select * into ref from referrals where referred_id = owner and rewarded_at is null for update;
  if not found then return new; end if;

  update properties set check_credits = check_credits + 3 where id = new.property_id;
  select count(*) into earned from referrals where referrer_id = ref.referrer_id and rewarded_at is not null and not referrer_capped;
  if earned >= 10 then
    update referrals set rewarded_at = now(), referred_property_id = new.property_id, referrer_capped = true where referred_id = owner;
    return new;
  end if;
  select id into rp from properties where owner_id = ref.referrer_id and estate_id is null order by created_at desc limit 1;
  if rp is not null then update properties set check_credits = check_credits + 3 where id = rp; end if;
  update referrals set rewarded_at = now(), referred_property_id = new.property_id, referrer_property_id = rp,
    referrer_pending = case when rp is null then 3 else 0 end
  where referred_id = owner;
  return new;
end $$;
drop trigger if exists z_reward_referral on public.checkins;
create trigger z_reward_referral after update of verdict on public.checkins for each row execute function public.reward_referral();

-- A referrer who'd earned credits before adding a property gets them on their first one.
create or replace function public.apply_pending_referral_credits() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.estate_id is not null then return new; end if;
  update referrals set referrer_pending = 0
  where referrer_id = new.owner_id and referrer_pending > 0;
  get diagnostics n = row_count;
  if n > 0 then new.check_credits := new.check_credits + 3 * n; end if;
  return new;
end $$;
drop trigger if exists apply_pending_referral_credits on public.properties;
create trigger apply_pending_referral_credits before insert on public.properties for each row execute function public.apply_pending_referral_credits();

-- Feedback. The id is the link token in the email.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  score int check (score between 0 and 10),
  useful text,
  improve text,
  quote_ok boolean not null default false,
  quote_name text,
  answered_at timestamptz
);
alter table public.feedback enable row level security;

create or replace function public.get_feedback(p_id uuid, out score int, out answered boolean, out quote_ok boolean)
language sql stable security definer set search_path = public as $$
  select f.score, f.useful is not null or f.improve is not null, f.quote_ok from feedback f where f.id = p_id;
$$;
create or replace function public.submit_feedback(p_id uuid, p_score int, p_useful text default null, p_improve text default null,
  p_quote_ok boolean default null, p_quote_name text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update feedback set
    score = coalesce(case when p_score between 0 and 10 then p_score end, score),
    useful = coalesce(left(nullif(trim(p_useful), ''), 1000), useful),
    improve = coalesce(left(nullif(trim(p_improve), ''), 1000), improve),
    quote_ok = coalesce(p_quote_ok, quote_ok),
    quote_name = coalesce(left(nullif(trim(p_quote_name), ''), 80), quote_name),
    answered_at = now()
  where id = p_id;
  return found;
end $$;
grant execute on function public.get_feedback(uuid) to anon, authenticated;
grant execute on function public.submit_feedback(uuid, int, text, text, boolean, text) to anon, authenticated;

grant execute on function public.referral_code_for(uuid) to service_role;
