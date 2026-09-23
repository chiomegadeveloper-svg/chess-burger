-- Run once after 0047_guilds.sql. Guild creation and renaming are charged atomically.
begin;
create table if not exists public.cb_guild_kicks (
 id uuid primary key default gen_random_uuid(),
 guild_id uuid not null references public.cb_guilds(id) on delete cascade,
 member_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 leader_id uuid not null references public.cb_profiles(user_id),
 reason text not null check(char_length(btrim(reason)) between 5 and 240),
 created_at timestamptz not null default now()
);
create index if not exists cb_guild_kicks_member_idx on public.cb_guild_kicks(member_id,created_at desc);
alter table public.cb_guild_kicks enable row level security;
revoke all on public.cb_guild_kicks from anon,authenticated;
grant all on public.cb_guild_kicks to service_role;

create or replace function public.cb_guild_create(p_user_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_cbr integer;v_gold integer;
begin
 select cbr,gold_points into v_cbr,v_gold from public.cb_profiles where user_id=p_user_id for update;
 if v_cbr is null then raise exception 'Complete your profile first';end if;
 if v_cbr<177 then raise exception 'Level 3 is required to create a guild';end if;
 if char_length(btrim(p_name)) not between 3 and 12 then raise exception 'Guild name must be 3 to 12 characters';end if;
 if exists(select 1 from public.cb_guild_members where user_id=p_user_id) then raise exception 'Leave your current guild first';end if;
 if v_gold<100 then raise exception 'Creating a guild costs 100 CBG';end if;
 insert into public.cb_guilds(name,creator_id,leader_id) values(btrim(p_name),p_user_id,p_user_id) returning id into v_id;
 insert into public.cb_guild_members(user_id,guild_id) values(p_user_id,v_id);
 update public.cb_profiles set gold_points=gold_points-100 where user_id=p_user_id;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('guild-create:'||v_id::text,p_user_id,-100,'guild_create',v_id);
 return v_id;
end $$;

create or replace function public.cb_guild_rename(p_user_id uuid,p_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_name text;v_gold integer;
begin
 select id,name into v_id,v_name from public.cb_guilds where leader_id=p_user_id for update;
 if v_id is null then raise exception 'Only the guild leader can rename the guild';end if;
 if char_length(btrim(p_name)) not between 3 and 12 then raise exception 'Guild name must be 3 to 12 characters';end if;
 if lower(v_name)=lower(btrim(p_name)) then raise exception 'Choose a different guild name';end if;
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
 if v_gold<100 then raise exception 'Renaming a guild costs 100 CBG';end if;
 update public.cb_guilds set name=btrim(p_name) where id=v_id;
 update public.cb_profiles set gold_points=gold_points-100 where user_id=p_user_id;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
 values('guild-rename:'||gen_random_uuid()::text,p_user_id,-100,'guild_rename',v_id);
 return v_id;
end $$;

create or replace function public.cb_guild_kick(p_user_id uuid,p_member_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 select id into v_id from public.cb_guilds where leader_id=p_user_id for update;
 if v_id is null then raise exception 'Only the guild leader can remove a member';end if;
 if p_member_id=p_user_id then raise exception 'Use Quit Guild to leave';end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 5 and 240 then raise exception 'Give a reason of 5 to 240 characters';end if;
 if not exists(select 1 from public.cb_guild_members where guild_id=v_id and user_id=p_member_id) then raise exception 'This user is not in your guild';end if;
 insert into public.cb_guild_kicks(guild_id,member_id,leader_id,reason) values(v_id,p_member_id,p_user_id,btrim(p_reason));
 delete from public.cb_guild_members where guild_id=v_id and user_id=p_member_id;
 update public.cb_guild_members set leader_vote=null where guild_id=v_id and leader_vote=p_member_id;
 return v_id;
end $$;
revoke all on function public.cb_guild_rename(uuid,text),public.cb_guild_kick(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cb_guild_rename(uuid,text),public.cb_guild_kick(uuid,uuid,text) to service_role;
commit;
