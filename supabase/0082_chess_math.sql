-- Chess Math timed sessions and Top 10 boards. Apply after cb_profiles exists.
begin;
create table if not exists public.cb_chess_math_sessions (
  id uuid primary key,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  difficulty text not null check(difficulty in ('easy','medium','hard')),
  question_ids text[] not null check(cardinality(question_ids) between 10 and 50),
  duration_seconds integer not null check(duration_seconds in (60,120,180,300)),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  answers jsonb,
  score integer check(score>=0 and score<=cardinality(question_ids)),
  answered_count integer check(answered_count>=0 and answered_count<=cardinality(question_ids)),
  elapsed_ms integer check(elapsed_ms>=0)
);
create index if not exists cb_chess_math_active_idx on public.cb_chess_math_sessions(user_id,expires_at desc) where finished_at is null;
create index if not exists cb_chess_math_leaders_idx on public.cb_chess_math_sessions(difficulty,score desc,elapsed_ms) where finished_at is not null;
create index if not exists cb_chess_math_finishers_idx on public.cb_chess_math_sessions(difficulty,user_id) where finished_at is not null;
alter table public.cb_chess_math_sessions enable row level security;
revoke all on public.cb_chess_math_sessions from anon,authenticated;

create or replace function public.cb_chess_math_leaders(p_difficulty text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare output jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
  if p_difficulty not in ('easy','medium','hard') then raise exception 'Choose a Chess Math difficulty'; end if;
  with best_score as (
    select distinct on(s.user_id) s.user_id,s.score,s.elapsed_ms,cardinality(s.question_ids) as total
    from public.cb_chess_math_sessions s where s.difficulty=p_difficulty and s.finished_at is not null
    order by s.user_id,s.score desc,s.elapsed_ms,s.id
  ), best_speed as (
    select distinct on(s.user_id) s.user_id,s.score,s.elapsed_ms,cardinality(s.question_ids) as total,
      round(s.elapsed_ms::numeric/greatest(s.score,1)) as ms_per_correct
    from public.cb_chess_math_sessions s
    where s.difficulty=p_difficulty and s.finished_at is not null
      and s.answered_count=cardinality(s.question_ids)
      and s.score>=ceil(cardinality(s.question_ids)*0.7)
    order by s.user_id,round(s.elapsed_ms::numeric/greatest(s.score,1)),s.elapsed_ms,s.id
  ), finishes as (
    select s.user_id,count(*)::integer as total
    from public.cb_chess_math_sessions s where s.difficulty=p_difficulty and s.finished_at is not null
      and s.answered_count=cardinality(s.question_ids)
    group by s.user_id
  )
  select jsonb_build_object(
    'score',coalesce((select jsonb_agg(to_jsonb(r) order by r.score desc,r.elapsed_ms,r.user_id) from (
      select b.user_id,p.username,p.display_name,p.avatar_url,b.score,b.total,b.elapsed_ms
      from best_score b join public.cb_profiles p on p.user_id=b.user_id
      order by b.score desc,b.elapsed_ms,b.user_id limit 10
    ) r),'[]'::jsonb),
    'speed',coalesce((select jsonb_agg(to_jsonb(r) order by r.ms_per_correct,r.elapsed_ms,r.user_id) from (
      select b.user_id,p.username,p.display_name,p.avatar_url,b.score,b.total,b.elapsed_ms,b.ms_per_correct
      from best_speed b join public.cb_profiles p on p.user_id=b.user_id
      order by b.ms_per_correct,b.elapsed_ms,b.user_id limit 10
    ) r),'[]'::jsonb),
    'finishers',coalesce((select jsonb_agg(to_jsonb(r) order by r.finishes desc,r.user_id) from (
      select f.user_id,p.username,p.display_name,p.avatar_url,f.total as finishes
      from finishes f join public.cb_profiles p on p.user_id=f.user_id
      order by f.total desc,f.user_id limit 10
    ) r),'[]'::jsonb)
  ) into output;
  return output;
end $$;
revoke all on function public.cb_chess_math_leaders(text) from public,anon,authenticated;
grant execute on function public.cb_chess_math_leaders(text) to service_role;
commit;
