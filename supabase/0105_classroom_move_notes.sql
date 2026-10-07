-- Complete, immutable teacher-only board history. Triggers also capture assignments,
-- resets and takebacks, atomically with the board change, in either classroom mode.
begin;
create table if not exists public.cb_classroom_move_notes (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.cb_classroom_rooms(id) on delete cascade,
  student_id uuid references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  before_fen text not null,
  fen text not null,
  annotations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cb_classroom_move_notes_board_idx
  on public.cb_classroom_move_notes(room_id,student_id,id desc);
alter table public.cb_classroom_move_notes enable row level security;
revoke all on public.cb_classroom_move_notes from anon,authenticated;
grant select on public.cb_classroom_move_notes to authenticated;
drop policy if exists "teacher reads classroom move notes" on public.cb_classroom_move_notes;
create policy "teacher reads classroom move notes" on public.cb_classroom_move_notes
  for select to authenticated using (exists (
    select 1 from public.cb_classroom_rooms r where r.id=room_id and r.teacher_id=auth.uid()
  ));

create or replace function public.cb_capture_classroom_move_note()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare previous text;
begin
  previous := case when TG_OP='INSERT' then 'start' else OLD.fen end;
  if TG_OP='UPDATE' and NEW.fen=OLD.fen then return NEW; end if;
  insert into public.cb_classroom_move_notes(room_id,student_id,actor_id,before_fen,fen,annotations)
  values(NEW.room_id,case when TG_TABLE_NAME='cb_classroom_student_boards' then (to_jsonb(NEW)->>'student_id')::uuid else null end,
    NEW.updated_by,previous,NEW.fen,coalesce(NEW.annotations,'[]'::jsonb));
  return NEW;
end $$;
revoke all on function public.cb_capture_classroom_move_note() from public;
drop trigger if exists classroom_workspace_move_note on public.cb_classroom_workspaces;
create trigger classroom_workspace_move_note after insert or update on public.cb_classroom_workspaces
  for each row execute function public.cb_capture_classroom_move_note();
drop trigger if exists classroom_student_move_note on public.cb_classroom_student_boards;
create trigger classroom_student_move_note after insert or update on public.cb_classroom_student_boards
  for each row execute function public.cb_capture_classroom_move_note();

-- Baseline for already-open rooms. Existing logs remain available in Activity Log.
insert into public.cb_classroom_move_notes(room_id,student_id,actor_id,before_fen,fen,annotations)
select room_id,null,updated_by,fen,fen,coalesce(annotations,'[]'::jsonb) from public.cb_classroom_workspaces b where not exists(select 1 from public.cb_classroom_move_notes n where n.room_id=b.room_id and n.student_id is null);
insert into public.cb_classroom_move_notes(room_id,student_id,actor_id,before_fen,fen,annotations)
select room_id,student_id,updated_by,fen,fen,coalesce(annotations,'[]'::jsonb) from public.cb_classroom_student_boards b where not exists(select 1 from public.cb_classroom_move_notes n where n.room_id=b.room_id and n.student_id=b.student_id);

create or replace function public.cb_restore_classroom_move_note(
  p_room uuid,p_teacher uuid,p_note bigint,p_before boolean,p_expected_fen text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entry public.cb_classroom_move_notes; result jsonb;
begin
  if not exists(select 1 from public.cb_classroom_rooms where id=p_room and teacher_id=p_teacher
    and status='active' and expires_at>now()) then raise exception 'Only the active teacher can restore history.'; end if;
  select * into entry from public.cb_classroom_move_notes where id=p_note and room_id=p_room;
  if not found then raise exception 'History position not found.'; end if;
  if entry.student_id is null then
    update public.cb_classroom_workspaces set fen=case when p_before then entry.before_fen else entry.fen end,
      annotations=case when p_before then '[]'::jsonb else entry.annotations end,updated_by=p_teacher,updated_at=now()
      where room_id=p_room and fen=p_expected_fen returning to_jsonb(cb_classroom_workspaces.*) into result;
  else
    update public.cb_classroom_student_boards set fen=case when p_before then entry.before_fen else entry.fen end,
      annotations=case when p_before then '[]'::jsonb else entry.annotations end,updated_by=p_teacher,updated_at=now()
      where room_id=p_room and student_id=entry.student_id and fen=p_expected_fen
      returning to_jsonb(cb_classroom_student_boards.*) into result;
  end if;
  if result is null then raise exception 'The board changed. Refresh before restoring history.'; end if;
  return jsonb_build_object('board',result,'student_id',entry.student_id);
end $$;
revoke all on function public.cb_restore_classroom_move_note(uuid,uuid,bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.cb_restore_classroom_move_note(uuid,uuid,bigint,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
