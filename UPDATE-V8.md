# Chess Burger v8 update

This is an updated source package. It has not been deployed and no live database was changed. The two Owner accounts are configured in SQL; account registration and live promotion have not been performed in this session.

## Apply the update

1. Replace the project source with this package, keeping your existing environment settings.
2. In the Supabase SQL editor, run `supabase/chess-burger-v8-complete.sql`. This combines the original schema with the v8 upgrade and works for existing or new installations.
3. Run `supabase/v8-announcement-cleanup.sql` separately. Enable Supabase Cron / pg_cron in the dashboard first if required. Expired announcements become invisible at their deadline; this job physically deletes the rows each minute, even when no one opens the app.
4. Keep Supabase Auth email confirmation enabled. Before running the optional legacy Owner setup, replace the placeholder addresses in `supabase/v8-owner-setup.sql` with the designated Owners' verified Gmail addresses. Do not commit real account addresses to a public repository. Each person registers with their own password, verifies their Gmail address and saves their player profile.
5. Install the locked dependencies with `npm run install:ci`, build with `npm run build`, and publish through your existing host. The original Sites project could not be resolved from this editing session.
6. Open the app online once after publishing to refresh the service worker. Visit Profile and Play before taking a device offline.

Do not rerun only the old `chess-burger.sql` after v8; use the combined v8 file so the new permissions remain in place.

## Included changes

- Large level emblem overlapping the second frame, with level name and CBR remaining. The original thresholds are retained: 88 CBR is Level 1; 89 CBR starts Level 2.
- One Owner/GM-selected card feature photo, with contained image fit and tap-to-expand.
- Profile thumbnails expand on tap. Replace controls sit below the thumbnails.
- Metallic cyan and gold player profile and Gmail/password interface, labeled fields, permanent @ prefix, and corrected profile-save payload.
- A five-second Chess Burger splash over 85% black.
- Four feed filters, with Announcements in a balanced two-by-two mobile layout and four desktop columns.
- All 50 existing transparent badge PNGs displayed in five columns. Tapping a badge shows its name, requirement, Gold points and shop reward.
- Owner and GM profile badges open the CMS. The Owner can assign/revoke GM access. Gold grants are Owner-only, enforced by Supabase functions, not just hidden buttons.
- Staff card-photo uploads, announcement text/image uploads, editing, deletion and expiry controls. Images are converted to WebP below 2 MB.
- Online activity logs with pagination, and separately labeled device-only offline logs.
- Tournament registration, rounds, result entry, standings, TRF export, backups and restore, plus online publication with revision conflict checks.
- Server-side Swiss REST connector; the API key stays off the browser.
- Service worker caches the app shell and badge/level assets for subsequent offline visits.

## Offline tournaments

The Owner or GM creates a tournament in the CMS. Players scan its invitation QR. Without internet, each player enters their name and shows their registration QR to the host; the host scans it to add the player. A QR does not create a network connection, so this second scan carries the registration back to the host. Identity is confirmed in person by the host.

Use a physical chessboard or the app's same-device offline board. The host records the result for each board, then pairs the next round. No automatic exchange of moves between separate offline phones is included. Device logs and offline results do not automatically award Gold or assert official rated results.

Offline club Swiss pairing avoids repeat opponents, uses score proximity, rotates byes, and prefers balanced colors. It is **not a certified FIDE Dutch pairing engine**. Buchholz here is the sum of opponents' current scores, without official adjustments for unplayed games. Pairing may stop when no valid pairing is found or a search limit is reached. Have an arbiter review rated events.

Export a backup after each round. Offline state is held on the host's device. Publish/sync stores a snapshot online; the host's authenticated account must have Owner/GM permission. Load published version intentionally replaces local state, so export local changes first. Signed-in players can register online once the host has published the registration state.

## Swiss REST API configuration still required

Configure `SWISS_API_URL` and `SWISS_API_KEY` as server-only hosting environment values. The adapter sends `apikey`, `action=pair`, and `trf` as form data, and consumes the provider's `errornumber`, `nextroundnumber`, and `pairings` response. It checks coverage, duplicate players, repeat opponents, byes, and round number before accepting pairs.

The SK Gronau API documentation describes **2017** Swiss rules and requires a requested API key. Its documented endpoint is HTTP; this implementation requires a provider-confirmed HTTPS endpoint to keep the key and participant data protected. HTTPS availability could not be verified here. This connector has not been tested against an authenticated live provider. Do not advertise current FIDE compliance based on this adapter. A hosted REST API cannot run with no internet; the offline club engine is a separate mode.

References:
- Swiss API contract: https://www.skgronau.de/eimersystem/swiss-system-api
- FIDE TRF exchange field positions: https://www.fide.com/FIDE/handbook/C04Annex2_TRF16.pdf
- Supabase Cron: https://supabase.com/docs/guides/cron
- Supabase function permissions: https://supabase.com/docs/guides/database/functions

## Badge artwork and data still needed

The source already contains 50 individual RGBA PNG files under `public/badges`. They are preserved with transparency. Several files are cropped through the coin artwork itself; CSS cannot recover pixels that are absent. The supplied screenshots contain the same cropped versions. Upload the original full badge sheet or original individual images to complete accurate extraction. No replacement artwork was invented.

The attached reward table defines **40 badges**, not 50. All 40 names, requirements, Gold points and shop rewards are now included verbatim. Slots 41–50 remain visible and show that details/rewards were not supplied. Provide those remaining ten definitions to complete the collection. Achievement detection beyond the existing level unlock logic was not added in this update.

## Verification

- 10 tournament tests pass using Node's built-in test runner: `node --test tests/tournament.test.mjs` (Node 24, or compatible Node 22 with TypeScript stripping).
- All 20 app TS/TSX files pass TypeScript syntax parsing.
- Partial type checking found and corrected a new unknown JSON-response type. Full checking remains blocked by unavailable Supabase, chess.js and qrcode.react packages and their type declarations.
- The full production build did not complete: network dependency installation was unavailable in this session. Build and browser verification are required in the connected project before publishing.
- No live authentication, Supabase SQL execution, actual camera scanning, or authenticated Swiss API call was tested in this session.
