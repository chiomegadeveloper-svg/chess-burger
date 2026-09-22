create table if not exists public.cb_classroom_lesson_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.cb_classroom_rooms(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('master','student','shared','assignment')),
  student_id uuid references auth.users(id) on delete set null,
  fen text not null,
  annotations jsonb not null default '[]'::jsonb,
  label text not null default 'Board updated',
  created_at timestamptz not null default now()
);

create index if not exists cb_classroom_lesson_events_room_created_idx
  on public.cb_classroom_lesson_events(room_id,created_at desc);

alter table public.cb_classroom_lesson_events enable row level security;

drop policy if exists "classroom teacher reads lesson history" on public.cb_classroom_lesson_events;
create policy "classroom teacher reads lesson history"
on public.cb_classroom_lesson_events for select to authenticated
using (exists (
  select 1 from public.cb_classroom_rooms room
  where room.id=room_id and room.teacher_id=auth.uid()
));
