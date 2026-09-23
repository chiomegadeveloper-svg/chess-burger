-- Apply after 0048. Membership changes and guild events are written in the same transaction.
begin;
create table public.cb_guild_join_requests (
 id uuid primary key default gen_random_uuid(), guild_id uuid not null references public.cb_guilds(id) on delete cascade,
 user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 created_at timestamptz not null default now(), reviewed_at timestamptz
);
create unique index cb_guild_one_pending_request on public.cb_guild_join_requests(user_id) where status='pending';
create index cb_guild_join_requests_guild on public.cb_guild_join_requests(guild_id,status,created_at);
create table public.cb_guild_activity (
 id bigint generated always as identity primary key,
 guild_id uuid not null references public.cb_guilds(id) on delete cascade,
 actor_id uuid references public.cb_profiles(user_id) on delete set null,
 kind text not null, detail text not null default '', amount integer not null default 0,
 created_at timestamptz not null default now()
);
create index cb_guild_activity_recent on public.cb_guild_activity(guild_id,id desc);
alter table public.cb_guild_join_requests enable row level security;
alter table public.cb_guild_activity enable row level security;
alter table public.cb_guild_chest_ledger drop constraint if exists cb_guild_chest_ledger_kind_check;
alter table public.cb_guild_chest_ledger add constraint cb_guild_chest_ledger_kind_check check(kind in ('win','distribution','remainder','entrance'));
revoke all on public.cb_guild_join_requests,public.cb_guild_activity from anon,authenticated;
grant all on public.cb_guild_join_requests,public.cb_guild_activity to service_role;

