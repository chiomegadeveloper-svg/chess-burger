-- Run after the existing Chess Burger migrations. Safe to rerun.
begin;
create table if not exists public.cb_open_play_sessions (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.cb_profiles(user_id),
 title text not null default 'Chess Open Play' check(title='Chess Open Play'),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 location text not null check(length(location) between 1 and 300), radius_m integer not null default 10 check(radius_m=10),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 bonus_percent integer not null default 20 check(bonus_percent between 0 and 100),
 capacity integer check(capacity between 1 and 10000), cancelled boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists cb_open_play_schedule_idx on public.cb_open_play_sessions(ends_at,starts_at);
create table if not exists public.cb_open_play_registrations (
 session_id uuid not null references public.cb_open_play_sessions(id) on delete cascade,
 user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 registered_at timestamptz not null default now(), primary key(session_id,user_id)
);
create table if not exists public.cb_open_play_bonus_ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.cb_profiles(user_id),
 session_id uuid not null references public.cb_open_play_sessions(id), win_number integer not null,
 base_gain integer not null, bonus integer not null, bonus_percent integer not null,
 created_at timestamptz not null default now(), unique(user_id,win_number)
);
alter table public.cb_open_play_sessions enable row level security;
alter table public.cb_open_play_registrations enable row level security;
alter table public.cb_open_play_bonus_ledger enable row level security;
-- All writes pass through the authenticated server with service-role-only RPCs.
revoke all on public.cb_open_play_sessions, public.cb_open_play_registrations, public.cb_open_play_bonus_ledger from anon,authenticated;
grant all on public.cb_open_play_sessions, public.cb_open_play_registrations, public.cb_open_play_bonus_ledger to service_role;
create or replace function public.cb_list_open_play(p_user uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
 'registrant_count',(select count(*) from cb_open_play_registrations r where r.session_id=s.id),
 'registered',exists(select 1 from cb_open_play_registrations r where r.session_id=s.id and r.user_id=p_user)) order by s.starts_at,s.id),'[]'::jsonb)
 from cb_open_play_sessions s where not s.cancelled and s.ends_at>now();
$$;
revoke all on function public.cb_list_open_play(uuid) from public,anon,authenticated;
grant execute on function public.cb_list_open_play(uuid) to service_role;
create or replace function public.cb_open_play_distance(a double precision,b double precision,c double precision,d double precision)
returns double precision language sql immutable strict as $$
 select 6371000*2*asin(sqrt(least(1.0,power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))));
$$;
create or replace function public.cb_save_open_play(p_owner uuid,p_id uuid,p_lat double precision,p_lng double precision,p_location text,p_start timestamptz,p_end timestamptz,p_bonus integer,p_capacity integer)
returns public.cb_open_play_sessions language plpgsql security definer set search_path=public as $$
declare s public.cb_open_play_sessions; n integer;
begin
 if not exists(select 1 from cb_profiles where user_id=p_owner and role='owner') then raise exception 'Only an owner can schedule Open Play.'; end if;
 if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180) or p_start is null or p_end is null or p_start<=now() or p_end<=p_start or p_bonus is null or p_bonus not between 0 and 100 or (p_capacity is not null and p_capacity not between 1 and 10000) or p_location is null or length(trim(p_location)) not between 1 and 300 then raise exception 'Choose a valid pin, future schedule, CBR promo and joiner limit.'; end if;
 if p_id is null then
 insert into cb_open_play_sessions(created_by,latitude,longitude,location,starts_at,ends_at,bonus_percent,capacity) values(p_owner,p_lat,p_lng,trim(p_location),p_start,p_end,p_bonus,p_capacity) returning * into s;
 else
 select * into s from cb_open_play_sessions where id=p_id for update;
 if s.id is null or s.cancelled or s.starts_at<=now() then raise exception 'Only upcoming sessions can be edited.'; end if;
 select count(*) into n from cb_open_play_registrations where session_id=p_id;
 if p_capacity is not null and p_capacity<n then raise exception 'The limit cannot be below the current registrant count.'; end if;
 if n>0 and (s.latitude<>p_lat or s.longitude<>p_lng) then raise exception 'A registered session cannot move to another location. Cancel it and create a new pin.'; end if;
 update cb_open_play_sessions set latitude=p_lat,longitude=p_lng,location=trim(p_location),starts_at=p_start,ends_at=p_end,bonus_percent=p_bonus,capacity=p_capacity where id=p_id returning * into s;
 end if;
 return s;
