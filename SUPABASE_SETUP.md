# Chess Burger account connection

Status: the Site has been prepared for the supplied Supabase project and public runtime values. The database schema and social providers still need to be applied/verified in the Supabase dashboard.

1. Connect the Supabase plugin and select the Chess Burger project. Do not use another app's project without selecting it explicitly.
2. Apply `supabase/chess-burger.sql`. It creates profiles, country codes, CBR fields starting at 88, featured-photo and badge fields, the public `cb-profile-media` WebP bucket with a 2 MB limit, a 50-item capped community feed, heart reactions, and First Blood support with row-level security. The interface pages 10 items at a time.
3. Set Site runtime variables `NEXT_PUBLIC_SUPABASE_URL` (the HTTPS project URL, without a trailing slash) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). The app returns only these public values from `/api/public-config`. Never place a service-role or secret key in this configuration.
4. In Supabase Authentication URL Configuration, set Site URL to `https://chess-burger-archetype.chiomegadeveloper.chatgpt.site` and add `https://chess-burger-archetype.chiomegadeveloper.chatgpt.site/?account=1` to the redirect allow list.
5. Keep Supabase Email authentication enabled for Gmail registration and login. Google and Facebook OAuth are not used in this version and can be configured later.
6. Publish the saved Site version once configuration is complete. Verify both sign-ins on a phone and desktop, including returning from the provider to the same browser; complete registration and confirm the feed event appears on another device.

The client uses Supabase's PKCE browser session flow and `detectSessionInUrl`. Profile APIs are authorized by Supabase Auth and database policies. The Site is public; ChatGPT identity is not used as a substitute for a Supabase user.

Saved offline games are device-local and unrated. They remain available without account login. History stores player names, result, start date/time and PGN for manual replay. Previously saved legacy games have no known date, so the UI labels that date unavailable.

Official setup references:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/social-login/auth-facebook
- https://supabase.com/docs/reference/javascript/auth-signinwithoauth
