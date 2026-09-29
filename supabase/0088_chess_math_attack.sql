-- Quiz ATTACK: unlimited questions, three mistakes, server-verified attempts.
begin;
create table if not exists public.cb_chess_math_attack (
 id uuid primary key,
 user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 current_question_id text not null,
 used_question_ids text[] not null default '{}',
 question_number integer not null default 1 check(question_number>0),
 correct integer not null default 0 check(correct>=0),
 mistakes integer not null default 0 check(mistakes between 0 and 3),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 elapsed_ms bigint check(elapsed_ms>=0)
);
create unique index if not exists cb_chess_math_attack_active on public.cb_chess_math_attack(user_id) where finished_at is null;
create index if not exists cb_chess_math_attack_leaders on public.cb_chess_math_attack(correct desc,elapsed_ms) where finished_at is not null;
alter table public.cb_chess_math_attack enable row level security;
revoke all on public.cb_chess_math_attack from anon,authenticated;
grant all on public.cb_chess_math_attack to service_role;

create or replace function public.cb_chess_math_attack_leaders()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare output jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'Server access required'; end if;
 with best_score as (
  select distinct on(user_id) user_id,correct,elapsed_ms from public.cb_chess_math_attack
  where finished_at is not null order by user_id,correct desc,elapsed_ms,id
 ), best_pace as (
  select distinct on(user_id) user_id,correct,elapsed_ms,
   round(correct::numeric*60000/greatest(elapsed_ms,1),2) as correct_per_minute
  from public.cb_chess_math_attack where finished_at is not null and correct>=10
  order by user_id,round(correct::numeric*60000/greatest(elapsed_ms,1),2) desc,correct desc,elapsed_ms,id
 ), lifetime as (
  select user_id,sum(correct)::bigint as total_correct,count(*)::integer as attempts
  from public.cb_chess_math_attack where finished_at is not null group by user_id
 )
 select jsonb_build_object(
  'score',coalesce((select jsonb_agg(to_jsonb(r) order by r.correct desc,r.elapsed_ms,r.user_id) from (
   select b.user_id,p.username,p.display_name,p.avatar_url,b.correct,b.elapsed_ms
   from best_score b join public.cb_profiles p on p.user_id=b.user_id
   order by b.correct desc,b.elapsed_ms,b.user_id limit 10) r),'[]'::jsonb),
  'pace',coalesce((select jsonb_agg(to_jsonb(r) order by r.correct_per_minute desc,r.correct desc,r.elapsed_ms,r.user_id) from (
   select b.user_id,p.username,p.display_name,p.avatar_url,b.correct,b.elapsed_ms,b.correct_per_minute
   from best_pace b join public.cb_profiles p on p.user_id=b.user_id
   order by b.correct_per_minute desc,b.correct desc,b.elapsed_ms,b.user_id limit 10) r),'[]'::jsonb),
  'lifetime',coalesce((select jsonb_agg(to_jsonb(r) order by r.total_correct desc,r.attempts desc,r.user_id) from (
   select b.user_id,p.username,p.display_name,p.avatar_url,b.total_correct,b.attempts
   from lifetime b join public.cb_profiles p on p.user_id=b.user_id
   order by b.total_correct desc,b.attempts desc,b.user_id limit 10) r),'[]'::jsonb)
 ) into output;
 return output;
end $$;
revoke all on function public.cb_chess_math_attack_leaders() from public,anon,authenticated;
grant execute on function public.cb_chess_math_attack_leaders() to service_role;
commit;
