-- Bind online trainings to purchased classroom rooms and owner approval.
begin;
alter table public.cb_online_trainings add column if not exists payment_mode text not null default 'free'
  check(payment_mode in ('free','paid'));
alter table public.cb_online_trainings add column if not exists price_php numeric(10,2) not null default 0
  check(price_php>=0 and price_php<=1000000);
alter table public.cb_online_trainings add column if not exists package_kind text
  check(package_kind in ('pawn','bishop','knight','rook','queen','king'));
alter table public.cb_online_trainings add column if not exists room_id uuid unique references public.cb_classroom_rooms(id) on delete set null;
alter table public.cb_online_trainings add column if not exists cbc_reward integer not null default 0
  check(cbc_reward between 0 and 1000);
alter table public.cb_online_trainings add constraint cb_training_payment_amount
  check((payment_mode='free' and price_php=0) or (payment_mode='paid' and price_php>0));
alter table public.cb_online_training_registrations add column if not exists approved_at timestamptz;
alter table public.cb_online_training_registrations add column if not exists approved_by uuid references public.cb_profiles(user_id);

-- The package is paid by the owner through the existing room purchase RPC.
-- Its lifetime starts at the event time, including for events scheduled in advance.
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
  or p_payment_mode not in ('free','paid')
  or p_price_php is null or p_price_php<0 or p_price_php>1000000
  or (p_payment_mode='free' and p_price_php<>0)
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

-- Legacy clients must use the new room-backed save path.
revoke execute on function public.cb_training_save(uuid,text,text,text,timestamptz,integer,text,text)
 from public,anon,authenticated;
revoke all on function public.cb_training_save_v2(uuid,text,text,text,timestamptz,text,text,text,text,numeric,integer)
 from public,anon,authenticated;
grant execute on function public.cb_training_save_v2(uuid,text,text,text,timestamptz,text,text,text,text,numeric,integer)
 to authenticated;

create or replace function public.cb_training_register(p_id uuid,p_full_name text,p_birthdate date,p_invite uuid default null)
returns text language plpgsql security definer set search_path='' as $$
declare event public.cb_online_trainings%rowtype; person_id uuid:=auth.uid();
 name_clean text:=btrim(coalesce(p_full_name,'')); existing public.cb_online_training_registrations%rowtype;
 participant_age integer;
begin
 if person_id is null or not exists(select 1 from public.cb_profiles
  where user_id=person_id and nullif(btrim(username),'') is not null)
 then raise exception 'Sign in and complete your Chess Burger profile before registering'; end if;
 select * into event from public.cb_online_trainings where id=p_id for update;
 if not found or event.status<>'open' or event.starts_at<=now() then raise exception 'Registration is closed'; end if;
 if char_length(name_clean) not between 3 and 80 or name_clean !~ '[[:alpha:]]'
 then raise exception 'Enter your complete name'; end if;
 if p_birthdate is null or p_birthdate>current_date or p_birthdate<date '1900-01-01'
 then raise exception 'Enter a valid birthdate'; end if;
 participant_age:=date_part('year',age((event.starts_at at time zone 'Asia/Manila')::date,p_birthdate));
 if (event.category='u12' and participant_age>=12) or
    (event.category='u15' and participant_age>=15) or
    (event.category='u20' and participant_age>=20)
 then raise exception 'Your age does not match this training category'; end if;
 if p_invite is not null then
  select * into existing from public.cb_online_training_registrations
   where training_id=p_id and invite_token=p_invite for update;
  if not found or existing.birthdate<>p_birthdate
  then raise exception 'Invitation or birthdate does not match the registration'; end if;
  if existing.user_id is not null and existing.user_id<>person_id
  then raise exception 'This invitation has already been used'; end if;
  if existing.user_id is null and exists(select 1 from public.cb_online_training_registrations
   where training_id=p_id and user_id=person_id)
  then raise exception 'This account is already registered'; end if;
  update public.cb_online_training_registrations set user_id=person_id where id=existing.id;
  return case when existing.approved_at is null then 'pending' else 'approved' end;
 end if;
 select * into existing from public.cb_online_training_registrations
 where training_id=p_id and user_id=person_id;
 if found then return case when existing.approved_at is null then 'pending' else 'approved' end; end if;
 if exists(select 1 from public.cb_online_training_registrations
  where training_id=p_id and lower(full_name)=lower(name_clean) and birthdate=p_birthdate)
 then raise exception 'This name and birthdate are already registered; use your invitation link'; end if;
 if (select count(*) from public.cb_online_training_registrations where training_id=p_id)>=event.capacity
 then raise exception 'This training is full'; end if;
 insert into public.cb_online_training_registrations(training_id,user_id,full_name,birthdate)
 values(p_id,person_id,name_clean,p_birthdate);
 return 'pending';
