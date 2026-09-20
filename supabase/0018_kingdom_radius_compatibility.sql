-- Permit both original 2,000 m rows and new 1,000 m kingdom-rule rows.
-- Existing kingdoms and ownership are preserved.
begin;

alter table public.cb_territories
  drop constraint if exists cb_territories_radius_m_check;

alter table public.cb_territories
  add constraint cb_territories_radius_m_check
  check (radius_m between 1000 and 2000);

notify pgrst,'reload schema';
commit;
