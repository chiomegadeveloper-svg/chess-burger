begin;

create table if not exists public.cb_daily_reward_config (
  day smallint primary key check (day between 1 and 7),
  reward_kind text not null check (reward_kind in ('gold','arena_ticket','banner','bag_slot')),
  amount integer not null check (amount between 1 and 10000),
  product_id text references public.cb_shop_products(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.cb_profiles(user_id)
);
alter table public.cb_daily_reward_config enable row level security;
revoke all on public.cb_daily_reward_config from public,anon,authenticated;

insert into public.cb_daily_reward_config(day,reward_kind,amount,product_id) values
  (1,'gold',10,null),(2,'banner',3,'pastel-blush'),(3,'gold',18,null),(4,'gold',18,null),
  (5,'banner',3,'pastel-mint'),(6,'gold',18,null),(7,'banner',5,'pastel-violet')
on conflict(day) do nothing;

alter table public.cb_daily_login_claims drop constraint if exists cb_daily_login_claims_reward_kind_check;
alter table public.cb_daily_login_claims add constraint cb_daily_login_claims_reward_kind_check check (reward_kind in ('gold','arena_ticket','banner','bag_slot'));

create or replace function public.cb_daily_reward_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_today date := ((now() at time zone 'Asia/Manila') - interval '1 minute')::date; v_last record; v_day int; v_rewards jsonb;
begin
  select claim_date,cycle_day into v_last from public.cb_daily_login_claims where user_id=p_user_id order by claim_date desc limit 1;
  if v_last.claim_date=v_today then v_day:=v_last.cycle_day;
  elsif v_last.claim_date=v_today-1 then v_day:=(v_last.cycle_day%7)+1;
  else v_day:=1; end if;
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'day',c.day,'kind',c.reward_kind,'amount',c.amount,
    'days',case when c.reward_kind='banner' then c.amount end,
    'product_id',c.product_id,'name',p.name
  )) order by c.day) into v_rewards
  from public.cb_daily_reward_config c left join public.cb_shop_products p on p.id=c.product_id;
  return jsonb_build_object('day',v_day,'claimed_today',coalesce(v_last.claim_date=v_today,false),'rewards',coalesce(v_rewards,'[]'::jsonb));
end $$;

create or replace function public.cb_claim_daily_reward(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_status jsonb; v_day int; v_today date := ((now() at time zone 'Asia/Manila') - interval '1 minute')::date; v_reward jsonb; v_kind text; v_amount int; v_product text;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  v_status:=public.cb_daily_reward_status(p_user_id);
  if (v_status->>'claimed_today')::boolean then raise exception 'Today''s reward is already claimed'; end if;
  v_day:=(v_status->>'day')::int; v_reward:=v_status->'rewards'->(v_day-1); v_kind:=v_reward->>'kind'; v_amount:=(v_reward->>'amount')::int; v_product:=v_reward->>'product_id';
  if v_kind='gold' then
    insert into public.cb_gold_ledger(id,user_id,delta,kind) values('daily-login:'||p_user_id||':'||v_today,p_user_id,v_amount,'daily_login');
    update public.cb_profiles set gold_points=gold_points+v_amount where user_id=p_user_id;
  elsif v_kind='arena_ticket' then
    insert into public.cb_arena_tickets(user_id,quantity) values(p_user_id,v_amount)
    on conflict(user_id) do update set quantity=cb_arena_tickets.quantity+excluded.quantity,updated_at=now();
  elsif v_kind='banner' then
    if v_product is null then raise exception 'Choose a Feed Banner product for this reward'; end if;
    insert into public.cb_user_items(user_id,product_id,purchased_at,expires_at) values(p_user_id,v_product,now(),now()+make_interval(days=>v_amount))
    on conflict(user_id,product_id) do update set purchased_at=now(),expires_at=greatest(now(),cb_user_items.expires_at)+make_interval(days=>v_amount);
  elsif v_kind='bag_slot' then
    update public.cb_profiles set bag_slots=least(10000,bag_slots+v_amount) where user_id=p_user_id;
  else raise exception 'Unsupported daily reward category'; end if;
  insert into public.cb_daily_login_claims(user_id,claim_date,cycle_day,reward_kind,gold_amount,product_id,rental_days)
  values(p_user_id,v_today,v_day,v_kind,case when v_kind='gold' then v_amount end,v_product,case when v_kind='banner' then v_amount end);
  return jsonb_build_object('day',v_day,'claimed_today',true,'rewards',v_status->'rewards','reward',v_reward);
end $$;

create or replace function public.cb_save_daily_reward_config(p_owner_id uuid,p_rewards jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text; v_count int;
begin
  select role into v_role from public.cb_profiles where user_id=p_owner_id;
  if v_role is distinct from 'owner' then raise exception 'Owner only'; end if;
  if jsonb_typeof(p_rewards)<>'array' or jsonb_array_length(p_rewards)<>7 then raise exception 'Exactly 7 reward days are required'; end if;
  create temporary table tmp_daily_rewards(day smallint,reward_kind text,amount integer,product_id text) on commit drop;
  insert into tmp_daily_rewards select (x->>'day')::smallint,x->>'kind',(x->>'amount')::integer,nullif(x->>'product_id','') from jsonb_array_elements(p_rewards)x;
  select count(distinct day) into v_count from tmp_daily_rewards where day between 1 and 7 and reward_kind in ('gold','arena_ticket','banner','bag_slot') and amount between 1 and 10000;
  if v_count<>7 or exists(select 1 from tmp_daily_rewards where reward_kind='banner' and (product_id is null or not exists(select 1 from public.cb_shop_products p where p.id=tmp_daily_rewards.product_id))) then raise exception 'Invalid daily reward configuration'; end if;
  insert into public.cb_daily_reward_config(day,reward_kind,amount,product_id,updated_at,updated_by)
  select day,reward_kind,amount,case when reward_kind='banner' then product_id end,now(),p_owner_id from tmp_daily_rewards
  on conflict(day) do update set reward_kind=excluded.reward_kind,amount=excluded.amount,product_id=excluded.product_id,updated_at=now(),updated_by=p_owner_id;
  return public.cb_daily_reward_status(p_owner_id)->'rewards';
end $$;

revoke all on function public.cb_daily_reward_status(uuid) from public,anon,authenticated;
revoke all on function public.cb_claim_daily_reward(uuid) from public,anon,authenticated;
revoke all on function public.cb_save_daily_reward_config(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cb_daily_reward_status(uuid) to service_role;
grant execute on function public.cb_claim_daily_reward(uuid) to service_role;
grant execute on function public.cb_save_daily_reward_config(uuid,jsonb) to service_role;
commit;
