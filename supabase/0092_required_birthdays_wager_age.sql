-- Apply before deploying the birthday gate release.
-- Exact birthdays are readable only by server-side service-role code.
begin;

create table if not exists public.cb_profile_birthdays (
  user_id uuid primary key references public.cb_profiles(user_id) on delete cascade,
  birthdate date not null check (birthdate >= date '1900-01-01'),
  recorded_at timestamptz not null default now()
);
alter table public.cb_profile_birthdays enable row level security;
revoke all on public.cb_profile_birthdays from public, anon, authenticated;
grant all on public.cb_profile_birthdays to service_role;

create or replace function public.cb_can_wager(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.cb_profile_birthdays b
    where b.user_id=p_user_id
      and b.birthdate <= ((now() at time zone 'UTC')::date - interval '14 years')::date
  );
$$;
revoke all on function public.cb_can_wager(uuid) from public, anon, authenticated;
grant execute on function public.cb_can_wager(uuid) to service_role;

create or replace function public.cb_block_underage_match_wager()
returns trigger language plpgsql security definer set search_path=public
as $$
declare person uuid;
begin
  if new.play_mode not in ('wager','cbr_wager') then return new; end if;
  if tg_op='UPDATE' then
    -- Do not interrupt games that were already active before this migration.
    if not (new.status='active' and old.status is distinct from new.status)
       and old.play_mode is not distinct from new.play_mode
       and old.white_id is not distinct from new.white_id
       and old.black_id is not distinct from new.black_id
       and old.invite_to is not distinct from new.invite_to then
      return new;
    end if;
  end if;
  for person in select distinct unnest(array[new.white_id,new.black_id,new.invite_to]) loop
    if person is not null and not public.cb_can_wager(person) then
      raise exception 'Wagers require each player to be at least 14 with a saved birthday.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists cb_match_wager_age_guard on public.cb_matches;
create trigger cb_match_wager_age_guard
  before insert or update on public.cb_matches
  for each row execute function public.cb_block_underage_match_wager();

create or replace function public.cb_block_underage_scheduled_wager()
returns trigger language plpgsql security definer set search_path=public
as $$
declare person uuid;
begin
  if new.wager_kind='none' or new.status not in ('pending','countered','accepted') then return new; end if;
  if tg_op='UPDATE'
     and old.status is not distinct from new.status
     and old.wager_kind is not distinct from new.wager_kind
     and old.host_id is not distinct from new.host_id
     and old.target_id is not distinct from new.target_id then return new; end if;
  for person in select distinct unnest(array[new.host_id,new.target_id]) loop
    if person is not null and not public.cb_can_wager(person) then
      raise exception 'Wagers require each player to be at least 14 with a saved birthday.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists cb_scheduled_wager_age_guard on public.cb_scheduled_challenges;
create trigger cb_scheduled_wager_age_guard
  before insert or update on public.cb_scheduled_challenges
  for each row execute function public.cb_block_underage_scheduled_wager();

revoke all on function public.cb_block_underage_match_wager() from public, anon, authenticated;
revoke all on function public.cb_block_underage_scheduled_wager() from public, anon, authenticated;
commit;
