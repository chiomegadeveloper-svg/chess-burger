-- Require a completed Chess Burger account for online class registration.
-- Existing pending invitation links remain valid after the registrant signs in.
begin;

create or replace function public.cb_training_register(p_id uuid,p_full_name text,p_birthdate date,p_invite uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare event public.cb_online_trainings%rowtype; person_id uuid:=(select auth.uid()); name_clean text:=btrim(coalesce(p_full_name,''));
 existing public.cb_online_training_registrations%rowtype; participant_age integer;
begin
 if person_id is null or not exists(select 1 from public.cb_profiles where user_id=person_id and nullif(btrim(username),'') is not null)
 then raise exception 'Sign up or sign in to Chess Burger and complete your profile before joining this class'; end if;
 select * into event from public.cb_online_trainings where id=p_id for update;
 if not found or event.status<>'open' or event.starts_at<=now() then raise exception 'Registration is closed'; end if;
 if char_length(name_clean) not between 3 and 80 or name_clean !~ '[[:alpha:]]' then raise exception 'Enter your complete name'; end if;
 if p_birthdate is null or p_birthdate>current_date or p_birthdate<date '1900-01-01' then raise exception 'Enter a valid birthdate'; end if;
 participant_age:=date_part('year',age((event.starts_at at time zone 'Asia/Manila')::date,p_birthdate));
 if (event.category='u12' and participant_age>=12) or (event.category='u15' and participant_age>=15)
   or (event.category='u20' and participant_age>=20) then raise exception 'Your age does not match this training category'; end if;
 if p_invite is not null then
  select * into existing from public.cb_online_training_registrations where training_id=p_id and invite_token=p_invite for update;
  if not found or existing.birthdate<>p_birthdate then raise exception 'Invitation or birthdate does not match the registration'; end if;
  if existing.user_id is not null and existing.user_id<>person_id then raise exception 'This invitation has already been used'; end if;
  if existing.user_id is null and exists(select 1 from public.cb_online_training_registrations where training_id=p_id and user_id=person_id) then raise exception 'This account is already registered for the class'; end if;
  update public.cb_online_training_registrations set user_id=person_id where id=existing.id;
  return 'confirmed';
 end if;
 if exists(select 1 from public.cb_online_training_registrations where training_id=p_id and user_id=person_id) then return 'confirmed'; end if;
 if exists(select 1 from public.cb_online_training_registrations where training_id=p_id and lower(full_name)=lower(name_clean) and birthdate=p_birthdate) then
  raise exception 'This name and birthdate are already registered; use your invitation link'; end if;
 if (select count(*) from public.cb_online_training_registrations where training_id=p_id)>=event.capacity then raise exception 'This training is full'; end if;
 insert into public.cb_online_training_registrations(training_id,user_id,full_name,birthdate) values(p_id,person_id,name_clean,p_birthdate);
 return 'confirmed';
end $$;

create or replace function public.cb_training_manage() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'coach_name',t.coach_name,
   'poster_url',t.poster_url,'starts_at',t.starts_at,'capacity',t.capacity,'category',t.category,
   'invitation_text',t.invitation_text,'status',t.status,'registrants',coalesce((
     select jsonb_agg(jsonb_build_object('id',r.id,'full_name',r.full_name,'birthdate',r.birthdate,
       'confirmed',r.user_id is not null,'username',p.username,'invited_at',r.invited_at,'invite_token',r.invite_token) order by r.created_at)
     from public.cb_online_training_registrations r left join public.cb_profiles p on p.user_id=r.user_id where r.training_id=t.id),'[]'::jsonb)) order by t.starts_at desc),'[]'::jsonb)
 from public.cb_online_trainings t where t.owner_id=(select auth.uid())
 and exists(select 1 from public.cb_profiles p where p.user_id=(select auth.uid()) and p.role='owner');
$$;

revoke execute on function public.cb_training_register(uuid,text,date,uuid) from public,anon;
grant execute on function public.cb_training_register(uuid,text,date,uuid),public.cb_training_manage() to authenticated;

commit;
