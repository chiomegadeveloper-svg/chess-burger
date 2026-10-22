# Chess Burger RPG live integration

RPG is embedded on the same origin as chessburger.site. Its portal requests full screen and landscape orientation. On browsers without orientation locking, a portrait overlay blocks play until the device is rotated or the window widened. Hardware/browser restrictions prevent a universal forced orientation lock.

The React parent obtains the existing Supabase session for each API request. The game never receives a bearer token. Same-origin messages are checked against the exact iframe window. Game APIs share `/api/profile?feature=rpg`, keeping the project within its existing 12-function limit. Only `/rpg/*` allows same-origin framing; the rest of the app retains DENY.

Hero identity and the selected starting skill are inserted once under the existing `cb_inventory_items` composite primary key (`user_id`, `rpg_profile`, `hero`). The record has quantity zero, is not a shop item, is excluded from the Bag list, and cannot pass a positive-quantity gift transfer. That table already denies direct anon/authenticated access; the authenticated server handler uses its existing server configuration. JSON revision comparisons reject conflicting updates. No new Supabase project, SQL migration, or secret is needed.

New heroes start with Basic Tackle and one of the other 29 skills. Confirmation is explicit and server-enforced; reopening loads the saved hero automatically. Browser caches are namespaced by account and never determine hero identity. Level and XP come from the server. Unknown equipment, extra learned skills, name/hero changes, and test currency are rejected.

The live UI removes access to collection/test gear, free currency, test levels, sprite/battle labs, and hero switching. Real CBG bag purchases remain unavailable rather than using demo currency. Item drops remain a future feature as in the sandbox. Combat, chess/puzzle harvesting, skill animation and hit timing, reports, level progression, Babaylan Book, bag and stash layouts are retained. Saved battles and monster victories award account XP once; neither PvP nor RPG outcomes modify main-game ratings or currency.

Monsters are generated on server-decoded road segments from the same OpenFreeMap vector source as the map, with the tagged-road provider as fallback. Sets persist hourly within 600 m and regenerate after movement beyond 300 m. Starting a nearby battle retains the 10 m distance and ±10 m accuracy gates. GPS sharing remains opt-in; shared presence expires automatically. Nearby PvP requires acceptance and persisted turn revisions.

Validation: server tests cover concurrent permanent hero creation, two starting skills, forged-save rejection, optimistic revisions, road encounters, one-time XP, presence and PvP. DOM integration tests cover confirmation, hidden test controls, exit behavior and account hero restoration. Browser UI review uses a local account-service fixture; the screenshot is a UI preview, not a live account/GPS session. Production health checks verify account storage access after deployment. A live phone GPS and platform orientation check is still needed.

Source: standalone RPG sandbox commit c5ea179a61409943297626dd13f7febc2e2e86b7. Original art, ct.js effects, chess.js, Stockfish and piece-art license notices remain bundled under public/rpg.

## Owner reset and icon picker (v0.0560)

CMS → Users → Reset RPG hero is restricted to the current database Owner role. Owners search usernames, select a player, review hero/level, and type the username to approve a reset. A revision check rejects stale or duplicate approval. The previous RPG save is preserved privately as a recovery snapshot and the account is returned to hero selection; a replacement hero starts fresh at level 1. Main profile, balances and ratings are unchanged. Activity logs record the owner and target. Reset generations reject old saves and close old PvP; current clients reload into selection on their next rejected game request.

The starting-skill dropdown is replaced with all 30 existing skill icons in a responsive dialog. Basic Tackle is already included; the player chooses one of the other 29 skills. Hover, keyboard focus or touch inspect AP, MP and estimated level-1 attack damage using the combat formula against 4 armor. Selecting an icon and pressing Use skill confirms the choice.

Ten server/API/DOM tests pass, including owner authorization, approval/revision guards, concurrent reset/reselection, old-session rejection, old PvP cancellation and icon selection. Browser review used local sample data, with no production account reset. Preview fixture files are removed before deployment.

## GPS battleground update (v0.0568)

Monster and player battle start/acceptance range is now 200 m, enforced server-side. Fresh GPS accuracy within ±100 m is required. PvP still needs acceptance and both players online. The map circle shows the attack radius; monster discovery remains within 600 m of the set's original location.

Monsters have fixed coordinates and a rolling 30-minute lifetime from generation. Player movement no longer replaces a set. Winning by knockout consumes the encounter; starting, losing or forfeiting does not. Expired sets renew on the next valid GPS update. Cached sets are returned with account initialization and retained between Hero Room/map visits, rendering after the first location fix without refetching roads. Valid road coordinates are reused for six hours near the same location. First-time GPS permission/fix and uncached road loading still depend on the device and connection. No monster coordinates come from client-generated spawns.

Tapping an out-of-range monster shows a centered notice with approximate distance and the 200 m limit. The notice fades after 10 seconds and has a manual close button. The server also returns a structured range error for online player movement/races.

