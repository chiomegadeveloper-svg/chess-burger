-- Adds profile columns required by the current Vercel app without deleting existing data.
begin;
alter table public.cb_profiles add column if not exists card_photo_url text not null default '';
alter table public.cb_profiles add column if not exists country_code text not null default 'PH';
alter table public.cb_profiles add column if not exists featured_photos text[] not null default '{}';
alter table public.cb_profiles add column if not exists featured_badges text[] not null default '{}';
alter table public.cb_profiles add column if not exists cbr integer not null default 88;
alter table public.cb_profiles add column if not exists gold_points integer not null default 0;
alter table public.cb_profiles add column if not exists role text not null default 'player';
alter table public.cb_profiles add column if not exists win_streak integer not null default 0;
alter table public.cb_profiles add column if not exists wins integer not null default 0;
alter table public.cb_profiles add column if not exists losses integer not null default 0;
commit;