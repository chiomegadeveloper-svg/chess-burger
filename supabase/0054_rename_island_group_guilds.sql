-- Apply after 0053_ormoc_tambay_guilds.sql. Keep IDs, members, balances, and artwork.
begin;

update public.cb_guilds
set name = case id
  when '7dcb0000-0000-4000-8000-000000000008'::uuid then 'Visayas Guild'
  when '7dcb0000-0000-4000-8000-000000000009'::uuid then 'Mindanao Guild'
  when '7dcb0000-0000-4000-8000-00000000000a'::uuid then 'Luzon Guild'
end
where is_default
  and id in (
    '7dcb0000-0000-4000-8000-000000000008'::uuid,
    '7dcb0000-0000-4000-8000-000000000009'::uuid,
    '7dcb0000-0000-4000-8000-00000000000a'::uuid
  );

commit;
