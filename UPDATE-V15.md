# Chess Burger v15

## Durable player profiles

Player profiles are now saved to the Site's managed database after Supabase verifies the signed-in account. Supabase remains responsible for Gmail login and profile-photo storage. A best-effort Supabase profile mirror is kept for compatibility, but an outdated or missing `cb_profiles` table no longer blocks registration or causes a saved profile to disappear.

Existing Supabase profiles are imported automatically the first time their owner opens this version. CBR, Gold, wins, losses, and streaks remain protected server-owned values.

The PWA service worker cache is versioned and checks for updates at launch so installed copies move to this persistence fix automatically.
