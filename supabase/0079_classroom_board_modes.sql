-- Apply after 0078. A room has one teacher-controlled chessboard mode.
alter table public.cb_classroom_workspaces
  add column if not exists board_mode text not null default 'play';

alter table public.cb_classroom_workspaces
  drop constraint if exists cb_classroom_workspaces_board_mode_check;
alter table public.cb_classroom_workspaces
  add constraint cb_classroom_workspaces_board_mode_check
  check (board_mode in ('play', 'teach'));
