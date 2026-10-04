-- Apply after 0096. Registration referral rewards use Asia/Manila calendar weeks.
begin;

create table if not exists public.cb_referral_codes (
 user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
 code text not null unique check(code ~ '^CB[A-F0-9]{16}$'),
 created_at timestamptz not null default now()
);
create table if not exists public.cb_referral_claims (
 -- Keep the audit record even if either account is later deleted.
 new_user_id uuid primary key,
 referrer_id uuid not null,
 week_start date not null,
 reward_cbg integer not null default 100 check(reward_cbg=100),
 created_at timestamptz not null default now(),
 check(referrer_id<>new_user_id)
);
create index if not exists cb_referral_claims_week_idx on public.cb_referral_claims(referrer_id,week_start);
alter table public.cb_referral_codes enable row level security;
alter table public.cb_referral_claims enable row level security;
revoke all on public.cb_referral_codes,public.cb_referral_claims from anon,authenticated;
grant all on public.cb_referral_codes,public.cb_referral_claims to service_role;

create or replace function public.cb_referral_status(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_code text;v_week date:=date_trunc('week',now() at time zone 'Asia/Manila')::date;v_used integer;
begin
 if auth.role()<>'service_role' then raise exception 'Server access required';end if;
 if not exists(select 1 from public.cb_profiles where user_id=p_user_id) then raise exception 'Complete registration first';end if;
 insert into public.cb_referral_codes(user_id,code)
 values(p_user_id,'CB'||upper(left(replace(p_user_id::text,'-',''),16)))
 on conflict(user_id) do nothing;
 select code into v_code from public.cb_referral_codes where user_id=p_user_id;
 select count(*) into v_used from public.cb_referral_claims where referrer_id=p_user_id and week_start=v_week;
 return jsonb_build_object('code',v_code,'week_used',v_used,'week_limit',5,'week_start',v_week);
end $$;

create or replace function public.cb_referral_check(p_new_user_id uuid,p_code text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_referrer uuid;v_week date:=date_trunc('week',now() at time zone 'Asia/Manila')::date;
begin
 if auth.role()<>'service_role' then raise exception 'Server access required';end if;
 select user_id into v_referrer from public.cb_referral_codes where code=upper(btrim(p_code));
 if v_referrer is null then raise exception 'Referral code was not found';end if;
 if v_referrer=p_new_user_id then raise exception 'You cannot use your own referral code';end if;
 if (select count(*) from public.cb_referral_claims where referrer_id=v_referrer and week_start=v_week)>=5 then
  raise exception 'This referral code has reached its five rewards for the week';
 end if;
 return v_referrer;
end $$;

create or replace function public.cb_referral_claim(p_new_user_id uuid,p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_referrer uuid;v_week date:=date_trunc('week',now() at time zone 'Asia/Manila')::date;v_existing uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Server access required';end if;
 select referrer_id into v_existing from public.cb_referral_claims where new_user_id=p_new_user_id;
 if v_existing is not null then return jsonb_build_object('awarded',false,'already_claimed',true);end if;
 select user_id into v_referrer from public.cb_referral_codes where code=upper(btrim(p_code));
 if v_referrer is null then raise exception 'Referral code was not found';end if;
 if v_referrer=p_new_user_id then raise exception 'You cannot use your own referral code';end if;
 if not exists(select 1 from public.cb_profiles p join public.cb_profile_birthdays b on b.user_id=p.user_id
   where p.user_id=p_new_user_id and p.avatar_url like '%/cb-profile-media/'||p_new_user_id::text||'/avatar-%.webp'
   and b.birthdate is not null and length(btrim(p.display_name))>0) then
  raise exception 'New player registration is incomplete';
 end if;
 -- Serialize the cap for simultaneous registrations using the same code.
 perform 1 from public.cb_profiles where user_id=v_referrer for update;
 if not found then raise exception 'Referrer profile was not found';end if;
 select referrer_id into v_existing from public.cb_referral_claims where new_user_id=p_new_user_id;
 if v_existing is not null then return jsonb_build_object('awarded',false,'already_claimed',true);end if;
 if (select count(*) from public.cb_referral_claims where referrer_id=v_referrer and week_start=v_week)>=5 then
  raise exception 'This referral code has reached its five rewards for the week';
 end if;
 insert into public.cb_referral_claims(new_user_id,referrer_id,week_start)
 values(p_new_user_id,v_referrer,v_week);
 update public.cb_profiles set gold_points=gold_points+100 where user_id=v_referrer;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('referral:'||p_new_user_id::text,v_referrer,100,'referral',p_new_user_id);
 return jsonb_build_object('awarded',true,'referrer_id',v_referrer,'week_start',v_week);
end $$;

revoke all on function public.cb_referral_status(uuid),public.cb_referral_check(uuid,text),public.cb_referral_claim(uuid,text) from public,anon,authenticated;
grant execute on function public.cb_referral_status(uuid),public.cb_referral_check(uuid,text),public.cb_referral_claim(uuid,text) to service_role;
commit;
