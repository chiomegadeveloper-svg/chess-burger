-- Run after 0094_daily_quests.sql. Existing claims remain claimed.
begin;

alter table public.cb_daily_quest_settings add column if not exists reward_cbg integer check (reward_cbg between 1 and 10000);
alter table public.cb_daily_quest_settings add column if not exists reward_cbr integer check (reward_cbr between 1 and 10000);
alter table public.cb_daily_quest_settings add column if not exists reward_tickets integer check (reward_tickets between 1 and 10);
update public.cb_daily_quest_settings set
  reward_cbg=coalesce(reward_cbg,case when reward_kind='cbg' then reward_amount else 10 end),
  reward_cbr=coalesce(reward_cbr,case when reward_kind='cbr' then reward_amount else 10 end),
  reward_tickets=coalesce(reward_tickets,case when reward_kind='arena_ticket' then least(reward_amount,10) else 1 end);
alter table public.cb_daily_quest_settings alter column reward_cbg set default 10;
alter table public.cb_daily_quest_settings alter column reward_cbr set default 10;
alter table public.cb_daily_quest_settings alter column reward_tickets set default 1;
alter table public.cb_daily_quest_settings alter column reward_cbg set not null;
alter table public.cb_daily_quest_settings alter column reward_cbr set not null;
alter table public.cb_daily_quest_settings alter column reward_tickets set not null;

alter table public.cb_daily_quests add column if not exists reward_cbg integer check (reward_cbg between 1 and 10000);
alter table public.cb_daily_quests add column if not exists reward_cbr integer check (reward_cbr between 1 and 10000);
alter table public.cb_daily_quests add column if not exists reward_tickets integer check (reward_tickets between 1 and 10);
alter table public.cb_daily_quests add column if not exists reward_combo_legacy boolean not null default false;
update public.cb_daily_quests set reward_combo_legacy=true where claimed_at is not null and reward_cbg is null;
update public.cb_daily_quests set
  reward_cbg=coalesce(reward_cbg,case when reward_kind='cbg' then reward_amount else (select reward_cbg from public.cb_daily_quest_settings where id=true) end),
  reward_cbr=coalesce(reward_cbr,case when reward_kind='cbr' then reward_amount else (select reward_cbr from public.cb_daily_quest_settings where id=true) end),
  reward_tickets=coalesce(reward_tickets,case when reward_kind='arena_ticket' then least(reward_amount,10) else (select reward_tickets from public.cb_daily_quest_settings where id=true) end);
alter table public.cb_daily_quests alter column reward_cbg set not null;
alter table public.cb_daily_quests alter column reward_cbr set not null;
alter table public.cb_daily_quests alter column reward_tickets set not null;

create or replace function public.cb_claim_daily_quest(p_user_id uuid,p_day date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_quest public.cb_daily_quests%rowtype; v_progress jsonb; v_key text;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if p_day<>(now() at time zone 'Asia/Manila')::date then raise exception 'This quest has expired'; end if;
  select * into v_quest from public.cb_daily_quests where user_id=p_user_id and quest_day=p_day for update;
  if not found then raise exception 'Open Daily Quest to receive your tasks first'; end if;
  if v_quest.claimed_at is not null then return jsonb_build_object('claimed',false,'already_claimed',true); end if;
  v_progress:=public.cb_daily_quest_progress(p_user_id,p_day);
  for v_key in select jsonb_object_keys(v_quest.targets) loop
    if v_key<>'arena' and coalesce((v_progress->>v_key)::integer,0)<(v_quest.targets->>v_key)::integer then
      raise exception 'Finish every required Daily Quest task first';
    end if;
  end loop;
  -- All three grants, ledger records, and the claim marker commit together.
  update public.cb_profiles set gold_points=gold_points+v_quest.reward_cbg,cbr=cbr+v_quest.reward_cbr
    where user_id=p_user_id;
  if not found then raise exception 'Player profile not found'; end if;
  insert into public.cb_gold_ledger(id,user_id,delta,kind)
    values('daily-quest:'||p_day||':'||p_user_id,p_user_id,v_quest.reward_cbg,'daily_quest');
  insert into public.cb_cbr_ledger(id,user_id,delta,kind)
    values('daily-quest:'||p_day||':'||p_user_id,p_user_id,v_quest.reward_cbr,'daily_quest');
  insert into public.cb_arena_tickets(user_id,quantity) values(p_user_id,v_quest.reward_tickets)
    on conflict(user_id) do update set quantity=cb_arena_tickets.quantity+excluded.quantity,updated_at=now();
  update public.cb_daily_quests set claimed_at=now() where user_id=p_user_id and quest_day=p_day;
  return jsonb_build_object('claimed',true,'cbg',v_quest.reward_cbg,'cbr',v_quest.reward_cbr,'tickets',v_quest.reward_tickets);
end $$;
revoke all on function public.cb_claim_daily_quest(uuid,date) from public,anon,authenticated;
grant execute on function public.cb_claim_daily_quest(uuid,date) to service_role;
commit;
