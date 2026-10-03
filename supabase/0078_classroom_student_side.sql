-- Apply after 0077. The teacher-approved playable side applies to every student in the room.
alter table public.cb_classroom_workspaces
  add column if not exists student_color text not null default 'w';

alter table public.cb_classroom_workspaces
  drop constraint if exists cb_classroom_workspaces_student_color_check;
alter table public.cb_classroom_workspaces
  add constraint cb_classroom_workspaces_student_color_check
  check (student_color in ('w', 'b'));
