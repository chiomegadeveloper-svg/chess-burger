-- Apply after 0095. Members may donate only the CBG above a 48 CBG reserve.
begin;

alter table public.cb_guild_chest_ledger drop constraint if exists cb_guild_chest_ledger_kind_check;
alter table public.cb_guild_chest_ledger add constraint cb_guild_chest_ledger_kind_check
 check(kind in ('win','distribution','remainder','entrance','donation'));

create or replace function public.cb_guild_donate(p_user_id uuid,p_amount integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_guild_id uuid; v_gold integer; v_prior public.cb_guild_chest_ledger%rowtype; v_inserted text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and auth.role() is distinct from 'service_role' then
  raise exception 'Service role required';
 end if;
 if p_amount is null or p_amount<1 or p_amount>1000000 or p_request_id is null then
  raise exception 'Enter a whole donation amount';
 end if;
 select guild_id into v_guild_id from public.cb_guild_members where user_id=p_user_id;
 if v_guild_id is null then raise exception 'Join a guild before donating'; end if;
 -- Guild lock serializes membership changes, releases, and chest updates.
 perform 1 from public.cb_guilds where id=v_guild_id for update;
 if not found or not exists(select 1 from public.cb_guild_members where user_id=p_user_id and guild_id=v_guild_id) then
  raise exception 'You are no longer a member of this guild';
 end if;
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
 if v_gold is null then raise exception 'Profile not found'; end if;
 select * into v_prior from public.cb_guild_chest_ledger where id='guild-donation:'||p_request_id::text;
 if found then
  if v_prior.guild_id<>v_guild_id or v_prior.user_id<>p_user_id or v_prior.amount<>p_amount or v_prior.kind<>'donation' then
   raise exception 'Donation request ID was already used';
  end if;
  return jsonb_build_object('donated',false,'balance',v_gold);
 end if;
 if v_gold-p_amount<48 then raise exception 'Keep at least 48 CBG in your balance'; end if;
 insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,reference_id)
 values('guild-donation:'||p_request_id::text,v_guild_id,p_user_id,p_amount,'donation',p_request_id)
 on conflict (id) do nothing returning id into v_inserted;
 if v_inserted is null then raise exception 'Donation request ID was already used'; end if;
 update public.cb_profiles set gold_points=gold_points-p_amount where user_id=p_user_id;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('guild-donation:'||p_request_id::text,p_user_id,-p_amount,'guild_donation',v_guild_id);
 update public.cb_guilds set chest_cbg=chest_cbg+p_amount where id=v_guild_id;
 insert into public.cb_guild_activity(guild_id,actor_id,kind,amount)
 values(v_guild_id,p_user_id,'donation',p_amount);
 return jsonb_build_object('donated',true,'balance',v_gold-p_amount);
end $$;

revoke all on function public.cb_guild_donate(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_guild_donate(uuid,integer,uuid) to service_role;
commit;
