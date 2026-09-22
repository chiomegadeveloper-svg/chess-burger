-- Teacher-controlled Classroom room termination.
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
end $$;

revoke all on function public.cb_terminate_classroom(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.cb_terminate_classroom(uuid,uuid)
to service_role;
