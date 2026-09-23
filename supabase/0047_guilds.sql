-- Guilds, leader elections and a transactional, auditable CBG chest.
-- Apply after the existing Chess Burger migrations.
begin;
create table if not exists public.cb_guilds (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (char_length(btrim(name)) between 3 and 40),
 creator_id uuid not null references public.cb_profiles(user_id),
 leader_id uuid not null references public.cb_profiles(user_id),
 logo_url text not null default '', cover_url text not null default '',
 chest_cbg bigint not null default 0 check(chest_cbg>=0),
 release_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists cb_guilds_name_lower_idx on public.cb_guilds(lower(name));
create table if not exists public.cb_guild_members (
 user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
 guild_id uuid not null references public.cb_guilds(id) on delete cascade,
 joined_at timestamptz not null default now(),
 leader_vote uuid references public.cb_profiles(user_id)
);
create index if not exists cb_guild_members_guild_idx on public.cb_guild_members(guild_id);
create or replace view public.cb_guild_directory as
 select g.id,g.name,g.logo_url,g.cover_url,g.leader_id,g.creator_id,g.chest_cbg,g.release_at,g.created_at,
 count(m.user_id)::integer as member_count,coalesce(sum(p.cbr),0)::bigint as guild_points
 from public.cb_guilds g left join public.cb_guild_members m on m.guild_id=g.id
 left join public.cb_profiles p on p.user_id=m.user_id group by g.id;
create table if not exists public.cb_guild_chest_ledger (
 id text primary key,
 guild_id uuid not null references public.cb_guilds(id),
 user_id uuid references public.cb_profiles(user_id),
 amount bigint not null,
 kind text not null check(kind in ('win','distribution','remainder')),
 reference_id uuid,
 created_at timestamptz not null default now()
);
create index if not exists cb_guild_chest_ledger_guild_idx on public.cb_guild_chest_ledger(guild_id,created_at desc);
alter table public.cb_guilds enable row level security;
alter table public.cb_guild_members enable row level security;
alter table public.cb_guild_chest_ledger enable row level security;
revoke all on public.cb_guilds,public.cb_guild_members,public.cb_guild_chest_ledger from anon,authenticated;
grant all on public.cb_guilds,public.cb_guild_members,public.cb_guild_chest_ledger to service_role;
revoke all on public.cb_guild_directory from anon,authenticated;
grant select on public.cb_guild_directory to service_role;

create or replace function public.cb_guild_create(p_user_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_cbr integer;
begin
 select cbr into v_cbr from public.cb_profiles where user_id=p_user_id;
 if v_cbr is null then raise exception 'Complete your profile first';end if;
 if v_cbr<177 then raise exception 'Level 3 is required to create a guild';end if;
 if char_length(btrim(p_name)) not between 3 and 40 then raise exception 'Guild name must be 3 to 40 characters';end if;
 if exists(select 1 from public.cb_guild_members where user_id=p_user_id) then raise exception 'Leave your current guild first';end if;
 insert into public.cb_guilds(name,creator_id,leader_id) values(btrim(p_name),p_user_id,p_user_id) returning id into v_id;
 insert into public.cb_guild_members(user_id,guild_id) values(p_user_id,v_id);
 return v_id;
end $$;
create or replace function public.cb_guild_join(p_user_id uuid,p_guild_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
 if coalesce((select cbr from public.cb_profiles where user_id=p_user_id),0)<177 then raise exception 'Level 3 is required to join a guild';end if;
 perform 1 from public.cb_guilds where id=p_guild_id for update;
 if not found then raise exception 'Guild not found';end if;
 if exists(select 1 from public.cb_guild_members where user_id=p_user_id) then raise exception 'Leave your current guild first';end if;
 select count(*) into v_count from public.cb_guild_members where guild_id=p_guild_id;
 if v_count>=18 then raise exception 'This guild already has 18 members';end if;
 insert into public.cb_guild_members(user_id,guild_id) values(p_user_id,p_guild_id);
end $$;
create or replace function public.cb_guild_leave(p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_guild public.cb_guilds%rowtype; v_next uuid;
begin
 select g.* into v_guild from public.cb_guilds g join public.cb_guild_members m on m.guild_id=g.id where m.user_id=p_user_id for update of g;
 if v_guild.id is null then raise exception 'You are not in a guild';end if;
 if v_guild.leader_id=p_user_id then
  select user_id into v_next from public.cb_guild_members where guild_id=v_guild.id and user_id<>p_user_id order by joined_at,user_id limit 1;
  if v_next is null then raise exception 'The last member cannot leave a guild';end if;
  update public.cb_guilds set leader_id=v_next where id=v_guild.id;
 end if;
 delete from public.cb_guild_members where user_id=p_user_id;
 update public.cb_guild_members set leader_vote=null where guild_id=v_guild.id and leader_vote=p_user_id;
end $$;
create or replace function public.cb_guild_vote(p_user_id uuid,p_candidate uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_guild uuid;v_votes integer;v_members integer;v_leader uuid;
begin
 select guild_id into v_guild from public.cb_guild_members where user_id=p_user_id;
 if v_guild is null then raise exception 'Join a guild first';end if;
 perform 1 from public.cb_guilds where id=v_guild for update;
 if not exists(select 1 from public.cb_guild_members where guild_id=v_guild and user_id=p_candidate) then raise exception 'Choose a current guild member';end if;
 update public.cb_guild_members set leader_vote=p_candidate where user_id=p_user_id;
 select count(*) into v_votes from public.cb_guild_members where guild_id=v_guild and leader_vote=p_candidate;
 select count(*) into v_members from public.cb_guild_members where guild_id=v_guild;
 if v_votes>v_members/2 then
  update public.cb_guilds set leader_id=p_candidate where id=v_guild;
  update public.cb_guild_members set leader_vote=null where guild_id=v_guild;
 end if;
 select leader_id into v_leader from public.cb_guilds where id=v_guild;
 return v_leader;
end $$;
create or replace function public.cb_guild_schedule(p_user_id uuid,p_release_at timestamptz) returns void
language plpgsql security definer set search_path=public as $$
declare v_guild uuid;
begin
 select id into v_guild from public.cb_guilds where leader_id=p_user_id for update;
 if v_guild is null then raise exception 'Only the guild leader can set a release';end if;
 if p_release_at is not null and (p_release_at<=now() or p_release_at>now()+interval '365 days') then raise exception 'Choose a future date within one year';end if;
 update public.cb_guilds set release_at=p_release_at where id=v_guild;
end $$;
create or replace function public.cb_guild_distribute_due() returns integer
language plpgsql security definer set search_path=public as $$
declare g record;v_members integer;v_share bigint;v_total bigint;v_id uuid;v_count integer:=0;
begin
 for g in select id,chest_cbg,release_at from public.cb_guilds where release_at<=now() for update skip locked loop
  select count(*) into v_members from public.cb_guild_members where guild_id=g.id;
  if v_members=0 then update public.cb_guilds set release_at=null where id=g.id;continue;end if;
  v_share:=g.chest_cbg/v_members;
  v_total:=v_share*v_members;
  v_id:=gen_random_uuid();
  if v_share>0 then
   update public.cb_profiles p set gold_points=p.gold_points+v_share from public.cb_guild_members m where m.guild_id=g.id and m.user_id=p.user_id;
   insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,reference_id)
   select 'guild-release:'||v_id::text||':'||m.user_id::text,g.id,m.user_id,-v_share,'distribution',v_id from public.cb_guild_members m where m.guild_id=g.id;
  end if;
  update public.cb_guilds set chest_cbg=chest_cbg-v_total,release_at=null where id=g.id;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;
-- Each winning game mints a matching chest reward while the player keeps
-- their normal CBG. A wager's pot is not doubled; its normal match bonus is.
create or replace function public.cb_guild_capture_win() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_guild uuid;v_amount bigint;v_result uuid;
begin
 if new.delta<=0 or new.kind not in ('match_reward','match_bonus','queue_payout','arena_win','cpu_result') then return new;end if;
 v_amount:=case when new.kind='queue_payout' then
   case when exists(select 1 from public.cb_profiles where user_id=new.user_id and win_streak>=5) then 7 else 5 end
   else new.delta end;
 if v_amount<=0 then return new;end if;
 if new.kind<>'cpu_result' then
  select case when m.result='white' then m.white_id when m.result='black' then m.black_id end into v_result
  from public.cb_matches m where m.id=new.reference_id and m.status='finished' and m.play_mode<>'offline';
  if v_result is distinct from new.user_id then return new;end if;
 end if;
 select guild_id into v_guild from public.cb_guild_members where user_id=new.user_id;
 if v_guild is null then return new;end if;
 insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,reference_id)
 values('guild-win:'||new.id,v_guild,new.user_id,v_amount,'win',new.reference_id)
 on conflict(id) do nothing;
 if found then update public.cb_guilds set chest_cbg=chest_cbg+v_amount where id=v_guild;end if;
 return new;
end $$;
drop trigger if exists cb_guild_win_on_gold_ledger on public.cb_gold_ledger;
create trigger cb_guild_win_on_gold_ledger after insert on public.cb_gold_ledger
for each row execute function public.cb_guild_capture_win();
revoke all on function public.cb_guild_create(uuid,text),public.cb_guild_join(uuid,uuid),public.cb_guild_leave(uuid),public.cb_guild_vote(uuid,uuid),public.cb_guild_schedule(uuid,timestamptz),public.cb_guild_distribute_due() from public,anon,authenticated;
grant execute on function public.cb_guild_create(uuid,text),public.cb_guild_join(uuid,uuid),public.cb_guild_leave(uuid),public.cb_guild_vote(uuid,uuid),public.cb_guild_schedule(uuid,timestamptz),public.cb_guild_distribute_due() to service_role;
-- Supabase projects with pg_cron enabled release CBG on schedule, even when
-- nobody opens the Guild page. Otherwise the next Guild request releases it.
do $$ begin
 if to_regprocedure('cron.schedule(text,text,text)') is not null then
  perform cron.schedule('cb-guild-release','* * * * *','select public.cb_guild_distribute_due()');
 end if;
exception when SQLSTATE '3F000' or SQLSTATE '42883' or SQLSTATE '42501' then
 raise notice 'Enable pg_cron for automatic guild releases; page visits still process due releases';
end $$;
commit;
