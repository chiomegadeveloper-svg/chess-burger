-- Classroom Phase 2: synchronized teaching boards and teacher annotations.
create table if not exists public.cb_classroom_workspaces(
  room_id uuid primary key references public.cb_classroom_rooms(id) on delete cascade,
  fen text not null default 'start',
  annotations jsonb not null default '[]'::jsonb,
  time_control text not null default '10+0',
  selected_student_id uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cb_classroom_student_boards(
  room_id uuid not null references public.cb_classroom_rooms(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  fen text not null default 'start',
  annotations jsonb not null default '[]'::jsonb,
  version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(room_id,student_id)
);

create index if not exists cb_classroom_student_boards_room_idx
  on public.cb_classroom_student_boards(room_id,updated_at desc);

alter table public.cb_classroom_workspaces enable row level security;
alter table public.cb_classroom_student_boards enable row level security;
revoke all on public.cb_classroom_workspaces,public.cb_classroom_student_boards
  from anon,authenticated;
grant all on public.cb_classroom_workspaces,public.cb_classroom_student_boards
  to service_role;