end $$;

create or replace function public.cb_training_public(p_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'title',t.title,'coach_name',t.coach_name,'poster_url',t.poster_url,
  'starts_at',t.starts_at,'capacity',t.capacity,'category',t.category,
  'invitation_text',t.invitation_text,'payment_mode',t.payment_mode,'price_php',t.price_php,
  'package_kind',t.package_kind,'registered',
   (select count(*) from public.cb_online_training_registrations r where r.training_id=t.id),
  'confirmed',
   (select count(*) from public.cb_online_training_registrations r where r.training_id=t.id and r.approved_at is not null)
 ) order by t.starts_at),'[]'::jsonb)
 from public.cb_online_trainings t where t.status='open' and t.starts_at>now()
  and (p_id is null or t.id=p_id);
$$;

create or replace function public.cb_training_manage() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'title',t.title,'coach_name',t.coach_name,'poster_url',t.poster_url,
  'starts_at',t.starts_at,'capacity',t.capacity,'category',t.category,
  'invitation_text',t.invitation_text,'status',t.status,
  'payment_mode',t.payment_mode,'price_php',t.price_php,'package_kind',t.package_kind,
  'cbc_reward',t.cbc_reward,'room_id',t.room_id,'room_code',room.invite_code,
  'registrants',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',r.id,'full_name',r.full_name,'birthdate',r.birthdate,'confirmed',r.user_id is not null,
    'approved',r.approved_at is not null,'username',p.username,
    'invited_at',r.invited_at,'invite_token',r.invite_token
   ) order by r.created_at)
   from public.cb_online_training_registrations r
   left join public.cb_profiles p on p.user_id=r.user_id
   where r.training_id=t.id),'[]'::jsonb)
 ) order by t.starts_at desc),'[]'::jsonb)
 from public.cb_online_trainings t
 left join public.cb_classroom_rooms room on room.id=t.room_id
 where t.owner_id=auth.uid() and exists(
  select 1 from public.cb_profiles p where p.user_id=auth.uid() and p.role='owner');
$$;

create or replace function public.cb_training_approve(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); event public.cb_online_trainings%rowtype;
 reg public.cb_online_training_registrations%rowtype; room public.cb_classroom_rooms%rowtype;
 balance bigint; approved_count integer;
