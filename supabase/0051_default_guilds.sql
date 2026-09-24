-- Apply after 0050_guild_share_codes.sql. Safe to rerun.
begin;

alter table public.cb_guilds add column if not exists is_default boolean not null default false;
alter table public.cb_guilds alter column creator_id drop not null;
alter table public.cb_guilds alter column leader_id drop not null;
alter table public.cb_guilds drop constraint if exists cb_guild_creator_required;
alter table public.cb_guilds add constraint cb_guild_creator_required
  check (is_default or (creator_id is not null and leader_id is not null));

insert into public.cb_guilds(id,name,creator_id,leader_id,is_default,logo_url,cover_url)
values
 ('7dcb0000-0000-4000-8000-000000000001','Tacloban Guild',null,null,true,'/guild/default-tacloban-logo.webp','/guild/default-tacloban-cover.webp'),
 ('7dcb0000-0000-4000-8000-000000000002','Leyte Guild',null,null,true,'/guild/default-leyte-logo.webp','/guild/default-leyte-cover.webp'),
 ('7dcb0000-0000-4000-8000-000000000003','Samar Guild',null,null,true,'/guild/default-samar-logo.webp','/guild/default-samar-cover.webp'),
 ('7dcb0000-0000-4000-8000-000000000004','Biliran Guild',null,null,true,'/guild/default-biliran-logo.webp','/guild/default-biliran-cover.webp'),
 ('7dcb0000-0000-4000-8000-000000000005','S. Leyte Guild',null,null,true,'/guild/default-s-leyte-logo.webp','/guild/default-s-leyte-cover.webp'),
 ('7dcb0000-0000-4000-8000-000000000006','E. Samar Guild',null,null,true,'/guild/default-e-samar-logo.webp','/guild/default-e-samar-cover.webp'),
 ('7dcb0000-0000-4000-8000-000000000007','N. Samar Guild',null,null,true,'/guild/default-n-samar-logo.webp','/guild/default-n-samar-cover.webp')
on conflict (id) do nothing;

create or replace view public.cb_guild_directory as
 select g.id,g.name,g.logo_url,g.cover_url,g.leader_id,g.creator_id,g.chest_cbg,g.release_at,g.created_at,
 count(m.user_id)::integer as member_count,coalesce(sum(p.cbr),0)::bigint as guild_points,g.guild_code,g.is_default
 from public.cb_guilds g left join public.cb_guild_members m on m.guild_id=g.id
 left join public.cb_profiles p on p.user_id=m.user_id group by g.id;
grant select on public.cb_guild_directory to service_role;

-- Guilds without a leader admit members immediately and charge 20 CBG in the
-- same transaction. Once a leader is elected, joining follows the review flow.
create or replace function public.cb_guild_join(p_user_id uuid,p_guild_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare g public.cb_guilds%rowtype;v_count integer;v_gold integer;v_fee_id uuid;
begin
 if coalesce((select cbr from public.cb_profiles where user_id=p_user_id),0)<177 then raise exception 'Level 3 is required to join a guild';end if;
 select * into g from public.cb_guilds where id=p_guild_id for update;
 if g.id is null then raise exception 'Guild not found';end if;
 if exists(select 1 from public.cb_guild_members where user_id=p_user_id) then raise exception 'Quit your current guild first';end if;
 select count(*) into v_count from public.cb_guild_members where guild_id=g.id;
 if v_count>=18 then raise exception 'This guild already has 18 members';end if;
 if exists(select 1 from public.cb_guild_join_requests where user_id=p_user_id and status='pending') then raise exception 'Cancel your pending request first';end if;
 if g.is_default and g.leader_id is null then
  select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
  if coalesce(v_gold,0)<20 then raise exception 'Joining requires a 20 CBG entrance donation';end if;
  v_fee_id:=gen_random_uuid();
  insert into public.cb_guild_members(user_id,guild_id) values(p_user_id,g.id);
  update public.cb_profiles set gold_points=gold_points-20 where user_id=p_user_id;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
   values('guild-entrance:'||v_fee_id::text,p_user_id,-20,'guild_entrance',g.id);
  update public.cb_guilds set chest_cbg=chest_cbg+20 where id=g.id;
  insert into public.cb_guild_chest_ledger(id,guild_id,user_id,amount,kind,reference_id)
   values('guild-entrance:'||v_fee_id::text,g.id,p_user_id,20,'entrance',v_fee_id);
  insert into public.cb_guild_activity(guild_id,actor_id,kind,amount) values(g.id,p_user_id,'entrance',20);
 else
  insert into public.cb_guild_join_requests(guild_id,user_id) values(g.id,p_user_id);
  insert into public.cb_guild_activity(guild_id,actor_id,kind) values(g.id,p_user_id,'request');
 end if;
end $$;

-- Vacant defaults remain in the directory when their last member quits.
-- A departing default leader leaves the position vacant for another vote.
create or replace function public.cb_guild_leave(p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare g public.cb_guilds%rowtype;v_next uuid;
begin
 select guild.* into g from public.cb_guilds guild join public.cb_guild_members m on m.guild_id=guild.id
 where m.user_id=p_user_id for update of guild;
 if g.id is null then raise exception 'You are not in a guild';end if;
 if g.is_default then
  if g.leader_id=p_user_id then
   update public.cb_guilds set leader_id=null,release_at=null where id=g.id;
   update public.cb_guild_join_requests set status='cancelled',reviewed_at=now() where guild_id=g.id and status='pending';
  end if;
  delete from public.cb_guild_members where user_id=p_user_id;
  update public.cb_guild_members set leader_vote=null where guild_id=g.id and leader_vote=p_user_id;
  return;
 end if;
 if g.leader_id=p_user_id then
  select user_id into v_next from public.cb_guild_members where guild_id=g.id and user_id<>p_user_id order by joined_at,user_id limit 1;
  if v_next is null then
   if g.chest_cbg>0 then
    update public.cb_profiles set gold_points=gold_points+g.chest_cbg where user_id=p_user_id;
    insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
     values('guild-close:'||g.id::text,p_user_id,g.chest_cbg,'guild_distribution',g.id);
   end if;
   delete from public.cb_guild_chest_ledger where guild_id=g.id;
   delete from public.cb_guilds where id=g.id;
   return;
  end if;
  update public.cb_guilds set leader_id=v_next where id=g.id;
 end if;
 delete from public.cb_guild_members where user_id=p_user_id;
 update public.cb_guild_members set leader_vote=null where guild_id=g.id and leader_vote=p_user_id;
end $$;

revoke all on function public.cb_guild_join(uuid,uuid),public.cb_guild_leave(uuid) from public,anon,authenticated;
grant execute on function public.cb_guild_join(uuid,uuid),public.cb_guild_leave(uuid) to service_role;
commit;
