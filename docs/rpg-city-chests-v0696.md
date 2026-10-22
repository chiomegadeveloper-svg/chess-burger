# City chests — RPG v0.0696

The GPS map displays four Golden, two Emerald and one Enchanted chest shared by all players in the same OSM city/town. A View city chests button shows the settlement extent. Markers are above the player pin so a chest remains tappable when standing on its location. Native marker buttons and a responsive reward dialog support keyboard navigation and touch.

City lookup tries city detail then town detail, rejecting province/state results. A live provider check for Naval showed why this matters: city detail returned Biliran province, while town detail correctly returned Naval. Town nodes use the provider's settlement extent; mapped administrative polygons are used to exclude roads outside the boundary when available. This is map-data coverage, not an assertion of exact municipal boundaries where OSM only provides a settlement node.

Spawn candidates come from tagged public walking roads, residential roads, paths, pedestrian ways and suitable service roads. Private/restricted access, crossings, tunnels, bridges, construction and highways are excluded. Unmapped or unavailable roads produce a retry status instead of invented off-road coordinates. Candidates are spaced at least 75 m apart. Up to 512 candidates are retained per settlement. Position and inventory remain server-owned.

## Rewards

Equipment counts exclude the additional 1–6 potions. Equipment uses the opener's current level, includes existing item stats/enhancements/passives, and may be a weapon or armor. Potions remain consumables without attributes.

The supplied percentages overlap and exceed 100%, so they are normalized as relative weights per equipment roll:

| Chest | Count per town | Equipment | Common | Uncommon | Rare | Mythic | Divine | Potions |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Golden | 4 | 3–6 | 80/165 ≈ 48.48% | 80/165 ≈ 48.48% | 5/165 ≈ 3.03% | — | — | 1–6 |
| Emerald | 2 | 4–8 | — | 90/101 ≈ 89.11% | 10/101 ≈ 9.90% | 1/101 ≈ 0.99% | — | 1–6 |
| Enchanted | 1 | 6–8 | — | 90/130 ≈ 69.23% | 28/130 ≈ 21.54% | 10/130 ≈ 7.69% | 2/130 ≈ 1.54% | 1–6 |

Opening requires fresh GPS within 200 m of the chest, accuracy within 100 m, and no active/pending battle. The first successful shared revision update wins. A claimed chest disappears for every user, then respawns at a different eligible road coordinate six hours after the claim, on the next discovery request. There are never more than seven active chest slots per settlement. If no different road coordinate is available, the slot stays closed until a valid location can be selected.

Claims persist rolled rewards before delivery. Profile receipt IDs prevent duplicate rewards across retries or concurrent requests. Unsettled claims are archived when their slot respawns, and can be reconciled on RPG initialization without GPS or a return trip to the original town. Full stash rewards stay in pending loot for Collect saved drops. Hero reset generations prevent old chest claims from being transferred to a replacement hero.

## Storage and validation

Uses the existing service-only `cb_inventory_items` storage and revision checks. A persistent chest registry chooses the first CMS owner as the canonical shared-row owner; later users and owner-role changes reuse that registry. Registry/city records use quantity zero and do not add tradable player items. No new SQL function or migration is required. Only sanitized public marker fields are sent to clients; claimant IDs and unawarded item rolls stay server-side. The health query `?feature=rpg&health=1&chests=1` checks inventory access and owner availability.

All 74 RPG regression tests and the production build passed. Tests cover shared counts, concurrent first creation and claims, duplicate retries, delayed delivery across respawns, recovery without GPS, private-road filtering, province rejection, polygon exclusion, gear/potion counts and rarities through Divine, stash overflow, and the visible marker/dialog flow. Browser QA used test GPS/road data and fixture rewards; no production player inventory was changed.

## Artwork status

Built-in image generation was attempted twice for the Golden chest and failed before producing a file: `Unknown parameter: reasoning` (HTTP 400). No CLI/API fallback was authorized or used. The implementation therefore reuses `public/guild/guild-chest.webp`, with separate gold, emerald-green and enchanted-purple presentation/glow styles. These are existing artwork variants, not three newly generated sprites.

Prepared artwork prompts for when generation is available:

- Golden: One closed golden treasure chest for Chess Burger, three-quarter isometric fantasy pixel art, dark wood, rich gold bands and chess-knight clasp, crisp silhouette readable at 64px, complete object with 25% transparent margins, no text/scenery/pedestal/other objects.
- Emerald: One closed emerald treasure chest in the same isometric fantasy pixel-art style and proportions, dark metal and deep green crystal panels with luminous emerald gems, crisp silhouette readable at 64px, complete object with 25% transparent margins, no text/scenery/pedestal/other objects.
- Enchanted: One closed enchanted treasure chest in the same isometric fantasy pixel-art style and proportions, dark carved metal, violet crystal and pale arcane rune glow, crisp silhouette readable at 64px, complete object with 25% transparent margins, no text/scenery/pedestal/other objects.
