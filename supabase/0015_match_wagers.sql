-- Chess Burger wager invitations and automatic-pairing Gold escrow.
-- Safe to run after 0014_barangay_territory_defense.sql.

begin;

alter table public.cb_matches add column if not exists play_mode text not null default 'normal';
alter table public.cb_matches add column if not exists wager_gold integer not null default 0;
alter table public.cb_matches add column if not exists public_challenge boolean not null default false;
alter table public.cb_matches add column if not exists gold_funded boolean not null default false;
alter table public.cb_matches add column if not exists gold_settled boolean not null default false;
alter table public.cb_matches drop constraint if exists cb_matches_play_mode_check;
alter table public.cb_matches add constraint cb_matches_play_mode_check check(play_mode in ('normal','wager','queue'));
alter table public.cb_matches drop constraint if exists cb_matches_wager_gold_check;
alter table public.cb_matches add constraint cb_matches_wager_gold_check check(wager_gold between 0 and 10000);

create or replace function public.cb_activate_gold_match(p_match_id uuid,p_acceptor_id uuid)
returns setof public.cb_matches
language plpgsql security definer set search_path=public
as $function$
declare
  m public.cb_matches%rowtype;
  stake integer;
  host_gold integer;
  acceptor_gold integer;
begin
  select * into m from public.cb_matches where id=p_match_id for update;
  if m.id is null or m.status<>'waiting' then raise exception 'This invitation is no longer available.'; end if;
  if m.white_id=p_acceptor_id then raise exception 'You cannot accept your own invitation.'; end if;
  if m.invite_to is not null and m.invite_to<>p_acceptor_id then raise exception 'This invitation belongs to another player.'; end if;
  if m.black_id is not null and m.black_id<>p_acceptor_id then raise exception 'This invitation was already accepted.'; end if;
  stake:=case when m.play_mode='queue' then 3 when m.play_mode='wager' then m.wager_gold else 0 end;
  perform 1 from public.cb_profiles where user_id in(m.white_id,p_acceptor_id) order by user_id for update;
  select gold_points into host_gold from public.cb_profiles where user_id=m.white_id;
  select gold_points into acceptor_gold from public.cb_profiles where user_id=p_acceptor_id;
  if host_gold is null or acceptor_gold is null then raise exception 'A player profile was not found.'; end if;
  if host_gold<stake then raise exception 'The challenge creator no longer has the required % Gold.',stake; end if;
  if acceptor_gold<stake then raise exception 'You need % Gold to accept this challenge.',stake; end if;
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

create or replace function public.cb_settle_match_gold(p_match_id uuid)
returns void language plpgsql security definer set search_path=public
as $function$
declare
  m public.cb_matches%rowtype;
  winner_id uuid;
  payout integer;
  stake integer;
begin
  select * into m from public.cb_matches where id=p_match_id for update;
  if m.id is null or m.status<>'finished' or m.result is null or m.gold_settled then return; end if;
  if not m.gold_funded or m.play_mode not in('queue','wager') then update public.cb_matches set gold_settled=true where id=p_match_id; return; end if;
  stake:=case when m.play_mode='queue' then 3 else m.wager_gold end;
  if m.result='draw' then
    update public.cb_profiles set gold_points=gold_points+stake where user_id in(m.white_id,m.black_id);
    insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values
      ('match-refund:'||p_match_id||':'||m.white_id,m.white_id,stake,m.play_mode||'_refund',p_match_id),
      ('match-refund:'||p_match_id||':'||m.black_id,m.black_id,stake,m.play_mode||'_refund',p_match_id)
    on conflict(id) do nothing;
  else
    winner_id:=case when m.result='white' then m.white_id else m.black_id end;
    payout:=case when m.play_mode='queue' then 11 else stake*2 end;
    update public.cb_profiles set gold_points=gold_points+payout where user_id=winner_id;
    insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
      values('match-payout:'||p_match_id,winner_id,payout,m.play_mode||'_payout',p_match_id)
      on conflict(id) do nothing;
  end if;
  update public.cb_matches set gold_settled=true where id=p_match_id;
end;
$function$;

revoke all on function public.cb_activate_gold_match(uuid,uuid) from public,anon,authenticated;
revoke all on function public.cb_settle_match_gold(uuid) from public,anon,authenticated;
grant execute on function public.cb_activate_gold_match(uuid,uuid) to service_role;
grant execute on function public.cb_settle_match_gold(uuid) to service_role;

commit;