Tests cover the 199/201 m boundary for monsters and PvP, full lifetime across clock boundaries and movement, initialization cache, cached road reuse, defeat-only removal, and popup timing/close behavior.

## Monster encounter choice (v0.0576)

Tapping an in-range monster opens a responsive native dialog with the hero on the left, VS in the center and the monster on the right. Both full-health sprites face one another; names and levels identify each side. RUN dismisses without creating a battle or changing resources. ATTACK rechecks the current GPS/range and starts the authenticated encounter. Out-of-range taps retain the ten-second distance notice. Native Escape dismisses the preview, and incoming active battles close it.

The new integration test verifies left/right sprites, no server battle on preview/Run, movement outside range before Attack, and exactly one encounter request on confirmation. Browser layout review used sample data, with no production battle started.

## ATTACK transition and GPS-free combat (v0.0584)

Map selection checks the 200 m distance using the map's location and creates a short-lived, account/monster-bound selection ticket. ATTACK uses that ticket without another GPS fix or accuracy gate. The server still verifies the selected monster, ticket, expiry and active-battle state. Old clients retain a map-location fallback. PvP distance is checked when challenging; acceptance and combat do not recheck GPS.

The encounter remains visible while starting a battle. Errors appear inside that dialog instead of opening an empty Battle Lab screen. Successful creation opens the full battle interface against the selected monster. The empty-screen fallback is titled Battle. GPS watches and sharing pause while the battle interface is open, then resume on return to the map. Monster expiry, authoritative XP and battle turns remain server-side.

Validation includes a selected encounter starting and taking a turn with no further GPS, forged ticket rejection, full battle render after ATTACK, and actual watch pause/restart. Browser transition review uses a local sample service, not a production account battle.

## v0.0592 — restore the sandbox battle transfer

Canonical source: RPG Sandbox version 35, commit `c5ea179a61409943297626dd13f7febc2e2e86b7`.

Reimported the battle HTML verbatim from the sandbox, keeping production-only route and wording adaptation in the packaging script. The original battle CSS, hero identity/head images, damage poses, skill icons and animation sheets are verified against sandbox SHA-256 hashes in `rpg/sandbox-source.json`. No hero designs or battle layout were replaced. The existing server/account adapter and map selection remain in place; combat stays GPS-free.

Fixed the ct.js animation texture loader: sandbox-root `/assets/skills/sheets/` requests were failing in the main app, which hosts the game at `/rpg/`. Both source and shipped engine now resolve sheets relative to the RPG document base. Preserved original frame timing, attack travel, impact callback, enemy delay and damage pose transitions. Included original upstream ct.js component and license for reproducibility.

Verification: byte-level artwork/template transfer checks; live map-to-battle integration; actual browser combat with Basic Tackle and enemy Ember, texture animation and delayed HP impact; production build. Browser screenshot in `rpg-original-battle-restored.jpg` uses a local practice fixture, not a production account.

## v0.0600 — restore original selected hero identity

The generated hero damage atlas was internally consistent with the sandbox but not with the original hero-selection art. In particular, the original Crusader has a closed helmet while the generated combat atlas exposes a different face. Corrected the renderer to use lossless exports of each original hero for encounter preview, battle, reports and PvP facing. Both facings are derived only by mirroring the original image. Re-cropped the eight head portraits from the same canonical hero images.

All health thresholds retain the original hero identity. Hero damage/kneeling/death pose substitutions are suspended because the existing atlas changes their appearance; no new artwork was generated. Monster damage poses and original ct.js attack animation timing remain intact. This is a rendering-only fix: account hero choice, equipment, stats and progression are unchanged.

Verified all eight heroes across seven HP values and both facings, original asset hashes, map-to-battle integration, original Crusader in browser combat and matching head portrait. Screenshot `rpg-crusader-original-restored.jpg` is a local practice preview.

## v0.0608 — responsive battle panels, icon skills and prompt attacks

Removed fixed battle width and fighter-height caps. Status panels and fighter frames expand with the viewport; compact landscape keeps harvest/actions reachable and uses the space for the fighters. Encounter, harvest and report forms have fluid viewport-bound sizes. Original hero images and ct.js effect artwork are unchanged. Desktop and 844×390 landscape browser checks completed.

Hero and enemy skill slots show icons only. Hover/focus tooltips expose the skill name, AP/MP costs, calculated damage, readiness and cooldown. Empty slots are blank. Disabled skill details remain focusable through their wrapper.

Preload all five original effect atlases while preparing the hero. Start the hero's cosmetic skill animation on input, overlap it with the server request, and reconcile the confirmed hit at impact without replaying the same animation. Failed requests do not award damage/resources. Enemy response retains its 1–3 second delay. Presence requests use their independent record path, so pending map sharing cannot queue ahead of battle commands; profile/combat mutations stay serialized.

Verified with delayed-response tests: animation starts before the request completes, HP stays unchanged until server confirmation and effect impact, hero effects play once, and pending presence does not block combat. Browser screenshot `rpg-responsive-battle.jpg` is a local practice preview with the tooltip focused.
