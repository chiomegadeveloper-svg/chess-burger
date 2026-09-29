-- Guild chest receives 38% of eligible CBG earnings as a separate mint.
-- Apply after 0086. This affects future rewards; existing chest history is retained.
begin;

alter table public.cb_guilds
  add column if not exists chest_share_remainder integer not null default 0
  check (chest_share_remainder between 0 and 99);

-- Keep CBR activity for analytics, but CBR changes no longer mint chest CBG.
create or replace function public.cb_guild_log_cbr() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_guild uuid;
begin
 if new.cbr>old.cbr then
  select guild_id into v_guild from public.cb_guild_members where user_id=new.user_id;
  if v_guild is not null then
   insert into public.cb_guild_activity(guild_id,actor_id,kind,amount)
   values(v_guild,new.user_id,'cbr',new.cbr-old.cbr);
  end if;
 end if;
 return new;
end $$;

create or replace function public.cb_guild_capture_win() returns trigger
language plpgsql security definer set search_path=public as $$
declare
 v_guild uuid;
 v_remainder integer;
 v_units bigint;
 v_share bigint;
begin
 if new.delta<=0 or new.kind not in
   ('match_reward','match_bonus','queue_payout','cpu_result',
    'arena_win','arena_champion','tournament_reward') then
  return new;
 end if;

 select guild_id into v_guild
 from public.cb_guild_members where user_id=new.user_id;
 if v_guild is null then return new; end if;

 -- Serialize credits per guild. The remainder makes 38% exact across
 -- multiple integer rewards (e.g. 2 CBG earns 0 now and carries 76/100).
 select chest_share_remainder into v_remainder
 from public.cb_guilds where id=v_guild for update;
 if not found then return new; end if;
 v_units:=new.delta::bigint*38+v_remainder;
 v_share:=v_units/100;

 -- The source ledger ID makes each reward credit idempotent. Zero CBG
 -- entries preserve fractional progress and are hidden from notifications.
 insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,reference_id)
 values('guild-share:'||new.id,v_guild,new.user_id,v_share,'win',new.reference_id)
 on conflict(id) do nothing;
 if found then
  update public.cb_guilds
  set chest_cbg=chest_cbg+v_share,
      chest_share_remainder=(v_units%100)::integer
  where id=v_guild;
 end if;
 return new;
end $$;

drop trigger if exists cb_guild_win_on_gold_ledger on public.cb_gold_ledger;
create trigger cb_guild_win_on_gold_ledger
after insert on public.cb_gold_ledger
for each row execute function public.cb_guild_capture_win();

commit;
