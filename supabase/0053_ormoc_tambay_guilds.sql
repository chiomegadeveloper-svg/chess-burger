-- Apply after 0052_permanent_regional_art.sql. The existing trigger locks default artwork.
begin;

insert into public.cb_guilds(id,name,creator_id,leader_id,is_default,logo_url,cover_url)
values
 ('7dcb0000-0000-4000-8000-00000000000b','Ormoc City Guild',null,null,true,'/guild/default-ormoc-logo.webp','/guild/default-ormoc-cover.webp'),
 ('7dcb0000-0000-4000-8000-00000000000c','TAMBAY Guild',null,null,true,'/guild/default-tambay-logo.webp','/guild/default-tambay-cover.webp')
on conflict (id) do nothing;

commit;
