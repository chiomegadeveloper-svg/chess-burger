-- Guild members earn one chest CBG for every positive CBR gained.
-- Entrance donations and past distributions remain independent transactions.
-- Safe to rerun: historical CBR events have stable ledger IDs.
begin;

drop trigger if exists cb_guild_win_on_gold_ledger on public.cb_gold_ledger;

create or replace function public.cb_guild_log_cbr() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_guild uuid; v_activity_id bigint; v_amount integer;
begin
 v_amount:=new.cbr-old.cbr;
 if v_amount<=0 then return new; end if;
 select guild_id into v_guild from public.cb_guild_members where user_id=new.user_id;
 if v_guild is null then return new; end if;
 insert into public.cb_guild_activity(guild_id,actor_id,kind,amount)
 values(v_guild,new.user_id,'cbr',v_amount) returning id into v_activity_id;
 insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind)
 values('guild-cbr:'||v_activity_id,v_guild,new.user_id,v_amount,'win');
 update public.cb_guilds set chest_cbg=chest_cbg+v_amount where id=v_guild;
 return new;
end $$;

-- Credit CBR gains that were recorded before this migration, including gains
-- made by a member who has since left. The original guild receives the CBG.
with credited as (
 insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,created_at)
 select 'guild-cbr:'||a.id,a.guild_id,a.actor_id,a.amount,'win',a.created_at
 from public.cb_guild_activity a
 where a.kind='cbr' and a.amount>0
 on conflict(id) do nothing
 returning guild_id,amount
), totals as (
 select guild_id,sum(amount) as amount from credited group by guild_id
)
update public.cb_guilds g set chest_cbg=g.chest_cbg+t.amount
from totals t where g.id=t.guild_id;

commit;
