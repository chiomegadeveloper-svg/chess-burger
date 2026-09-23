-- Apply after 0049. Stable, unique, easy-to-share guild codes.
begin;
create sequence if not exists public.cb_guild_code_seq;
alter table public.cb_guilds add column if not exists guild_code text;
update public.cb_guilds set guild_code='CB-'||upper(lpad(to_hex(nextval('public.cb_guild_code_seq')),8,'0')) where guild_code is null;
alter table public.cb_guilds alter column guild_code set default 'CB-'||upper(lpad(to_hex(nextval('public.cb_guild_code_seq')),8,'0'));
alter table public.cb_guilds alter column guild_code set not null;
create unique index if not exists cb_guilds_guild_code_key on public.cb_guilds(guild_code);
create or replace view public.cb_guild_directory as
 select g.id,g.name,g.logo_url,g.cover_url,g.leader_id,g.creator_id,g.chest_cbg,g.release_at,g.created_at,
 count(m.user_id)::integer as member_count,coalesce(sum(p.cbr),0)::bigint as guild_points,g.guild_code
 from public.cb_guilds g left join public.cb_guild_members m on m.guild_id=g.id
 left join public.cb_profiles p on p.user_id=m.user_id group by g.id;
grant select on public.cb_guild_directory to service_role;
commit;
