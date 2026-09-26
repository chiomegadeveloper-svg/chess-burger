-- Run after 0056. Players can discover published tournament sessions.
begin;

drop policy if exists cb_read_tournaments on public.cb_tournaments;
create policy cb_read_tournaments on public.cb_tournaments
for select to authenticated
using (true);

commit;
