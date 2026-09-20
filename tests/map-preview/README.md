# Map regression preview

Run from the repository root:

```sh
node --test tests/map-data.test.mjs
npx vite --config tests/map-preview/vite.config.ts
```

Open the local URL printed by Vite. This fixture renders the real Map component
in React Strict Mode, with a mock Arena API. It never signs in, requests device
location, writes records, or connects to Supabase. Basemap tiles may still load
from the usual map providers.

Before the fix, the current API fixture caused `Invalid LatLng object:
(undefined, undefined)` and a blank page. Verify:

- Current API territory: a map, square and KING marker appear. View KING opens
  the card with `Regression Kingdom` as the name.
- GPS off/on and Leave Map/Open Map can be repeated without exceptions.
- Malformed records: the map stays visible and claiming is disabled.
- Network unavailable: an inline error appears, and navigation still works.

These fixture checks do not replace signed-in production verification.
