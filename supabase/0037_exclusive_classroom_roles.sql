-- Enforce mutually exclusive Classroom roles at database level.
-- A user cannot hold active student access while serving an active teacher session.
begin;

create or replace function public.cb_enforce_classroom_teacher_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and new.expires_at>now() and exists(
    select 1
    from public.cb_classroom_enrollments e
    join public.cb_classroom_rooms r on r.id=e.room_id
    where e.student_id=new.teacher_id
      and e.access_expires_at>now()
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
  if new.access_expires_at>now() and exists(
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

revoke all on function public.cb_enforce_classroom_teacher_role(),
  public.cb_enforce_classroom_student_role()
from public,anon,authenticated;

commit;
