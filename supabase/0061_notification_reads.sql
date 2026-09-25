-- Persistent, per-player read receipts for the notification inbox.
-- Alerts are derived from existing activity tables, so no source records are copied.
begin;

create table if not exists public.cb_notification_reads (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  notification_key text not null check (char_length(notification_key) between 3 and 160),
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index if not exists cb_notification_reads_recent
  on public.cb_notification_reads(user_id, read_at desc);

alter table public.cb_notification_reads enable row level security;
revoke all on public.cb_notification_reads from anon, authenticated;
grant select, insert, update on public.cb_notification_reads to service_role;

commit;
