-- Run in Supabase SQL Editor before deploying the SEba tournament UI.
create table if not exists public.cb_seba_presence (
 room_id uuid not null references public.cb_classroom_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 seen_at timestamptz not null default now(), primary key(room_id,user_id)
);
create index if not exists cb_seba_presence_recent on public.cb_seba_presence(room_id,seen_at desc);
create table if not exists public.cb_seba_tournaments (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.cb_classroom_rooms(id) on delete cascade,
 title text not null, teacher_id uuid not null references auth.users(id), coach_name text not null,
 session_started_at timestamptz not null, created_at timestamptz not null default now(),
 time_minutes integer not null check(time_minutes in (3,5,10,15,30)), increment_seconds integer not null check(increment_seconds in (0,10)),
 total_rounds integer not null check(total_rounds between 1 and 10), ai_level integer not null check(ai_level between 1 and 10),
 current_round integer not null default 1, status text not null default 'running' check(status in ('running','finished')),
 certificates_published boolean not null default false
);
create unique index if not exists cb_seba_one_running on public.cb_seba_tournaments(room_id) where status='running';
create index if not exists cb_seba_room_recent on public.cb_seba_tournaments(room_id,created_at desc);
create table if not exists public.cb_seba_participants (
 tournament_id uuid not null references public.cb_seba_tournaments(id) on delete cascade,
 user_id uuid not null references auth.users(id), student_name text not null,
 primary key(tournament_id,user_id)
);
create table if not exists public.cb_seba_games (
 id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.cb_seba_tournaments(id) on delete cascade,
 round integer not null, white_id uuid not null references auth.users(id), black_id uuid references auth.users(id),
 fen text not null, white_ms integer not null, black_ms integer not null,
 last_move_at timestamptz not null default now(), version integer not null default 0,
 status text not null default 'playing' check(status in ('playing','finished')),
 result text check(result in ('white','black','draw')),
 unique(tournament_id,round,white_id), check(white_id is distinct from black_id)
);
create index if not exists cb_seba_games_round on public.cb_seba_games(tournament_id,round);
create table if not exists public.cb_seba_certificates (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.cb_classroom_rooms(id) on delete cascade,
 tournament_id uuid references public.cb_seba_tournaments(id) on delete cascade,
 student_id uuid not null references auth.users(id), student_name text not null,
 title text not null, coach_name text not null, session_started_at timestamptz not null,
 rank integer, issued_at timestamptz not null default now(), unique(room_id,tournament_id,student_id)
);
create unique index if not exists cb_seba_session_certificate on public.cb_seba_certificates(room_id,student_id) where tournament_id is null;
create index if not exists cb_seba_student_certificates on public.cb_seba_certificates(student_id,issued_at desc);
-- Game updates require compare-and-swap so two simultaneous move requests cannot overwrite each other.
create or replace function public.cb_seba_commit_game(p_id uuid,p_version integer,p_fen text,p_white_ms integer,p_black_ms integer,p_result text)
returns boolean language plpgsql security definer set search_path=public as $$ begin
 update public.cb_seba_games set fen=p_fen,white_ms=p_white_ms,black_ms=p_black_ms,
 last_move_at=now(),version=version+1,status=case when p_result is null then 'playing' else 'finished' end,result=p_result
 where id=p_id and version=p_version and status='playing'; return found; end $$;
revoke all on function public.cb_seba_commit_game(uuid,integer,text,integer,integer,text) from public,anon,authenticated;
-- Reads and writes are mediated by the authenticated API using the service key.
alter table public.cb_seba_presence enable row level security;
alter table public.cb_seba_tournaments enable row level security;
alter table public.cb_seba_participants enable row level security;
alter table public.cb_seba_games enable row level security;
alter table public.cb_seba_certificates enable row level security;
