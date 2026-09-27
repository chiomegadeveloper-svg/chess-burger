-- Private player support tickets. API operations use the service role and check identity.
begin;
create table if not exists public.cb_report_tickets (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.cb_profiles(user_id) on delete cascade,
 category text not null check(category in ('bug','gameplay','account','shop','payment','classroom','user','other')),
 target_user_id uuid references public.cb_profiles(user_id) on delete set null,
 target_username text,
 description text not null check(char_length(description) between 10 and 2000),
 status text not null default 'open' check(status in ('open','replied','withdrawn')),
 owner_reply text not null default '' check(char_length(owner_reply)<=2000),
 replied_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint report_target_required check(category <> 'user' or target_username is not null)
);
create index if not exists cb_report_tickets_reporter on public.cb_report_tickets(reporter_id,created_at desc);
create index if not exists cb_report_tickets_recent on public.cb_report_tickets(created_at desc);
alter table public.cb_report_tickets enable row level security;
revoke all on public.cb_report_tickets from public,anon,authenticated;
commit;
