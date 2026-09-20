# Chess Burger v46 patch

1. Copy every file in this ZIP over the same path in the repository.
2. In Supabase SQL Editor, run `supabase/0014_gameplay_v46.sql`, then `supabase/0015_territory_ownership_names.sql`.
3. Commit and push to `main`, then wait for the Vercel production deployment.

The SQL migrations are additive and preserve existing rows. They add match request metadata, participant realtime access, and kingdom names. They do not reset the database.

Gameplay changes: instant optimistic movement, a short backend move path, realtime row synchronization, takeback approval (three requests per player), and draw approval (three requests per player).

Territory changes: an owner no longer sees the claim control, duplicate claim calls return the existing kingdom without another charge, and kingdom renaming uses the authenticated owner's exact territory ID.
