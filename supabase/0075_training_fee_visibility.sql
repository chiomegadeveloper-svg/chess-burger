-- Optional training fee visibility: owner can let the poster describe the terms.
-- Run after 0074_online_training_classroom.sql.
begin;
alter table public.cb_online_trainings
 drop constraint if exists cb_online_trainings_payment_mode_check;
alter table public.cb_online_trainings
 add constraint cb_online_trainings_payment_mode_check
 check(payment_mode in ('free','paid','hidden'));
alter table public.cb_online_trainings
 drop constraint if exists cb_training_payment_amount;
alter table public.cb_online_trainings
 add constraint cb_training_payment_amount
 check((payment_mode in ('free','hidden') and price_php=0)
    or (payment_mode='paid' and price_php>0));

create or replace function public.cb_training_save_v2(
 p_id uuid,p_title text,p_coach_name text,p_poster_url text,p_starts_at timestamptz,
 p_package text,p_category text,p_invitation_text text,p_payment_mode text,
 p_price_php numeric,p_cbc_reward integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); saved uuid; event public.cb_online_trainings%rowtype;
 room jsonb; slots integer; lifetime interval;
begin
 if owner is null or not exists(select 1 from public.cb_profiles where user_id=owner and role='owner')
 then raise exception 'Owner access required'; end if;
 select x.slots,x.life into slots,lifetime from (values
  ('pawn',5,interval '12 hours'),('bishop',10,interval '1 day'),
  ('knight',15,interval '3 days'),('rook',20,interval '5 days'),
  ('queen',30,interval '7 days'),('king',40,interval '14 days')
 ) x(kind,slots,life) where x.kind=p_package;
 if slots is null or char_length(btrim(coalesce(p_title,''))) not between 3 and 60
  or char_length(btrim(coalesce(p_coach_name,''))) not between 2 and 80
  or p_starts_at is null or p_starts_at<=now()
  or p_category not in ('u12','u15','u20','all')
  or char_length(coalesce(p_invitation_text,''))>500
  or char_length(coalesce(p_poster_url,''))>1000
  or p_payment_mode not in ('free','paid','hidden')
  or p_price_php is null or p_price_php<0 or p_price_php>1000000
  or (p_payment_mode in ('free','hidden') and p_price_php<>0)
  or (p_payment_mode='paid' and (p_price_php<=0 or char_length(btrim(coalesce(p_invitation_text,'')))<10))
  or p_cbc_reward is null or p_cbc_reward not between 0 and 1000
 then raise exception 'Invalid training details'; end if;
 if p_id is not null then
  select * into event from public.cb_online_trainings
  where id=p_id and owner_id=owner and status='open' for update;
  if not found then raise exception 'Training not found or owner access denied'; end if;
  if event.room_id is not null and event.package_kind<>p_package
  then raise exception 'Room package cannot be changed after creation'; end if;
  if exists(select 1 from public.cb_online_training_registrations where training_id=p_id)
    and (event.payment_mode<>p_payment_mode or event.price_php<>p_price_php)
  then raise exception 'Training fee cannot change after registration begins'; end if;
  if event.room_id is not null and exists(
    select 1 from public.cb_online_training_registrations
    where training_id=p_id and approved_at is not null
  ) and event.starts_at<>p_starts_at
  then raise exception 'Schedule cannot change after students are approved'; end if;
 end if;
 if p_id is null or event.room_id is null then
  room:=public.cb_create_classroom(owner,p_package,btrim(p_title),gen_random_uuid());
 else
  room:=jsonb_build_object('id',event.room_id);
 end if;
 update public.cb_classroom_rooms set name=btrim(p_title),
  expires_at=p_starts_at+lifetime
 where id=(room->>'id')::uuid and teacher_id=owner;
 if p_id is null then
  insert into public.cb_online_trainings(owner_id,title,coach_name,poster_url,starts_at,capacity,
   category,invitation_text,payment_mode,price_php,package_kind,room_id,cbc_reward)
  values(owner,btrim(p_title),btrim(p_coach_name),coalesce(p_poster_url,''),p_starts_at,slots,
   p_category,coalesce(p_invitation_text,''),p_payment_mode,p_price_php,p_package,
   (room->>'id')::uuid,p_cbc_reward) returning id into saved;
 else
  if (select count(*) from public.cb_online_training_registrations where training_id=p_id)>slots
  then raise exception 'Existing registrations exceed this room capacity'; end if;
  update public.cb_online_trainings set title=btrim(p_title),coach_name=btrim(p_coach_name),
   poster_url=coalesce(p_poster_url,''),starts_at=p_starts_at,capacity=slots,category=p_category,
   invitation_text=coalesce(p_invitation_text,''),payment_mode=p_payment_mode,price_php=p_price_php,
   package_kind=p_package,room_id=(room->>'id')::uuid,cbc_reward=p_cbc_reward
  where id=p_id returning id into saved;
 end if;
 return saved;
end $$;

commit;

