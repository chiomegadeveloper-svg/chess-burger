-- Apply in Supabase SQL Editor before deploying v0.0264.
-- Scheduled challenge reservations and opt-in CBR wagers.
begin;

alter table public.cb_matches add column if not exists wager_cbr integer not null default 0;
alter table public.cb_matches add column if not exists cbr_wager_settled boolean not null default false;
alter table public.cb_matches drop constraint if exists cb_matches_play_mode_check;
alter table public.cb_matches add constraint cb_matches_play_mode_check check(play_mode in('normal','wager','cbr_wager','queue','arena'));
alter table public.cb_matches drop constraint if exists cb_matches_wager_cbr_check;
alter table public.cb_matches add constraint cb_matches_wager_cbr_check check(wager_cbr between 0 and 100);

create table if not exists public.cb_scheduled_challenges(
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  target_id uuid references public.cb_profiles(user_id) on delete set null,
  control text not null check(control in('1+0','1+1','2+1','3+0','3+2','5+0','10+0','10+5','15+10')),
  scheduled_at timestamptz not null,
  proposal_at timestamptz,
  status text not null default 'pending' check(status in('pending','countered','accepted','rejected','cancelled')),
  wager_kind text not null default 'none' check(wager_kind in('none','cbg','cbr')),
  wager_amount integer not null default 0 check(wager_amount between 0 and 10000),
  match_id uuid references public.cb_matches(id) on delete set null,
  created_at timestamptz not null default now(),
  check(host_id is distinct from target_id),
  check((wager_kind='none' and wager_amount=0) or (wager_kind='cbg' and wager_amount between 1 and 10000) or (wager_kind='cbr' and wager_amount between 1 and 100))
);
create index if not exists cb_scheduled_challenges_open_idx on public.cb_scheduled_challenges(status,scheduled_at);
create index if not exists cb_scheduled_challenges_target_idx on public.cb_scheduled_challenges(target_id,status,scheduled_at);
create index if not exists cb_scheduled_challenges_host_idx on public.cb_scheduled_challenges(host_id,status,scheduled_at);
alter table public.cb_scheduled_challenges enable row level security;
revoke all on public.cb_scheduled_challenges from public,anon,authenticated;
grant all on public.cb_scheduled_challenges to service_role;

-- Preserve Gold escrow behavior while verifying CBR stakes on both sides
-- at acceptance. The CBR stake is transferred only after a decisive result.
create or replace function public.cb_activate_gold_match(p_match_id uuid,p_acceptor_id uuid)
returns setof public.cb_matches
language plpgsql security definer set search_path=public
as $function$
declare
  m public.cb_matches%rowtype;
  stake integer;
  host_gold integer;
  acceptor_gold integer;
  host_cbr integer;
  acceptor_cbr integer;
begin
  select * into m from public.cb_matches where id=p_match_id for update;
  if m.id is null or m.status<>'waiting' then raise exception 'This invitation is no longer available.'; end if;
  if m.white_id=p_acceptor_id then raise exception 'You cannot accept your own invitation.'; end if;
  if m.invite_to is not null and m.invite_to<>p_acceptor_id then raise exception 'This invitation belongs to another player.'; end if;
  if m.black_id is not null and m.black_id<>p_acceptor_id then raise exception 'This invitation was already accepted.'; end if;
  stake:=case when m.play_mode='queue' then 3 when m.play_mode='wager' then m.wager_gold else 0 end;
  perform 1 from public.cb_profiles where user_id in(m.white_id,p_acceptor_id) order by user_id for update;
  select gold_points,cbr into host_gold,host_cbr from public.cb_profiles where user_id=m.white_id;
  select gold_points,cbr into acceptor_gold,acceptor_cbr from public.cb_profiles where user_id=p_acceptor_id;
  if host_gold is null or acceptor_gold is null then raise exception 'A player profile was not found.'; end if;
  if host_gold<stake then raise exception 'The challenge creator no longer has the required % Gold.',stake; end if;
  if acceptor_gold<stake then raise exception 'You need % Gold to accept this challenge.',stake; end if;
  if m.play_mode='cbr_wager' and (m.wager_cbr<1 or host_cbr<m.wager_cbr or acceptor_cbr<m.wager_cbr) then raise exception 'Both players need the offered CBR stake to begin.'; end if;
  if stake>0 then
    update public.cb_profiles set gold_points=gold_points-stake where user_id in(m.white_id,p_acceptor_id);
    insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values
      ('match-entry:'||p_match_id||':'||m.white_id,m.white_id,-stake,m.play_mode||'_entry',p_match_id),
      ('match-entry:'||p_match_id||':'||p_acceptor_id,p_acceptor_id,-stake,m.play_mode||'_entry',p_match_id)
    on conflict(id) do nothing;
  end if;
  update public.cb_matches set black_id=p_acceptor_id,black_cbr=coalesce((select cbr from public.cb_profiles where user_id=p_acceptor_id),88),invite_to=null,status='active',gold_funded=true,version=version+1,last_tick=now() where id=p_match_id;
  return query select * from public.cb_matches where id=p_match_id;
end;
$function$;

create or replace function public.cb_settle_cbr_wager(p_match_id uuid)
returns void language plpgsql security definer set search_path=public
as $function$
declare
  m public.cb_matches%rowtype;
  winner_id uuid;
  loser_id uuid;
  actual_stake integer;
begin
  select * into m from public.cb_matches where id=p_match_id for update;
  if m.id is null or m.status<>'finished' or m.play_mode<>'cbr_wager' or m.cbr_wager_settled then return; end if;
  if m.result in('white','black') and m.black_id is not null then
    winner_id:=case when m.result='white' then m.white_id else m.black_id end;
    loser_id:=case when m.result='white' then m.black_id else m.white_id end;
    perform 1 from public.cb_profiles where user_id in(winner_id,loser_id) order by user_id for update;
    select least(m.wager_cbr,cbr) into actual_stake from public.cb_profiles where user_id=loser_id;
    if actual_stake>0 then
      update public.cb_profiles set cbr=cbr-actual_stake where user_id=loser_id;
      update public.cb_profiles set cbr=cbr+actual_stake where user_id=winner_id;
    end if;
  end if;
  update public.cb_matches set cbr_wager_settled=true where id=p_match_id;
end;
$function$;

revoke all on function public.cb_activate_gold_match(uuid,uuid) from public,anon,authenticated;
revoke all on function public.cb_settle_cbr_wager(uuid) from public,anon,authenticated;
grant execute on function public.cb_activate_gold_match(uuid,uuid) to service_role;
grant execute on function public.cb_settle_cbr_wager(uuid) to service_role;
commit;
