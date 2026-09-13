# Chess Burger v17

- Added a dedicated Vercel static frontend build.
- Proxies API requests to the existing Chess Burger Sites backend during the migration, preserving D1 profiles and game data.
- Keeps Supabase authentication and media storage working through the shared public configuration endpoint.
- Updated the PWA cache version so Vercel visitors receive the new deployment.

The existing Sites deployment must remain available until the D1 data and API routes are migrated to Supabase or another Vercel-compatible database.
