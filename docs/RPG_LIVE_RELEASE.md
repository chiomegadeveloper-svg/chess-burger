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
