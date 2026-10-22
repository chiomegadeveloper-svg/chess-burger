# RPG Explorer radius and chest artwork — v0.0712

Monster road discovery, candidate filtering, saved road-cache coverage and visible map pins now use a shared 1,200-meter spawn radius. Interaction and combat remain limited to 200 meters for monsters and other players. The existing 16-monster population, level mix and 30-minute pinned set lifetime remain unchanged. Existing active sets complete their normal lifetime; new sets use the expanded coverage. Old 600-meter road caches are refreshed before creating a new set.

Both vector map lookup and tagged-road fallback cover the full expanded radius. Vector lookup adapts its tile zoom at high latitudes to keep the complete area within at most nine tiles.

The three new transparent WebP assets are saved at:
- public/rpg/assets/chests/golden.webp
- public/rpg/assets/chests/emerald.webp
- public/rpg/assets/chests/enchanted.webp

Map pins and the opening dialog select the corresponding image without recoloring the artwork. Chest discovery starts on a fresh Explorer GPS fix and refreshes when returning from the equipment room. The existing shared city chest system remains active: 4 golden, 2 emerald, 1 enchanted, public mapped roads, 200-meter opening range, first successful claim receives rewards, six-hour respawn at another location. View city chests frames the whole settlement because citywide chests can be farther than the monster radius.

Validation: 77 tests pass, production build passes. New tests cover road candidates beyond 1,100 meters, exclusion beyond 1,200 meters, old-cache replacement, continued 200-meter combat enforcement and all three dialog image sources. Browser QA with fixture inventory and simulated GPS confirmed seven visible chest pins, the enchanted chest artwork, successful claiming, icon rewards and delivery to stash. Screenshot: docs/images/rpg-chest-webp-v0712.jpg. No production player's inventory was altered for testing.

## Artwork generation
Built-in image generation was used, then the generated alpha images were converted to 384-pixel WebP assets at quality 92. Original outputs remain intact.

Shared prompt: Use case: stylized-concept. Asset type: Chess Burger RPG GPS map sprite, single isolated closed treasure chest. Polished isometric fantasy pixel art with crisp readable silhouette, front three-quarter view, matching a fantasy RPG hero sprite. One chest only, centered, entire object visible, 25 percent empty transparent padding on all sides. True transparent background, no floor, no landscape, no text, no border, no watermark. Must remain recognizable at 72 pixels. Save as a usable project asset.

Subjects:
- Golden: a sturdy golden treasure chest, warm gold metal bands, amber jewel lock, dark walnut wood, subtle warm glow.
- Emerald: an emerald treasure chest, vivid emerald green crystal panels, ornate gold bands, large emerald jewel lock, subtle green glow.
- Enchanted: an enchanted treasure chest, violet wood and silver arcane bands, luminous purple crystals, magical cyan rune lock, subtle violet glow.
