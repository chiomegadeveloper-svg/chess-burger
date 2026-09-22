-- Classroom Phase 2 realtime visibility for authenticated teachers and active students.
grant select on public.cb_classroom_workspaces,public.cb_classroom_student_boards to authenticated;

drop policy if exists "classroom participants read workspace" on public.cb_classroom_workspaces;
create policy "classroom participants read workspace"
on public.cb_classroom_workspaces for select to authenticated
using (
  exists(select 1 from public.cb_classroom_rooms r where r.id=room_id and r.teacher_id=auth.uid() and r.status='active' and r.expires_at>now())
  or exists(select 1 from public.cb_classroom_enrollments e join public.cb_classroom_rooms r on r.id=e.room_id where e.room_id=room_id and e.student_id=auth.uid() and e.access_expires_at>now() and r.status='active' and r.expires_at>now())
);

drop policy if exists "classroom participants read student boards" on public.cb_classroom_student_boards;
create policy "classroom participants read student boards"
on public.cb_classroom_student_boards for select to authenticated
using (
  exists(select 1 from public.cb_classroom_rooms r where r.id=room_id and r.teacher_id=auth.uid() and r.status='active' and r.expires_at>now())
  or exists(select 1 from public.cb_classroom_enrollments e join public.cb_classroom_rooms r on r.id=e.room_id where e.room_id=room_id and e.student_id=auth.uid() and e.access_expires_at>now() and r.status='active' and r.expires_at>now())
);

do $$ begin
  alter publication supabase_realtime add table public.cb_classroom_workspaces;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cb_classroom_student_boards;
exception when duplicate_object then null;
end $$;
