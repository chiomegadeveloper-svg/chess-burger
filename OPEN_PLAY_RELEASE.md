# Chess Burger v0.0408 — Chess Open Play

Map opens to Chess Open Play; Kingdoms & Nearby remains available in its own tab.
Owners can pin anywhere, with no pin or session count limit, and set a future start/end time, a CBR promo from 0–100%, and an optional joiner limit (blank means unlimited). Every promo zone has a fixed 10-meter radius. Locations are automatically reverse geocoded from the pin, with precise coordinates as fallback. Sessions can be edited before starting or cancelled; a pin with registered users cannot move to another location.

Players select a session pin or card to see its schedule, automatic location, registrant count and directions, and register or leave. Registration requires a completed signed-in profile but does not require onsite GPS. Capacity is enforced in a database transaction with a row lock, independent of the displayed count.

Registered players receive the promo on positive CBR gained with a new win during the session. At that win the database requires GPS enabled, a presence record seen within 45 seconds, reported accuracy within 10 meters, and coordinates within 10 meters of the pin. A 20% promo on 8 earned CBR adds 2 CBR, because fractional bonuses round up. Overlapping sessions use the highest percentage once. Transfers and other gains without a new win receive no promo. Bonus awards are audited and protected from duplicate awards for the same recorded win number. GPS relies on browser-reported coordinates; it is not independent proof against GPS spoofing.

## Required database activation

Run `supabase/0102_chess_open_play.sql` in the Supabase SQL Editor after the existing migrations. This creates sessions, registrations, promotion audit records and service-role-only management functions, plus the atomic win bonus trigger. No past wins receive retroactive bonuses. The application displays an activation error until this SQL is applied; existing Kingdoms & Nearby continues to work.

## Validation

`npm run test:open-play` covers owner permissions, unlimited scheduling, capacity, duplicate joins, editing, cancellation, registration identity, automatic location fallback, 10-meter geographic distance, freshness/accuracy checks, bonus rounding, overlapping promos, duplicate prevention and migration reruns. Existing Grand Arena, Map data and Chat regressions are checked separately. Production build checked. Full-project TypeScript has existing unrelated errors; no new errors in the Open Play modules. Signed-in visual testing and live database verification remain required after applying the migration.
