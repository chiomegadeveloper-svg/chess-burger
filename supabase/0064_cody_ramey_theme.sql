-- Cody Ramey is a rentable pixel board and piece collection.
insert into public.cb_board_themes(id,name,active)
values ('cody-ramey','Cody Ramey',true)
on conflict(id) do update set name=excluded.name,active=true;
