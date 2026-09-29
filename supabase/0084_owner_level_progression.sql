-- Owner-only CBR/level audit. Records the current state as a baseline; older
-- rating changes cannot be reconstructed from the profile row.
begin;

create table if not exists public.cb_level_progression (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  event_type text not null check (event_type in ('baseline', 'change')),
  old_cbr integer,
  new_cbr integer not null,
  old_level smallint,
  new_level smallint not null,
  old_wins integer,
  new_wins integer not null,
  old_losses integer,
  new_losses integer not null,
  actor_user_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists cb_level_progression_user_recent_idx
  on public.cb_level_progression(user_id, id desc);

alter table public.cb_level_progression enable row level security;
revoke all on public.cb_level_progression from public, anon, authenticated;
grant select on public.cb_level_progression to service_role;
revoke all on sequence public.cb_level_progression_id_seq from public, anon, authenticated;

create or replace function public.cb_level_at_cbr(p_cbr integer) returns smallint
language sql immutable set search_path=public as $$
  select (case
    when p_cbr <= 88 then 1 when p_cbr <= 176 then 2
    when p_cbr <= 352 then 3 when p_cbr <= 616 then 4
    when p_cbr <= 1056 then 5 when p_cbr <= 1760 then 6
    when p_cbr <= 2904 then 7 when p_cbr <= 4752 then 8
    when p_cbr <= 7744 then 9 when p_cbr <= 12584 then 10
    when p_cbr <= 20380 then 11 when p_cbr <= 33000 then 12
    when p_cbr <= 53500 then 13 when p_cbr <= 86500 then 14
    when p_cbr <= 140000 then 15 when p_cbr <= 226000 then 16
    when p_cbr <= 365000 then 17 when p_cbr <= 590000 then 18
    when p_cbr <= 955000 then 19 else 20
  end)::smallint;
$$;
revoke all on function public.cb_level_at_cbr(integer) from public, anon, authenticated;

create or replace function public.cb_record_level_progression() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.cb_level_progression
    (user_id,event_type,old_cbr,new_cbr,old_level,new_level,
     old_wins,new_wins,old_losses,new_losses,actor_user_id)
  values
    (new.user_id,'change',old.cbr,new.cbr,
     public.cb_level_at_cbr(old.cbr),public.cb_level_at_cbr(new.cbr),
     old.wins,new.wins,old.losses,new.losses,(select auth.uid()));

  -- Profile updates serialize per player, so retention remains at 100 rows.
  delete from public.cb_level_progression
  where user_id=new.user_id and id in (
    select id from public.cb_level_progression
    where user_id=new.user_id order by id desc offset 100
  );
  return new;
end $$;
revoke all on function public.cb_record_level_progression() from public, anon, authenticated;
drop trigger if exists cb_level_progression_change on public.cb_profiles;
create trigger cb_level_progression_change after update of cbr on public.cb_profiles
for each row when (old.cbr is distinct from new.cbr)
execute function public.cb_record_level_progression();

-- The trigger is installed before this snapshot in the same transaction, so
-- profile updates cannot slip between the baseline and event capture.
insert into public.cb_level_progression
  (user_id, event_type, new_cbr, new_level, new_wins, new_losses)
select p.user_id, 'baseline', p.cbr, public.cb_level_at_cbr(p.cbr), p.wins, p.losses
from public.cb_profiles p
where not exists (select 1 from public.cb_level_progression l where l.user_id=p.user_id);

commit;
