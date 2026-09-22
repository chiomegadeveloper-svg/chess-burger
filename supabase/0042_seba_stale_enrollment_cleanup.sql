-- Remove stale Student Lobby cards and enforce cleanup on every future termination.
delete from public.cb_classroom_student_boards b
using public.cb_classroom_rooms r
where r.id=b.room_id and (r.status<>'active' or r.expires_at<=now());

delete from public.cb_classroom_workspaces w
using public.cb_classroom_rooms r
where r.id=w.room_id and (r.status<>'active' or r.expires_at<=now());

delete from public.cb_classroom_enrollments e
using public.cb_classroom_rooms r
where r.id=e.room_id and (r.status<>'active' or r.expires_at<=now());

create or replace function public.cb_terminate_classroom(
  p_user_id uuid,
  p_room_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.cb_classroom_rooms
  set status='closed'
  where id=p_room_id and teacher_id=p_user_id and status='active';
  if not found then
    raise exception 'Active classroom not found or you are not its teacher';
  end if;

  delete from public.cb_classroom_student_boards where room_id=p_room_id;
  delete from public.cb_classroom_workspaces where room_id=p_room_id;
  delete from public.cb_classroom_enrollments where room_id=p_room_id;
end $$;

revoke all on function public.cb_terminate_classroom(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.cb_terminate_classroom(uuid,uuid)
to service_role;
