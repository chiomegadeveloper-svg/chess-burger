# City and town treasure discovery — v0.0728

GPS Explorer loads only the authenticated player's current city or town. A fresh GPS fix and the settlement boundary select the shared chest record; a supplied city ID cannot select another city's pins. Crossing the boundary clears old pins immediately, and late responses from the previous city are ignored.

Cities and towns are initialized on demand by an active Explorer request. There is no global city scan, empty-city timer or chest cron. Hero Room and background tabs do not request chest discovery. Active Explorer sessions refresh shared availability once per minute, immediately on reentry, retry or the daily boundary. Persisted city rows keep the day's coordinates consistent when everyone leaves; inactive rows do not rotate until someone returns on a later day.

Each settlement has 4 Golden, 2 Emerald and 1 Enchanted pin. Coordinates remain fixed for a Philippine calendar day. A claimed chest stays visible in gray, with no further reward available to another player that day. At midnight Asia/Manila (UTC+8), the next active request relocates all seven pins and refreshes IDs and availability. Concurrent first arrivals converge on one shared daily set. This replaces the previous six-hour chest respawn. The 200-meter opening range, first-claim rewards, full-stash retention and interrupted-claim recovery remain enforced.

Tacloban discovery no longer depends on a successful live citywide road query. A bundled OpenStreetMap city polygon and 512 sampled public-road points cover northern and southern Tacloban. They exclude prohibited road categories, private access, crossings, bridges and tunnels, and are filtered to the city polygon. The actual full-city Overpass download contained 5,686 ways; a short-timeout query stalled during verification. Other cities retain live map discovery, with alternate lookup retries. An optional city-cache conflict can no longer hide public markers or overwrite a newer inventory save.

Explorer has an always-visible chest finder with available count, a whole-city view and an explicit Retry action on failure. New citywide placements prefer 600-meter separation when the public-road pool permits it, with a 75-meter fallback for small towns.

Validation: 87 tests pass and production build passes. Tests include real Tacloban snapshot discovery without external providers, shared 4/2/1 counts, GPS city crossing and stale-pin clearing, no requests from inactive views, no inactive-city rotation, Philippine-midnight rollover, stable claimed pins, concurrent daily arrivals, cache conflicts, retries and reward idempotency. Browser QA used a fixture account, simulated GPS in Tacloban, actual bundled road points and the live Tacloban basemap. Screenshot: docs/images/rpg-tacloban-chests-v0728.jpg. Production player inventory was not modified for testing.

## Map data attribution
Data © OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright
City boundary: https://www.openstreetmap.org/relation/5154028
Boundary lookup: https://nominatim.openstreetmap.org/lookup?osm_ids=R5154028&format=jsonv2&polygon_geojson=1
Road provider: https://overpass-api.de/api/interpreter
Downloaded 2026-10-23. Derived public-road point database: api/_rpg/data/chest-cities.json (ODbL 1.0).
Query: [out:json][timeout:25][maxsize:10000000];way[highway~"^(footway|pedestrian|path|living_street|residential|unclassified|service)$"](11.1838481,124.9000977,11.3521575,125.0786439);out tags geom;
