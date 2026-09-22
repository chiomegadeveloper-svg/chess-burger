-- Classroom timed student access: 1 CBC per 30 minutes.
alter table public.cb_classroom_enrollments
  add column if not exists access_expires_at timestamptz;

update public.cb_classroom_enrollments
set access_expires_at = greatest(joined_at + interval '30 minutes', now() + interval '30 minutes')
where access_expires_at is null;

alter table public.cb_classroom_enrollments
  alter column access_expires_at set default (now() + interval '30 minutes'),
  alter column access_expires_at set not null;

create index if not exists cb_classroom_enrollments_access_idx
  on public.cb_classroom_enrollments(room_id, access_expires_at);

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

  if found and access_until>now() then
    return to_jsonb(r) || jsonb_build_object('access_expires_at',access_until);
  end if;

  select count(*) into active_students
  from public.cb_classroom_enrollments
  where room_id=r.id and access_expires_at>now();
  if active_students>=r.max_students then
    raise exception 'This classroom is full';
  end if;

  insert into public.cb_classroom_wallets(user_id)
  values(p_user_id) on conflict(user_id) do nothing;
  select cbc into balance from public.cb_classroom_wallets
  where user_id=p_user_id for update;
  if balance<1 then
    raise exception 'You need 1 CBC for 30 minutes in this classroom';
  end if;

  access_until := now() + interval '30 minutes';
  insert into public.cb_classroom_enrollments(room_id,student_id,joined_at,access_expires_at)
  values(r.id,p_user_id,now(),access_until)
  on conflict(room_id,student_id) do update
    set joined_at=now(),access_expires_at=excluded.access_expires_at;

  update public.cb_classroom_wallets
  set cbc=cbc-1,updated_at=now() where user_id=p_user_id;
  insert into public.cb_classroom_credit_ledger(id,user_id,delta,kind,reference_id)
  values(ledger_id,p_user_id,-1,'classroom_30_minutes',r.id)
  on conflict(id) do nothing;

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
      and e.access_expires_at>now()
      and r.status='active' and r.expires_at>now()
  );
$$;

revoke all on function public.cb_join_classroom(uuid,text,uuid),
  public.cb_extend_classroom_access(uuid,uuid,uuid),
  public.cb_has_classroom_access(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.cb_join_classroom(uuid,text,uuid),
  public.cb_extend_classroom_access(uuid,uuid,uuid),
  public.cb_has_classroom_access(uuid,uuid)
to service_role;
