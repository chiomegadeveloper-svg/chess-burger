-- Owner controlled global CBC admission for free classroom sessions.
-- Existing paid expiration timestamps are kept, so paid mode resumes normally.
begin;

alter table public.cb_classroom_settings add column if not exists cbc_enabled boolean not null default true;
alter table public.cb_classroom_student_boards add column if not exists free_movement boolean not null default false;

create or replace function public.cb_classroom_cbc_enabled() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select cbc_enabled from public.cb_classroom_settings where id=true),true);
$$;
revoke all on function public.cb_classroom_cbc_enabled() from public,anon;
grant execute on function public.cb_classroom_cbc_enabled() to authenticated,service_role;

create or replace function public.cb_join_classroom(
  p_user_id uuid,
  p_code text,
  p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  r public.cb_classroom_rooms%rowtype;
  active_students integer;
  balance bigint;
  paid boolean;
  enrolled boolean;
  access_until timestamptz;
  ledger_id text := 'classroom-join:' || p_request_id::text;
begin
  select * into r
  from public.cb_classroom_rooms
  where invite_code=upper(trim(p_code))
  for update;

  if not found or r.status<>'active' or r.expires_at<=now() then
    raise exception 'This classroom code is invalid or expired';
  end if;
  if r.teacher_id=p_user_id then
    raise exception 'Teachers cannot join their own room';
  end if;

  select access_expires_at into access_until
  from public.cb_classroom_enrollments
  where room_id=r.id and student_id=p_user_id
  for update;
  enrolled := found;

  paid := public.cb_classroom_cbc_enabled();
  if enrolled and (not paid or access_until>now()) then
    return to_jsonb(r) || jsonb_build_object('access_expires_at',access_until);
  end if;

  select count(*) into active_students
  from public.cb_classroom_enrollments
  where room_id=r.id and (not paid or access_expires_at>now());
  if active_students>=r.max_students then
    raise exception 'This classroom is full';
  end if;

  if paid then
    insert into public.cb_classroom_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
    select cbc into balance from public.cb_classroom_wallets where user_id=p_user_id for update;
    if balance<1 then raise exception 'You need 1 CBC for 30 minutes in this classroom'; end if;
  end if;

  access_until := case when paid then now() + interval '30 minutes' else now() - interval '1 second' end;
  insert into public.cb_classroom_enrollments(room_id,student_id,joined_at,access_expires_at)
  values(r.id,p_user_id,now(),access_until)
  on conflict(room_id,student_id) do update
    set joined_at=now(),access_expires_at=excluded.access_expires_at;

  if paid then
    update public.cb_classroom_wallets set cbc=cbc-1,updated_at=now() where user_id=p_user_id;
    insert into public.cb_classroom_credit_ledger(id,user_id,delta,kind,reference_id)
    values(ledger_id,p_user_id,-1,'classroom_30_minutes',r.id) on conflict(id) do nothing;
  end if;

  return to_jsonb(r) || jsonb_build_object('access_expires_at',access_until);
end $$;

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

create or replace function public.cb_has_classroom_access(
  p_user_id uuid,
  p_room_id uuid
) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1
    from public.cb_classroom_enrollments e
    join public.cb_classroom_rooms r on r.id=e.room_id
    where e.student_id=p_user_id and e.room_id=p_room_id
      and (e.access_expires_at>now() or not public.cb_classroom_cbc_enabled())
      and r.status='active' and r.expires_at>now()
  );
$$;


drop policy if exists "classroom participants read workspace" on public.cb_classroom_workspaces;
create policy "classroom participants read workspace"
on public.cb_classroom_workspaces for select to authenticated
using (
  exists(select 1 from public.cb_classroom_rooms r where r.id=room_id and r.teacher_id=auth.uid() and r.status='active' and r.expires_at>now())
  or exists(select 1 from public.cb_classroom_enrollments e join public.cb_classroom_rooms r on r.id=e.room_id where e.room_id=room_id and e.student_id=auth.uid() and (e.access_expires_at>now() or not public.cb_classroom_cbc_enabled()) and r.status='active' and r.expires_at>now())
);

drop policy if exists "classroom participants read student boards" on public.cb_classroom_student_boards;
create policy "classroom participants read student boards"
on public.cb_classroom_student_boards for select to authenticated
using (
  exists(select 1 from public.cb_classroom_rooms r where r.id=room_id and r.teacher_id=auth.uid() and r.status='active' and r.expires_at>now())
  or exists(select 1 from public.cb_classroom_enrollments e join public.cb_classroom_rooms r on r.id=e.room_id where e.room_id=room_id and e.student_id=auth.uid() and (e.access_expires_at>now() or not public.cb_classroom_cbc_enabled()) and r.status='active' and r.expires_at>now())
);


create or replace function public.cb_enforce_classroom_teacher_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and new.expires_at>now() and exists(
    select 1
    from public.cb_classroom_enrollments e
    join public.cb_classroom_rooms r on r.id=e.room_id
    where e.student_id=new.teacher_id
      and (e.access_expires_at>now() or not public.cb_classroom_cbc_enabled())
      and r.status='active'
      and r.expires_at>now()
  ) then
    raise exception 'You are currently an active student. Finish your classroom access before creating a teacher session.';
  end if;
  return new;
end $$;

drop trigger if exists cb_classroom_teacher_role_guard on public.cb_classroom_rooms;
create trigger cb_classroom_teacher_role_guard
before insert or update of teacher_id,status,expires_at on public.cb_classroom_rooms
for each row execute function public.cb_enforce_classroom_teacher_role();

create or replace function public.cb_enforce_classroom_student_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.access_expires_at>now() or not public.cb_classroom_cbc_enabled()) and exists(
    select 1 from public.cb_classroom_rooms
    where teacher_id=new.student_id
      and status='active'
      and expires_at>now()
  ) then
    raise exception 'You have an active teacher session. A teacher cannot enter or renew a student classroom.';
  end if;
  return new;
end $$;

drop trigger if exists cb_classroom_student_role_guard on public.cb_classroom_enrollments;
create trigger cb_classroom_student_role_guard
before insert or update of student_id,access_expires_at on public.cb_classroom_enrollments
for each row execute function public.cb_enforce_classroom_student_role();

commit;
