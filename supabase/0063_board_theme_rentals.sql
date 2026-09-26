-- Run after 0062. Existing board colors remain included; the new catalog is rented.
begin;

create table if not exists public.cb_board_themes (
  id text primary key,
  name text not null,
  active boolean not null default true
);

insert into public.cb_board_themes(id,name) values
  ('bubble-gum','Bubble Gum'),
  ('robotic','Robotic'),
  ('cyanotype-glass','Cyanotype Glass'),
  ('dark-warlock','Dark Warlock'),
  ('emerald-glass','Emerald Glass'),
  ('jungle','Jungle'),
  ('black-white','Black and White'),
  ('wood-texture','Wood Texture'),
  ('maroon-pink','Maroon and Light Pink'),
  ('sunset','Sunset'),
  ('black-cyan','Black and Light Cyan')
on conflict(id) do update set name=excluded.name,active=true;

create table if not exists public.cb_board_rentals (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  theme_id text not null references public.cb_board_themes(id),
  expires_at timestamptz not null,
  purchased_at timestamptz not null default now(),
  primary key(user_id,theme_id)
);
create index if not exists cb_board_rentals_expiry_idx on public.cb_board_rentals(user_id,expires_at desc);
alter table public.cb_board_themes enable row level security;
alter table public.cb_board_rentals enable row level security;
alter table public.cb_profiles add column if not exists active_board_theme text not null default 'slate';

create or replace function public.cb_rent_board_theme(p_user_id uuid,p_theme_id text,p_days integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_price integer;
  v_gold integer;
  v_expiry timestamptz;
begin
  if p_days not in (7,21,30) then raise exception 'Choose 1 week, 3 weeks, or 1 month'; end if;
  if not exists(select 1 from public.cb_board_themes where id=p_theme_id and active=true) then raise exception 'Board theme is unavailable'; end if;
  v_price := case p_days when 7 then 28 when 21 then 78 else 98 end;
  select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
  if v_gold is null then raise exception 'Player profile not found'; end if;
  if v_gold < v_price then raise exception 'Not enough Gold'; end if;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values('shop-board-rental:'||p_request_id::text,p_user_id,-v_price,'shop_rental',p_request_id)
  on conflict(id) do nothing;
  if not found then
    select expires_at into v_expiry from public.cb_board_rentals where user_id=p_user_id and theme_id=p_theme_id;
    return jsonb_build_object('charged',false,'gold',v_gold,'expires_at',v_expiry,'active',(select active_board_theme from public.cb_profiles where user_id=p_user_id));
  end if;
  update public.cb_profiles set gold_points=gold_points-v_price,active_board_theme=p_theme_id
  where user_id=p_user_id returning gold_points into v_gold;
  insert into public.cb_board_rentals(user_id,theme_id,expires_at,purchased_at)
  values(p_user_id,p_theme_id,now()+make_interval(days=>p_days),now())
  on conflict(user_id,theme_id) do update
  set expires_at=greatest(now(),cb_board_rentals.expires_at)+make_interval(days=>p_days),purchased_at=now()
  returning expires_at into v_expiry;
  return jsonb_build_object('charged',true,'gold',v_gold,'expires_at',v_expiry,'active',p_theme_id,'price',v_price);
end $$;

revoke all on function public.cb_rent_board_theme(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_rent_board_theme(uuid,text,integer,uuid) to service_role;
commit;
