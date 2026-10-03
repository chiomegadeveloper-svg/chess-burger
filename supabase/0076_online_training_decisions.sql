-- Online training decisions and private student status.
-- Apply after 0074 and 0075.
begin;
alter table public.cb_online_training_registrations add column if not exists rejected_at timestamptz;
alter table public.cb_online_training_registrations add column if not exists rejected_by uuid references public.cb_profiles(user_id);
alter table public.cb_online_training_registrations add column if not exists rejection_reason text
 check(char_length(rejection_reason)<=250);
create index if not exists cb_training_decisions_user_idx
 on public.cb_online_training_registrations(user_id,created_at desc);

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
  return case when existing.rejected_at is not null then 'rejected' when existing.approved_at is null then 'pending' else 'approved' end;
 end if;
 select * into existing from public.cb_online_training_registrations
 where training_id=p_id and user_id=person_id;
 if found then return case when existing.rejected_at is not null then 'rejected' when existing.approved_at is null then 'pending' else 'approved' end; end if;
 if exists(select 1 from public.cb_online_training_registrations
  where training_id=p_id and lower(full_name)=lower(name_clean) and birthdate=p_birthdate)
 then raise exception 'This name and birthdate are already registered; use your invitation link'; end if;
 if (select count(*) from public.cb_online_training_registrations where training_id=p_id and rejected_at is null)>=event.capacity
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
   (select count(*) from public.cb_online_training_registrations r where r.training_id=t.id and r.rejected_at is null),
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
    'approved',r.approved_at is not null,'rejected',r.rejected_at is not null,'rejection_reason',r.rejection_reason,'username',p.username,
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
 if reg.rejected_at is not null then raise exception 'This registration was declined'; end if;
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

create or replace function public.cb_training_reject(p_registration_id uuid,p_reason text default '') returns boolean
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); event public.cb_online_trainings%rowtype;
 reg public.cb_online_training_registrations%rowtype; reason text:=btrim(coalesce(p_reason,''));
begin
 if char_length(reason)>250 then raise exception 'Reason must be 250 characters or less'; end if;
 select t.* into event from public.cb_online_trainings t
 join public.cb_online_training_registrations r on r.training_id=t.id
 where r.id=p_registration_id for update of t;
 if not found or owner is null or event.owner_id<>owner or
  not exists(select 1 from public.cb_profiles where user_id=owner and role='owner')
 then raise exception 'Owner access required'; end if;
 select * into reg from public.cb_online_training_registrations where id=p_registration_id for update;
 if reg.approved_at is not null then raise exception 'Approved students must be removed separately'; end if;
 if reg.rejected_at is not null then return true; end if;
 update public.cb_online_training_registrations
 set rejected_at=now(),rejected_by=owner,rejection_reason=reason
 where id=p_registration_id;
 return true;
end $$;
revoke all on function public.cb_training_reject(uuid,text) from public,anon,authenticated;
grant execute on function public.cb_training_reject(uuid,text) to authenticated;

create or replace function public.cb_training_my_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'training_id',t.id,'title',t.title,'starts_at',t.starts_at,
  'approved_at',r.approved_at,'rejected_at',r.rejected_at,
  'rejection_reason',r.rejection_reason,'room_id',t.room_id
 ) order by r.created_at desc),'[]'::jsonb)
 from (select * from public.cb_online_training_registrations
       where user_id=auth.uid() order by created_at desc limit 30) r
 join public.cb_online_trainings t on t.id=r.training_id;
$$;
revoke all on function public.cb_training_my_status() from public,anon,authenticated;
grant execute on function public.cb_training_my_status() to authenticated;
commit;
