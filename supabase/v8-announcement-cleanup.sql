-- Run after v8-upgrade.sql using the Supabase SQL editor as postgres.
-- Enable Supabase Cron / pg_cron in the dashboard if the extension is unavailable.
create extension if not exists pg_cron;
select cron.schedule('chess-burger-expired-announcements','* * * * *','select public.cb_prune_expired_announcements();');
-- Expired rows become invisible immediately via RLS; physical deletion runs each minute.
-- Check: select jobid, jobname, schedule, active from cron.job where jobname='chess-burger-expired-announcements';