begin
 select t.* into event from public.cb_online_trainings t
 join public.cb_online_training_registrations r on r.training_id=t.id
 where r.id=p_registration_id for update of t;
 if not found or owner is null or event.owner_id<>owner or
  not exists(select 1 from public.cb_profiles where user_id=owner and role='owner')
 then raise exception 'Owner access required'; end if;
 select * into reg from public.cb_online_training_registrations where id=p_registration_id for update;
 if reg.approved_at is not null
 then return jsonb_build_object('approved',true,'already_approved',true,'room_id',event.room_id); end if;
 if event.status<>'open' or event.room_id is null
 then raise exception 'This training has no active room session'; end if;
 if reg.user_id is null then raise exception 'The registrant must link a Chess Burger account'; end if;
 select * into room from public.cb_classroom_rooms where id=event.room_id for update;
 if not found or room.teacher_id<>owner or room.status<>'active' or room.expires_at<=now()
 then raise exception 'This classroom is closed or expired'; end if;
 select count(*) into approved_count from public.cb_online_training_registrations
 where training_id=event.id and approved_at is not null;
 if approved_count>=room.max_students then raise exception 'This room is full'; end if;
 if exists(select 1 from public.cb_classroom_enrollments
  where room_id=room.id and student_id=reg.user_id)
 then raise exception 'This student is already in the room'; end if;
 insert into public.cb_classroom_wallets(user_id) values(owner),(reg.user_id)
 on conflict(user_id) do nothing;
 select cbc into balance from public.cb_classroom_wallets where user_id=owner for update;
 if balance<event.cbc_reward then raise exception 'Owner needs more CBC to award this registrant'; end if;
 insert into public.cb_classroom_enrollments(room_id,student_id,access_expires_at)
 values(room.id,reg.user_id,room.expires_at);
 if event.cbc_reward>0 then
  update public.cb_classroom_wallets set cbc=cbc-event.cbc_reward,updated_at=now()
   where user_id=owner;
  update public.cb_classroom_wallets set cbc=cbc+event.cbc_reward,updated_at=now()
   where user_id=reg.user_id;
  insert into public.cb_classroom_credit_ledger(id,user_id,delta,kind,reference_id)
   values('training-award:'||reg.id||':out',owner,-event.cbc_reward,'training_award',event.id),
         ('training-award:'||reg.id||':in',reg.user_id,event.cbc_reward,'training_award',event.id);
 end if;
 update public.cb_online_training_registrations set approved_at=now(),approved_by=owner
 where id=reg.id;
 return jsonb_build_object('approved',true,'room_id',room.id,'cbc_awarded',event.cbc_reward);
end $$;
revoke all on function public.cb_training_approve(uuid) from public,anon,authenticated;
grant execute on function public.cb_training_approve(uuid) to authenticated;