end $$;
create or replace function public.cb_join_open_play(p_user uuid,p_session uuid,p_join boolean)
returns void language plpgsql security definer set search_path=public as $$
declare s public.cb_open_play_sessions; n integer;
begin
 select * into s from cb_open_play_sessions where id=p_session for update;
 if s.id is null or s.cancelled or s.ends_at<=now() then raise exception 'This Open Play session is closed.'; end if;
 if p_join then
 if exists(select 1 from cb_open_play_registrations where session_id=p_session and user_id=p_user) then return; end if;
 select count(*) into n from cb_open_play_registrations where session_id=p_session;
 if s.capacity is not null and n>=s.capacity then raise exception 'This Open Play session is full.'; end if;
 insert into cb_open_play_registrations(session_id,user_id) values(p_session,p_user);
 else delete from cb_open_play_registrations where session_id=p_session and user_id=p_user; end if;
end $$;
create or replace function public.cb_cancel_open_play(p_owner uuid,p_session uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from cb_profiles where user_id=p_owner and role='owner') then raise exception 'Only an owner can cancel Open Play.'; end if;
 update cb_open_play_sessions set cancelled=true where id=p_session and ends_at>now();
 if not found then raise exception 'This session is already closed.'; end if;
end $$;
-- A fresh, accurate presence fix is required at each win. Overlapping promotions
-- use the highest percentage once. Transfers, quests and owner CBR edits do not
-- qualify unless they also record a new win. Fractional bonus CBR rounds up.
create or replace function public.cb_award_open_play_bonus() returns trigger
language plpgsql security definer set search_path=public as $$
declare s public.cb_open_play_sessions; gain integer; extra integer; applied integer;
begin
 gain:=new.cbr-old.cbr;
 if gain<=0 or new.wins<=old.wins then return new; end if;
 select o.* into s from cb_open_play_sessions o
 join cb_open_play_registrations r on r.session_id=o.id and r.user_id=new.user_id
 join cb_presence p on p.user_id=r.user_id
 where not o.cancelled and now()>=o.starts_at and now()<o.ends_at and o.bonus_percent>0
 and p.gps_enabled and p.seen_at>now()-interval '45 seconds' and p.seen_at<=now()
 and p.accuracy between 0 and 10 and p.latitude between -90 and 90 and p.longitude between -180 and 180
 and cb_open_play_distance(o.latitude,o.longitude,p.latitude,p.longitude)<=o.radius_m
 order by o.bonus_percent desc,o.id limit 1;
 if s.id is null then return new; end if;
 extra:=ceil(gain*s.bonus_percent/100.0);
 insert into cb_open_play_bonus_ledger(user_id,session_id,win_number,base_gain,bonus,bonus_percent)
 values(new.user_id,s.id,new.wins,gain,extra,s.bonus_percent) on conflict(user_id,win_number) do nothing;
 get diagnostics applied=row_count;
 if applied=1 then new.cbr:=new.cbr+extra; end if;
 return new;
end $$;
drop trigger if exists cb_open_play_win_bonus on public.cb_profiles;
create trigger cb_open_play_win_bonus before update of cbr,wins on public.cb_profiles for each row execute function public.cb_award_open_play_bonus();
revoke all on function public.cb_save_open_play(uuid,uuid,double precision,double precision,text,timestamptz,timestamptz,integer,integer),public.cb_join_open_play(uuid,uuid,boolean),public.cb_cancel_open_play(uuid,uuid),public.cb_award_open_play_bonus() from public,anon,authenticated;
grant execute on function public.cb_save_open_play(uuid,uuid,double precision,double precision,text,timestamptz,timestamptz,integer,integer),public.cb_join_open_play(uuid,uuid,boolean),public.cb_cancel_open_play(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
