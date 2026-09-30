-- Run once in Supabase SQL Editor to publish only open-to-anyone scheduled battles.
-- Existing named invitations stay private. Accepted legacy invitations cannot be
-- classified safely, so only new public challenges persist as public after acceptance.
begin;
alter table public.cb_scheduled_challenges
  add column if not exists visibility text not null default 'private';
alter table public.cb_scheduled_challenges
  drop constraint if exists cb_scheduled_challenges_visibility_check;
alter table public.cb_scheduled_challenges
  add constraint cb_scheduled_challenges_visibility_check
  check (visibility in ('public','private'));
update public.cb_scheduled_challenges
  set visibility='public'
  where target_id is null and status='pending';
create index if not exists cb_scheduled_challenges_visibility_idx
  on public.cb_scheduled_challenges(visibility,status,scheduled_at);
commit;
