-- Chess Burger v46: non-destructive gameplay requests + committed realtime updates.
-- Run ONCE in your existing Supabase project's SQL Editor before deploying v46.
-- No rows are deleted, reset, or rewritten. Existing games receive empty metadata.
begin;

alter table public.cb_matches
  add column if not exists game_meta jsonb not null default '{}'::jsonb;

-- Only participants may subscribe to the committed row stream. Clients get no write policy.
alter table public.cb_matches enable row level security;
grant select on public.cb_matches to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'cb_matches' and policyname = 'cb_match_participant_read_v46') then
    create policy cb_match_participant_read_v46 on public.cb_matches for select to authenticated
      using ((select auth.uid()) = white_id or (select auth.uid()) = black_id);
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'cb_matches') then
    alter publication supabase_realtime add table public.cb_matches;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
