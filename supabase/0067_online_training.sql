-- Online training public signup, private registration data, and owner invitations.
begin;

create table if not exists public.cb_online_trainings (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.cb_profiles(user_id),
 title text not null check(char_length(title) between 3 and 100),
 coach_name text not null check(char_length(coach_name) between 2 and 80),
 poster_url text not null default '',
 starts_at timestamptz not null,
 capacity integer not null check(capacity between 1 and 500),
 category text not null check(category in ('u12','u15','u20','all')),
 invitation_text text not null default '' check(char_length(invitation_text)<=500),
 status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now()
);
create table if not exists public.cb_online_training_registrations (
 id uuid primary key default gen_random_uuid(),
 training_id uuid not null references public.cb_online_trainings(id) on delete cascade,
 user_id uuid references public.cb_profiles(user_id) on delete set null,
 full_name text not null check(char_length(full_name) between 3 and 80),
 birthdate date not null,
 invite_token uuid not null default gen_random_uuid() unique,
 invited_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists cb_training_user_once on public.cb_online_training_registrations(training_id,user_id) where user_id is not null;
create index if not exists cb_training_registration_event on public.cb_online_training_registrations(training_id,created_at);
alter table public.cb_online_trainings enable row level security;
alter table public.cb_online_training_registrations enable row level security;
revoke all on public.cb_online_trainings,public.cb_online_training_registrations from public,anon,authenticated;

-- Retire the former First blood feed activity and its publishing action.
delete from public.cb_feed where kind='first_blood';
do $$ begin
 if to_regprocedure('public.cb_publish_first_blood(text)') is not null then
  execute 'revoke execute on function public.cb_publish_first_blood(text) from public,anon,authenticated';
 end if;
end $$;

create or replace function public.cb_training_public(p_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'title',t.title,'coach_name',t.coach_name,'poster_url',t.poster_url,
  'starts_at',t.starts_at,'capacity',t.capacity,'category',t.category,
  'invitation_text',t.invitation_text,'registered',
   (select count(*) from public.cb_online_training_registrations r where r.training_id=t.id),
  'confirmed',
   (select count(*) from public.cb_online_training_registrations r where r.training_id=t.id and r.user_id is not null)
 ) order by t.starts_at),'[]'::jsonb)
 from public.cb_online_trainings t where t.status='open' and t.starts_at>now() and (p_id is null or t.id=p_id);
$$;

