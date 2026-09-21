-- Chess Burger Grand Arena: tickets, timed sessions, elimination and champions.
begin;
alter table public.cb_matches add column if not exists arena_session_id uuid;
alter table public.cb_matches drop constraint if exists cb_matches_play_mode_check;
alter table public.cb_matches add constraint cb_matches_play_mode_check check(play_mode in('normal','wager','queue','arena'));

create table if not exists public.cb_arena_tickets(user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,quantity integer not null default 0 check(quantity>=0),updated_at timestamptz not null default now());
create table if not exists public.cb_arena_ticket_orders(request_id uuid primary key,user_id uuid not null references public.cb_profiles(user_id) on delete cascade,quantity integer not null check(quantity in(1,3,5)),price_gold integer not null check(price_gold in(28,78,128)),created_at timestamptz not null default now());
create table if not exists public.cb_arena_sessions(id uuid primary key default gen_random_uuid(),session_date date not null,slot smallint not null check(slot in(1,2)),starts_at timestamptz not null,ends_at timestamptz not null,champion_id uuid references public.cb_profiles(user_id) on delete set null,champion_rewarded_at timestamptz,created_at timestamptz not null default now(),unique(session_date,slot),check(ends_at>starts_at));
alter table public.cb_matches drop constraint if exists cb_matches_arena_session_id_fkey;
alter table public.cb_matches add constraint cb_matches_arena_session_id_fkey foreign key(arena_session_id) references public.cb_arena_sessions(id) on delete set null;
create table if not exists public.cb_arena_entries(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.cb_arena_sessions(id) on delete cascade,user_id uuid not null references public.cb_profiles(user_id) on delete cascade,status text not null default 'waiting' check(status in('waiting','playing','eliminated','champion')),wins integer not null default 0 check(wins>=0),arena_cbr_gain integer not null default 0 check(arena_cbr_gain>=0),arena_gold_gain integer not null default 0 check(arena_gold_gain>=0),current_match_id uuid references public.cb_matches(id) on delete set null,joined_at timestamptz not null default now(),seen_at timestamptz not null default now(),eliminated_at timestamptz,unique(session_id,user_id));
create index if not exists cb_arena_entries_queue_idx on public.cb_arena_entries(session_id,status,seen_at) where status='waiting';
create index if not exists cb_matches_arena_idx on public.cb_matches(arena_session_id,status,created_at desc);
alter table public.cb_arena_tickets enable row level security;alter table public.cb_arena_ticket_orders enable row level security;alter table public.cb_arena_sessions enable row level security;alter table public.cb_arena_entries enable row level security;
revoke all on public.cb_arena_tickets,public.cb_arena_ticket_orders,public.cb_arena_sessions,public.cb_arena_entries from anon,authenticated;