-- A training room is invitation-only; public classroom codes cannot bypass approval.
create or replace function public.cb_join_classroom(p_user_id uuid,p_code text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.cb_classroom_rooms%rowtype; active_students integer;
 balance bigint; paid boolean; enrolled boolean; access_until timestamptz;
 ledger_id text:='classroom-join:'||p_request_id::text;
begin
 select * into r from public.cb_classroom_rooms where invite_code=upper(trim(p_code)) for update;
 if not found or r.status<>'active' or r.expires_at<=now()
 then raise exception 'This classroom code is invalid or expired'; end if;
 if exists(select 1 from public.cb_online_trainings where room_id=r.id)
 then raise exception 'Register for this online training and wait for owner approval'; end if;
 if r.teacher_id=p_user_id then raise exception 'Teachers cannot join their own room'; end if;
 select access_expires_at into access_until from public.cb_classroom_enrollments
 where room_id=r.id and student_id=p_user_id for update;
 enrolled:=found;
 paid:=public.cb_classroom_cbc_enabled();
 if enrolled and (not paid or access_until>now())
 then return to_jsonb(r)||jsonb_build_object('access_expires_at',access_until); end if;
 select count(*) into active_students from public.cb_classroom_enrollments
 where room_id=r.id and (not paid or access_expires_at>now());
 if active_students>=r.max_students then raise exception 'This classroom is full'; end if;
 if paid then
  insert into public.cb_classroom_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select cbc into balance from public.cb_classroom_wallets where user_id=p_user_id for update;
  if balance<1 then raise exception 'You need 1 CBC for 30 minutes in this classroom'; end if;
 end if;
 access_until:=case when paid then now()+interval '30 minutes' else now()-interval '1 second' end;
 insert into public.cb_classroom_enrollments(room_id,student_id,joined_at,access_expires_at)
 values(r.id,p_user_id,now(),access_until)
 on conflict(room_id,student_id) do update set joined_at=now(),access_expires_at=excluded.access_expires_at;
 if paid then
  update public.cb_classroom_wallets set cbc=cbc-1,updated_at=now() where user_id=p_user_id;
  insert into public.cb_classroom_credit_ledger(id,user_id,delta,kind,reference_id)
  values(ledger_id,p_user_id,-1,'classroom_30_minutes',r.id) on conflict(id) do nothing;
 end if;
 return to_jsonb(r)||jsonb_build_object('access_expires_at',access_until);
end $$;
revoke all on function public.cb_join_classroom(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.cb_join_classroom(uuid,text,uuid) to service_role;
create or replace function public.cb_training_remove(p_registration_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare event public.cb_online_trainings%rowtype; reg public.cb_online_training_registrations%rowtype;
begin
 select t.* into event from public.cb_online_trainings t
 join public.cb_online_training_registrations r on r.training_id=t.id
 where r.id=p_registration_id for update of t;
 if not found or event.owner_id<>auth.uid() or
  not exists(select 1 from public.cb_profiles where user_id=auth.uid() and role='owner')
 then raise exception 'Owner access required'; end if;
 select * into reg from public.cb_online_training_registrations where id=p_registration_id for update;
 if reg.approved_at is not null and event.room_id is not null then
  delete from public.cb_classroom_enrollments
   where room_id=event.room_id and student_id=reg.user_id;
 end if;
 delete from public.cb_online_training_registrations where id=p_registration_id;
 return true;
end $$;
create or replace function public.cb_training_delete(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare event public.cb_online_trainings%rowtype;
begin
 select * into event from public.cb_online_trainings where id=p_id for update;
 if not found or event.owner_id<>auth.uid() or
  not exists(select 1 from public.cb_profiles where user_id=auth.uid() and role='owner')
 then raise exception 'Owner access required'; end if;
 if event.room_id is not null then
  update public.cb_classroom_rooms set status='closed' where id=event.room_id;
  delete from public.cb_classroom_enrollments where room_id=event.room_id;
 end if;
 delete from public.cb_online_trainings where id=p_id;
 return true;
end $$;
revoke all on function public.cb_training_remove(uuid),public.cb_training_delete(uuid)
 from public,anon,authenticated;
grant execute on function public.cb_training_remove(uuid),public.cb_training_delete(uuid) to authenticated;
create or replace function public.cb_extend_classroom_access(
  p_user_id uuid,
  p_room_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  r public.cb_classroom_rooms%rowtype;
  balance bigint;
  current_until timestamptz;
  next_until timestamptz;
  ledger_id text := 'classroom-extend:' || p_request_id::text;
begin
  select * into r from public.cb_classroom_rooms
  where id=p_room_id for update;
  if not found or r.status<>'active' or r.expires_at<=now() then
    raise exception 'This classroom is no longer active';
  end if;

  select access_expires_at into current_until
  from public.cb_classroom_enrollments
  where room_id=p_room_id and student_id=p_user_id
  for update;
  if not found then
    raise exception 'Join this classroom with its private code first';
  end if;

  if exists(select 1 from public.cb_online_trainings where room_id=p_room_id) then
    return jsonb_build_object('access_expires_at',current_until,'training',true);
  end if;

  if not (select cbc_enabled from public.cb_classroom_settings where id=true) then
    return jsonb_build_object('access_expires_at',current_until,'free',true);
  end if;
  if exists(select 1 from public.cb_classroom_credit_ledger where id=ledger_id) then
    return jsonb_build_object('access_expires_at',current_until);
  end if;

  insert into public.cb_classroom_wallets(user_id)
  values(p_user_id) on conflict(user_id) do nothing;
  select cbc into balance from public.cb_classroom_wallets
  where user_id=p_user_id for update;
  if balance<1 then
    raise exception 'You need 1 CBC to add 30 minutes';
  end if;

  next_until := greatest(current_until,now()) + interval '30 minutes';
  update public.cb_classroom_enrollments
  set access_expires_at=next_until
  where room_id=p_room_id and student_id=p_user_id;
  update public.cb_classroom_wallets
  set cbc=cbc-1,updated_at=now() where user_id=p_user_id;
  insert into public.cb_classroom_credit_ledger(id,user_id,delta,kind,reference_id)
  values(ledger_id,p_user_id,-1,'classroom_extend_30_minutes',p_room_id);

  return jsonb_build_object('access_expires_at',next_until,'cbc',balance-1);
end $$;
commit;
