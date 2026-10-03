-- Apply after 0076. Student orientation changes are approved by the room teacher.
alter table public.cb_classroom_student_boards
  add column if not exists view_flipped boolean not null default false,
  add column if not exists flip_requested_at timestamptz;
