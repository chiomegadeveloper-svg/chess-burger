begin;

create table if not exists public.cb_daily_login_claims (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  claim_date date not null,
  cycle_day smallint not null check (cycle_day between 1 and 7),
  reward_kind text not null check (reward_kind in ('gold','banner')),
  gold_amount integer,
  product_id text references public.cb_shop_products(id),
  rental_days smallint,
  claimed_at timestamptz not null default now(),
  primary key(user_id,claim_date)
);
alter table public.cb_daily_login_claims enable row level security;

create or replace function public.cb_daily_reward_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_today date := (now() at time zone 'Asia/Manila')::date; v_last record; v_day int; v_week int; v_seed int; v_day2 int; v_day5 int; v_day7 int; v_ids text[] := array['pastel-blush','pastel-peach','pastel-lemon','pastel-mint','pastel-sage','pastel-sky','pastel-ice','pastel-lilac','pastel-violet','pastel-coral'];
begin
  select claim_date,cycle_day into v_last from public.cb_daily_login_claims where user_id=p_user_id order by claim_date desc limit 1;
  if v_last.claim_date=v_today then v_day:=v_last.cycle_day;
  elsif v_last.claim_date=v_today-1 then v_day:=(v_last.cycle_day%7)+1;
  else v_day:=1; end if;
  v_week:=floor(extract(epoch from date_trunc('week',now() at time zone 'Asia/Manila'))/604800)::int;
  v_seed:=mod(hashtext(p_user_id::text)::bigint+2147483648,10)::int;
  v_day2:=1+mod(v_week+v_seed,10);
  v_day5:=1+mod(v_week+v_seed+3,10);
  v_day7:=1+mod(v_week+v_seed+6,10);
  return jsonb_build_object('day',v_day,'claimed_today',coalesce(v_last.claim_date=v_today,false),'rewards',jsonb_build_array(
    jsonb_build_object('day',1,'kind','gold','amount',10),
    jsonb_build_object('day',2,'kind','banner','days',3,'product_id',v_ids[v_day2],'name',(select name from public.cb_shop_products where id=v_ids[v_day2])),
    jsonb_build_object('day',3,'kind','gold','amount',18),jsonb_build_object('day',4,'kind','gold','amount',18),
    jsonb_build_object('day',5,'kind','banner','days',3,'product_id',v_ids[v_day5],'name',(select name from public.cb_shop_products where id=v_ids[v_day5])),
    jsonb_build_object('day',6,'kind','gold','amount',18),
    jsonb_build_object('day',7,'kind','banner','days',5,'product_id',v_ids[v_day7],'name',(select name from public.cb_shop_products where id=v_ids[v_day7]))));
end $$;

create or replace function public.cb_claim_daily_reward(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_status jsonb; v_day int; v_today date := (now() at time zone 'Asia/Manila')::date; v_reward jsonb; v_kind text; v_gold int; v_product text; v_days int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  v_status:=public.cb_daily_reward_status(p_user_id);
  if (v_status->>'claimed_today')::boolean then raise exception 'Today''s reward is already claimed'; end if;
  v_day:=(v_status->>'day')::int; v_reward:=v_status->'rewards'->(v_day-1); v_kind:=v_reward->>'kind';
  if v_kind='gold' then
    v_gold:=(v_reward->>'amount')::int;
    insert into public.cb_gold_ledger(id,user_id,delta,kind) values('daily-login:'||p_user_id||':'||v_today,p_user_id,v_gold,'daily_login');
    update public.cb_profiles set gold_points=gold_points+v_gold where user_id=p_user_id;
  else
    v_product:=v_reward->>'product_id';v_days:=(v_reward->>'days')::int;
    insert into public.cb_user_items(user_id,product_id,purchased_at,expires_at) values(p_user_id,v_product,now(),now()+make_interval(days=>v_days))
    on conflict(user_id,product_id) do update set purchased_at=now(),expires_at=greatest(now(),cb_user_items.expires_at)+make_interval(days=>v_days);
  end if;
  insert into public.cb_daily_login_claims(user_id,claim_date,cycle_day,reward_kind,gold_amount,product_id,rental_days)
  values(p_user_id,v_today,v_day,v_kind,v_gold,v_product,v_days);
  return jsonb_build_object('day',v_day,'claimed_today',true,'rewards',v_status->'rewards','reward',v_reward);
end $$;

revoke all on function public.cb_daily_reward_status(uuid) from public,anon,authenticated;
revoke all on function public.cb_claim_daily_reward(uuid) from public,anon,authenticated;
grant execute on function public.cb_daily_reward_status(uuid) to service_role;
grant execute on function public.cb_claim_daily_reward(uuid) to service_role;
commit;