create or replace function public.cb_buy_arena_tickets(p_user_id uuid,p_quantity integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_price integer;v_gold integer;v_tickets integer;v_inserted uuid;
begin
 v_price:=case p_quantity when 1 then 28 when 3 then 78 when 5 then 128 else null end;if v_price is null then raise exception 'Choose a valid Arena Ticket bundle.';end if;
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;if v_gold is null then raise exception 'Player profile not found.';end if;
 insert into public.cb_arena_ticket_orders(request_id,user_id,quantity,price_gold) values(p_request_id,p_user_id,p_quantity,v_price) on conflict(request_id) do nothing returning request_id into v_inserted;
 if v_inserted is not null then
  if v_gold<v_price then delete from public.cb_arena_ticket_orders where request_id=p_request_id;raise exception 'Not enough Gold';end if;
  update public.cb_profiles set gold_points=gold_points-v_price where user_id=p_user_id returning gold_points into v_gold;
  insert into public.cb_arena_tickets(user_id,quantity) values(p_user_id,p_quantity) on conflict(user_id) do update set quantity=cb_arena_tickets.quantity+excluded.quantity,updated_at=now() returning quantity into v_tickets;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-tickets:'||p_request_id::text,p_user_id,-v_price,'arena_ticket_purchase',p_request_id) on conflict(id) do nothing;
 else select quantity into v_tickets from public.cb_arena_tickets where user_id=p_user_id;select gold_points into v_gold from public.cb_profiles where user_id=p_user_id;end if;
 return jsonb_build_object('tickets',coalesce(v_tickets,0),'gold',v_gold,'charged',v_inserted is not null);
end $$;

create or replace function public.cb_enter_grand_arena(p_user_id uuid,p_session_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.cb_arena_sessions%rowtype;e public.cb_arena_entries%rowtype;v_tickets integer;
begin
 select * into s from public.cb_arena_sessions where id=p_session_id for update;if s.id is null or now()<s.starts_at or now()>=s.ends_at-interval '10 minutes' then raise exception 'Arena entry is closed for this session.';end if;
 select * into e from public.cb_arena_entries where session_id=s.id and user_id=p_user_id;
 if e.id is not null and e.status in('waiting','playing','champion') then return jsonb_build_object('entry_id',e.id,'tickets',(select coalesce(quantity,0) from public.cb_arena_tickets where user_id=p_user_id),'charged',false);end if;
 select quantity into v_tickets from public.cb_arena_tickets where user_id=p_user_id for update;if coalesce(v_tickets,0)<1 then raise exception 'You need an Arena Ticket to enter.';end if;
 update public.cb_arena_tickets set quantity=quantity-1,updated_at=now() where user_id=p_user_id returning quantity into v_tickets;
 if e.id is null then insert into public.cb_arena_entries(session_id,user_id,status,seen_at) values(s.id,p_user_id,'waiting',now()) returning * into e;
 else update public.cb_arena_entries set status='waiting',wins=0,arena_cbr_gain=0,arena_gold_gain=0,current_match_id=null,joined_at=now(),seen_at=now(),eliminated_at=null where id=e.id returning * into e;end if;
 return jsonb_build_object('entry_id',e.id,'tickets',v_tickets,'charged',true);
end $$;

create or replace function public.cb_settle_arena_match(p_match_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.cb_matches%rowtype;winner_id uuid;loser_id uuid;winner_cbr integer;loser_cbr integer;regular_delta integer;total_delta integer;
begin
 select * into m from public.cb_matches where id=p_match_id for update;if m.id is null or m.play_mode<>'arena' or m.status<>'finished' or m.rating_applied then return jsonb_build_object('settled',false);end if;
 if m.result='draw' then update public.cb_arena_entries set status='waiting',current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id in(m.white_id,m.black_id);update public.cb_matches set rating_applied=true where id=m.id;return jsonb_build_object('settled',true,'draw',true);end if;
 winner_id:=case when m.result='white' then m.white_id else m.black_id end;loser_id:=case when m.result='white' then m.black_id else m.white_id end;
 perform 1 from public.cb_profiles where user_id in(winner_id,loser_id) order by user_id for update;select cbr into winner_cbr from public.cb_profiles where user_id=winner_id;select cbr into loser_cbr from public.cb_profiles where user_id=loser_id;
 regular_delta:=case when abs(winner_cbr-loser_cbr)>20 then greatest(1,floor(loser_cbr*.20)::integer) else 0 end;total_delta:=regular_delta+4;
 update public.cb_profiles set cbr=cbr+total_delta,gold_points=gold_points+8,wins=wins+1,win_streak=win_streak+1 where user_id=winner_id;update public.cb_profiles set losses=losses+1,win_streak=0 where user_id=loser_id;
 update public.cb_arena_entries set status='waiting',wins=wins+1,arena_cbr_gain=arena_cbr_gain+total_delta,arena_gold_gain=arena_gold_gain+8,current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id=winner_id;
 update public.cb_arena_entries set status='eliminated',current_match_id=null,eliminated_at=now() where session_id=m.arena_session_id and user_id=loser_id;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-win:'||m.id::text,winner_id,8,'arena_win',m.id) on conflict(id) do nothing;
 insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta) select winner_id,'win',display_name,'won a Grand Arena match.',total_delta,8 from public.cb_profiles where user_id=winner_id;
 update public.cb_matches set rating_applied=true where id=m.id;return jsonb_build_object('settled',true,'winner_id',winner_id,'loser_id',loser_id,'cbr_delta',total_delta,'gold_delta',8);
end $$;

create or replace function public.cb_resolve_arena_cancelled_match(p_match_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m public.cb_matches%rowtype;loser_id uuid;survivor_id uuid;
begin select * into m from public.cb_matches where id=p_match_id for update;if m.id is null or m.play_mode<>'arena' or m.status<>'cancelled' or m.rating_applied then return;end if;loser_id:=nullif(m.game_meta#>>'{last,by}','')::uuid;if loser_id is null or loser_id not in(m.white_id,m.black_id) then loser_id:=m.host_id;end if;survivor_id:=case when loser_id=m.white_id then m.black_id else m.white_id end;update public.cb_arena_entries set status='eliminated',current_match_id=null,eliminated_at=now() where session_id=m.arena_session_id and user_id=loser_id;update public.cb_arena_entries set status='waiting',current_match_id=null,seen_at=now() where session_id=m.arena_session_id and user_id=survivor_id;update public.cb_matches set rating_applied=true where id=m.id;end $$;

create or replace function public.cb_finalize_arena_sessions() returns integer language plpgsql security definer set search_path=public as $$
declare s record;champ record;processed integer:=0;
begin for s in select * from public.cb_arena_sessions where ends_at<=now() and champion_rewarded_at is null for update skip locked loop
 select e.user_id,e.wins,e.arena_cbr_gain into champ from public.cb_arena_entries e where e.session_id=s.id and e.wins>0 order by e.wins desc,e.arena_cbr_gain desc,e.joined_at asc limit 1;
 if champ.user_id is not null then update public.cb_profiles set gold_points=gold_points+48,cbr=cbr+28 where user_id=champ.user_id;update public.cb_arena_entries set status='champion',arena_gold_gain=arena_gold_gain+48,arena_cbr_gain=arena_cbr_gain+28 where session_id=s.id and user_id=champ.user_id;insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('arena-champion:'||s.id::text,champ.user_id,48,'arena_champion',s.id) on conflict(id) do nothing;insert into public.cb_feed(user_id,kind,display_name,content,cbr_delta,gold_delta) select champ.user_id,'new_reward',display_name,'became Grand Arena Daily Champion.',28,48 from public.cb_profiles where user_id=champ.user_id;update public.cb_arena_sessions set champion_id=champ.user_id,champion_rewarded_at=now() where id=s.id;else update public.cb_arena_sessions set champion_rewarded_at=now() where id=s.id;end if;processed:=processed+1;end loop;return processed;end $$;

revoke all on function public.cb_buy_arena_tickets(uuid,integer,uuid),public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid),public.cb_finalize_arena_sessions() from public,anon,authenticated;
grant execute on function public.cb_buy_arena_tickets(uuid,integer,uuid),public.cb_enter_grand_arena(uuid,uuid),public.cb_settle_arena_match(uuid),public.cb_resolve_arena_cancelled_match(uuid),public.cb_finalize_arena_sessions() to service_role;
commit;