-- Existing API action `join` now files an application, never adds a member directly.
create or replace function public.cb_guild_join(p_user_id uuid,p_guild_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
 if coalesce((select cbr from public.cb_profiles where user_id=p_user_id),0)<177 then raise exception 'Level 3 is required to join a guild';end if;
 perform 1 from public.cb_guilds where id=p_guild_id for update;
 if not found then raise exception 'Guild not found';end if;
 if exists(select 1 from public.cb_guild_members where user_id=p_user_id) then raise exception 'Quit your current guild first';end if;
 select count(*) into v_count from public.cb_guild_members where guild_id=p_guild_id;
 if v_count>=18 then raise exception 'This guild already has 18 members';end if;
 if exists(select 1 from public.cb_guild_join_requests where user_id=p_user_id and status='pending') then raise exception 'Cancel your pending request first';end if;
 insert into public.cb_guild_join_requests(guild_id,user_id) values(p_guild_id,p_user_id);
 insert into public.cb_guild_activity(guild_id,actor_id,kind) values(p_guild_id,p_user_id,'request');
end $$;
create or replace function public.cb_guild_cancel_request(p_user_id uuid,p_request_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 update public.cb_guild_join_requests set status='cancelled',reviewed_at=now()
 where id=p_request_id and user_id=p_user_id and status='pending';
 if not found then raise exception 'Pending request not found';end if;
end $$;
create or replace function public.cb_guild_review_request(p_user_id uuid,p_request_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path=public as $$
declare v_request public.cb_guild_join_requests%rowtype;v_guild public.cb_guilds%rowtype;v_count integer;v_gold integer;
begin
 -- Lock guild first, then request: same order as join and other guild actions.
 select g.* into v_guild from public.cb_guilds g join public.cb_guild_join_requests r on r.guild_id=g.id
 where r.id=p_request_id for update of g;
 if v_guild.id is null or v_guild.leader_id<>p_user_id then raise exception 'Only this guild leader can review requests';end if;
 select * into v_request from public.cb_guild_join_requests where id=p_request_id for update;
 if v_request.status<>'pending' then raise exception 'Request was already reviewed';end if;
 if p_approve then
  if exists(select 1 from public.cb_guild_members where user_id=v_request.user_id) then raise exception 'Player already belongs to a guild';end if;
  if coalesce((select cbr from public.cb_profiles where user_id=v_request.user_id),0)<177 then raise exception 'Player must still be Level 3';end if;
  select count(*) into v_count from public.cb_guild_members where guild_id=v_guild.id;
  if v_count>=18 then raise exception 'Guild is full';end if;
  select gold_points into v_gold from public.cb_profiles where user_id=v_request.user_id for update;
  if v_gold<20 then raise exception 'Applicant needs 20 CBG for the guild entrance contribution';end if;
  insert into public.cb_guild_members(user_id,guild_id) values(v_request.user_id,v_guild.id);
  update public.cb_profiles set gold_points=gold_points-20 where user_id=v_request.user_id;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values('guild-entrance:'||v_request.id::text,v_request.user_id,-20,'guild_entrance',v_guild.id);
  update public.cb_guilds set chest_cbg=chest_cbg+20 where id=v_guild.id;
  insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,reference_id)
  values('guild-entrance:'||v_request.id::text,v_guild.id,v_request.user_id,20,'entrance',v_request.id);
  insert into public.cb_guild_activity(guild_id,actor_id,kind,amount) values(v_guild.id,v_request.user_id,'entrance',20);
 else
  insert into public.cb_guild_activity(guild_id,actor_id,kind) values(v_guild.id,v_request.user_id,'rejected');
 end if;
 update public.cb_guild_join_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now() where id=p_request_id;
end $$;

create or replace function public.cb_guild_log_member() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  insert into public.cb_guild_activity(guild_id,actor_id,kind) values(new.guild_id,new.user_id,'join');
  return new;
 elsif tg_op='DELETE' then
  if not exists(select 1 from public.cb_guilds where id=old.guild_id) then return old;end if;
  insert into public.cb_guild_activity(guild_id,actor_id,kind,detail) values(old.guild_id,old.user_id,'leave',
   coalesce((select 'Kicked: '||reason from public.cb_guild_kicks where guild_id=old.guild_id and member_id=old.user_id order by created_at desc limit 1),''));
  return old;
 elsif new.leader_vote is distinct from old.leader_vote and new.leader_vote is not null then
  insert into public.cb_guild_activity(guild_id,actor_id,kind,detail) values(new.guild_id,new.user_id,'vote',
   coalesce((select display_name from public.cb_profiles where user_id=new.leader_vote),'member'));
 end if;
 return new;
end $$;
create trigger cb_guild_member_activity after insert or update or delete on public.cb_guild_members
for each row execute function public.cb_guild_log_member();
create or replace function public.cb_guild_log_leader() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.leader_id is distinct from old.leader_id then
  insert into public.cb_guild_activity(guild_id,actor_id,kind) values(new.id,new.leader_id,'leader');
 end if;
 return new;
end $$;
create trigger cb_guild_leader_activity after update of leader_id on public.cb_guilds
for each row execute function public.cb_guild_log_leader();
create or replace function public.cb_guild_log_cbr() returns trigger language plpgsql security definer set search_path=public as $$
declare v_guild uuid;
begin
 if new.cbr>old.cbr then
  select guild_id into v_guild from public.cb_guild_members where user_id=new.user_id;
  if v_guild is not null then
   insert into public.cb_guild_activity(guild_id,actor_id,kind,amount) values(v_guild,new.user_id,'cbr',new.cbr-old.cbr);
  end if;
 end if;
 return new;
end $$;
create trigger cb_guild_cbr_activity after update of cbr on public.cb_profiles
for each row execute function public.cb_guild_log_cbr();
create or replace function public.cb_guild_log_cbg() returns trigger language plpgsql security definer set search_path=public as $$
declare v_guild uuid;
begin
 if new.delta>0 then
  select guild_id into v_guild from public.cb_guild_members where user_id=new.user_id;
  if v_guild is not null then
   insert into public.cb_guild_activity(guild_id,actor_id,kind,detail,amount) values(v_guild,new.user_id,'cbg',new.kind,new.delta);
  end if;
 end if;
 return new;
end $$;
create trigger cb_guild_cbg_activity after insert on public.cb_gold_ledger
for each row execute function public.cb_guild_log_cbg();
revoke all on function public.cb_guild_cancel_request(uuid,uuid),public.cb_guild_review_request(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.cb_guild_cancel_request(uuid,uuid),public.cb_guild_review_request(uuid,uuid,boolean) to service_role;
commit;
