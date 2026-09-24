-- Apply after 0051_default_guilds.sql. Preserves guild members and chest balances.
begin;

drop trigger if exists cb_guild_lock_regional_art on public.cb_guilds;

insert into public.cb_guilds(id,name,creator_id,leader_id,is_default,logo_url,cover_url)
values
 ('7dcb0000-0000-4000-8000-000000000008','Cebu Guild',null,null,true,'/guild/default-cebu-logo.webp','/guild/default-cebu-cover.webp'),
 ('7dcb0000-0000-4000-8000-000000000009','Davao Guild',null,null,true,'/guild/default-davao-logo.webp','/guild/default-davao-cover.webp'),
 ('7dcb0000-0000-4000-8000-00000000000a','Manila Guild',null,null,true,'/guild/default-manila-logo.webp','/guild/default-manila-cover.webp')
on conflict (id) do nothing;

-- Restore the fixed artwork even if a leader edited an earlier default guild.
update public.cb_guilds as g set
 logo_url='/guild/default-'||r.slug||'-logo.webp',
 cover_url='/guild/default-'||r.slug||'-cover.webp'
from (values
 ('7dcb0000-0000-4000-8000-000000000001'::uuid,'tacloban'),
 ('7dcb0000-0000-4000-8000-000000000002'::uuid,'leyte'),
 ('7dcb0000-0000-4000-8000-000000000003'::uuid,'samar'),
 ('7dcb0000-0000-4000-8000-000000000004'::uuid,'biliran'),
 ('7dcb0000-0000-4000-8000-000000000005'::uuid,'s-leyte'),
 ('7dcb0000-0000-4000-8000-000000000006'::uuid,'e-samar'),
 ('7dcb0000-0000-4000-8000-000000000007'::uuid,'n-samar'),
 ('7dcb0000-0000-4000-8000-000000000008'::uuid,'cebu'),
 ('7dcb0000-0000-4000-8000-000000000009'::uuid,'davao'),
 ('7dcb0000-0000-4000-8000-00000000000a'::uuid,'manila')
) as r(id,slug) where g.id=r.id and g.is_default;

create or replace function public.cb_guild_keep_regional_art() returns trigger
language plpgsql set search_path=public as $$
begin
 if old.is_default and (new.logo_url is distinct from old.logo_url or new.cover_url is distinct from old.cover_url) then
  raise exception 'Default guild logos and covers are permanent';
 end if;
 return new;
end $$;
create trigger cb_guild_lock_regional_art before update of logo_url,cover_url on public.cb_guilds
for each row execute function public.cb_guild_keep_regional_art();

commit;
