-- Apply once in the current Supabase project after 0012. Does not reset accounts or ratings.
begin;

alter table public.cb_profiles add column if not exists ocbr integer not null default 88;

-- The server alone handles GPS coordinates. The public profile and presence
-- tables never disclose precise coordinates.
create table if not exists public.cb_gps_presence (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy double precision not null check (accuracy between 0 and 500),
  seen_at timestamptz not null default now()
);
create index if not exists cb_gps_presence_recent_idx on public.cb_gps_presence(seen_at desc);
alter table public.cb_gps_presence enable row level security;
revoke all on public.cb_gps_presence from anon, authenticated;

-- Existing databases can already contain duplicate historical signup entries.
-- The backfill below uses NOT EXISTS, so it does not create another entry.
create or replace function public.cb_prune_feed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.cb_feed where id in (
    select id from public.cb_feed
    where kind not in ('announcement','challenge','profile_created')
    order by created_at desc,id desc offset 50
  );
  return new;
end;
$$;
insert into public.cb_feed(user_id,kind,display_name,content,created_at)
select p.user_id,'profile_created',p.display_name,'joined Chess Burger.',p.created_at
from public.cb_profiles p
where not exists(select 1 from public.cb_feed f where f.user_id=p.user_id and f.kind='profile_created')
on conflict do nothing;

commit;
