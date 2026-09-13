# Chess Burger v9 release

Version 9 is the current public release. It adds the hosted arena service used by online matchmaking, live games, rankings, map invitations, CBR results, feeds, reactions, territory claims, and staff Gold audit logs. Production Sites deployment applies the two Drizzle D1 migrations automatically.

## Account and access

- A visitor lands on Player Profile after the five-second splash. Home, Map, Card, Play, Shop, and Rank unlock only after the signed-in user saves a profile.
- Gmail/password registration and sign-in use Supabase Auth. “Keep me logged in” chooses persistent browser storage; clearing it stores the session only in the current tab. Sign out clears cached session/profile data and removes arena presence.
- Existing Supabase profile data remains the identity source. Apply `supabase/chess-burger-v8-complete.sql` to a new Supabase project. Existing v8 projects do not need to rerun it.
- Owner and Admin profiles have a visible CMS button on Player Profile. Both may post announcements and grant Gold; Owner alone manages GM roles. These permissions are checked on the server from the authenticated Supabase profile.

## Play modes

- **Play Online:** searches available players using the same time control and within 20 CBR. The server validates turns, clocks, moves, resignation, rating updates and result idempotency.
- **Nearby Match:** uses OpenStreetMap. A player appears only while they have enabled GPS and supplied a recent location. Tap an avatar to invite that player; the inviter hosts and chooses Bullet, Blitz or Rapid.
- **Offline Board:** one-screen play or a direct WebRTC data channel over a shared Wi-Fi router/hotspot. Host and guest exchange full connection details with offer/reply QR codes. The PWA cannot make one phone act as a Bluetooth peripheral, so Bluetooth-only phone pairing needs a future native app.
- **Territory Invasion:** claims an unoccupied 200 m zone with a recent GPS fix accurate to 100 m and awards 10 CBR once daily.

CBR: win +8, loss -10 (floor 0), every win from the fourth consecutive win +2, and a rating gap greater than 10 awards the winner an additional 10% of the defeated player's starting CBR, rounded down. Signed-in offline results are queued locally and sync when the device reconnects. They are marked as self-reported in staff logs.

## UI and content

- Neutral light/dark gray surfaces with the existing black, gold and cyan fixed banners; Poppins is bundled locally.
- Responsive full chess scene, compact clocks and controls, top-three ranking icons, player avatars and current rank below the Top 10.
- All 50 badges have distinct names, requirements and rewards. Collection icons appear five per row. Locked icons render at 25% opacity; name and reward appear after a tap.
- Community activity merges announcement/profile events and live arena results, keeps the newest 50 and displays 10 per page. Hearts are authenticated and idempotent.
- Tournament hosting remains inside the staff CMS and is removed from Match Lobby.

## Verification

- `npm run test:arena`: 16 checks for authentication storage, QR encoding, local host authority, matchmaking, clocks, move validation, rating idempotency, GPS privacy, territory, feeds and staff permissions.
- `npm run test:tournament`: 10 Swiss and export regression checks.
- `npx tsc --noEmit`: passes.
- Production `vinext build`: passes.

Actual two-phone Wi-Fi negotiation, camera permission, GPS permission and a real two-account online match still depend on device/browser/network conditions and should be included in release acceptance testing.

## Profile media setup

Run `supabase/profile-media-storage.sql` once in the Supabase SQL Editor. It creates the public `cb-profile-media` bucket with a 2 MB WebP limit and restricts writes to the authenticated user's own UID folder. The complete v8 schema includes the same setup for new installations.