create or replace function public.cb_training_register(p_id uuid,p_full_name text,p_birthdate date,p_invite uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare event public.cb_online_trainings%rowtype; person_id uuid:=(select auth.uid()); name_clean text:=btrim(coalesce(p_full_name,''));
 existing public.cb_online_training_registrations%rowtype; participant_age integer;
begin
 select * into event from public.cb_online_trainings where id=p_id for update;
 if not found or event.status<>'open' or event.starts_at<=now() then raise exception 'Registration is closed'; end if;
 if char_length(name_clean) not between 3 and 80 or name_clean !~ '[[:alpha:]]' then raise exception 'Enter your complete name'; end if;
 if p_birthdate is null or p_birthdate>current_date or p_birthdate<date '1900-01-01' then raise exception 'Enter a valid birthdate'; end if;
 participant_age:=date_part('year',age((event.starts_at at time zone 'Asia/Manila')::date,p_birthdate));
 if (event.category='u12' and participant_age>=12) or (event.category='u15' and participant_age>=15)
   or (event.category='u20' and participant_age>=20) then raise exception 'Your age does not match this training category'; end if;
 if p_invite is not null then
  if person_id is null then raise exception 'Create or sign in to your Chess Burger account to accept the invitation'; end if;
  select * into existing from public.cb_online_training_registrations where training_id=p_id and invite_token=p_invite for update;
  if not found or existing.birthdate<>p_birthdate then raise exception 'Invitation or birthdate does not match the registration'; end if;
  if existing.user_id is not null and existing.user_id<>person_id then raise exception 'This invitation has already been used'; end if;
  if not exists(select 1 from public.cb_profiles where user_id=person_id) then raise exception 'Complete your Chess Burger profile first'; end if;
  update public.cb_online_training_registrations set user_id=person_id where id=existing.id;
  return 'confirmed';
 end if;
 if person_id is not null and not exists(select 1 from public.cb_profiles where user_id=person_id) then raise exception 'Complete your Chess Burger profile first'; end if;
 if person_id is not null and exists(select 1 from public.cb_online_training_registrations where training_id=p_id and user_id=person_id) then return 'confirmed'; end if;
 if exists(select 1 from public.cb_online_training_registrations where training_id=p_id and lower(full_name)=lower(name_clean) and birthdate=p_birthdate) then
  raise exception 'This name and birthdate are already registered; use your invitation link'; end if;
 if (select count(*) from public.cb_online_training_registrations where training_id=p_id)>=event.capacity then raise exception 'This training is full'; end if;
 insert into public.cb_online_training_registrations(training_id,user_id,full_name,birthdate) values(p_id,person_id,name_clean,p_birthdate);
 return case when person_id is null then 'pending' else 'confirmed' end;
end $$;

create or replace function public.cb_training_save(p_id uuid,p_title text,p_coach_name text,p_poster_url text,p_starts_at timestamptz,p_capacity integer,p_category text,p_invitation_text text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); saved uuid;
begin
 if owner is null or not exists(select 1 from public.cb_profiles where user_id=owner and role='owner') then raise exception 'Owner access required'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 3 and 100 or char_length(btrim(coalesce(p_coach_name,''))) not between 2 and 80
  or p_starts_at<=now() or p_capacity not between 1 and 500 or p_category not in ('u12','u15','u20','all')
  or char_length(coalesce(p_invitation_text,''))>500 or char_length(coalesce(p_poster_url,''))>1000 then raise exception 'Invalid training details'; end if;
 if p_id is null then
  insert into public.cb_online_trainings(owner_id,title,coach_name,poster_url,starts_at,capacity,category,invitation_text)
  values(owner,btrim(p_title),btrim(p_coach_name),coalesce(p_poster_url,''),p_starts_at,p_capacity,p_category,coalesce(p_invitation_text,'')) returning id into saved;
 else
  update public.cb_online_trainings set title=btrim(p_title),coach_name=btrim(p_coach_name),poster_url=coalesce(p_poster_url,''),starts_at=p_starts_at,
   capacity=p_capacity,category=p_category,invitation_text=coalesce(p_invitation_text,'') where id=p_id and owner_id=owner and status='open' returning id into saved;
  if saved is null then raise exception 'Training not found or owner access denied'; end if;
 end if;
 return saved;
end $$;

create or replace function public.cb_training_manage() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'coach_name',t.coach_name,
   'poster_url',t.poster_url,'starts_at',t.starts_at,'capacity',t.capacity,'category',t.category,
   'invitation_text',t.invitation_text,'status',t.status,'registrants',coalesce((
     select jsonb_agg(jsonb_build_object('id',r.id,'full_name',r.full_name,'birthdate',r.birthdate,
       'confirmed',r.user_id is not null,'invited_at',r.invited_at,'invite_token',r.invite_token) order by r.created_at)
     from public.cb_online_training_registrations r where r.training_id=t.id),'[]'::jsonb)) order by t.starts_at desc),'[]'::jsonb)
 from public.cb_online_trainings t where t.owner_id=(select auth.uid())
 and exists(select 1 from public.cb_profiles p where p.user_id=(select auth.uid()) and p.role='owner');
$$;

create or replace function public.cb_training_invite(p_registration_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
 update public.cb_online_training_registrations r set invited_at=now()
 from public.cb_online_trainings t,public.cb_profiles owner
 where r.id=p_registration_id and t.id=r.training_id and t.owner_id=(select auth.uid())
   and owner.user_id=t.owner_id and owner.role='owner' and t.status='open' and t.starts_at>now()
 returning r.invite_token into token;
 if token is null then raise exception 'Registrant or training unavailable'; end if;
 return token;
end $$;

revoke all on function public.cb_training_public(uuid),public.cb_training_register(uuid,text,date,uuid),
 public.cb_training_save(uuid,text,text,text,timestamptz,integer,text,text),public.cb_training_manage(),public.cb_training_invite(uuid) from public,anon,authenticated;
grant execute on function public.cb_training_public(uuid),public.cb_training_register(uuid,text,date,uuid) to anon,authenticated;
grant execute on function public.cb_training_save(uuid,text,text,text,timestamptz,integer,text,text),
 public.cb_training_manage(),public.cb_training_invite(uuid) to authenticated;

commit;
