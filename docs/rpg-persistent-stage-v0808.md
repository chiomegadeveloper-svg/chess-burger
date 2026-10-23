# Persistent battlefield and 10,800 m spawns — v0.0808

Both existing fighter images now live inside the scenic attack frame from battle opening through completion. The separate portrait panels and VS label are removed. The empty Attack Animation caption is gone. The enlarged responsive battlefield takes the former portrait space; both fighters sit near the foreground ground line. During a skill, only the caster's idle artwork is temporarily replaced by its attack poses. The opponent remains visible, damage state still changes at contact, and idle artwork returns after the animation or cancellation. The hero image remains the potion drop target. Chess harvesting retains its dedicated board view.

Monster candidates and rendered encounters use a 10,800 meter radius. Server and browser catalogs match; vector and tagged-road lookups cover the expanded radius. Old 1,200 m road caches and encounter sets refresh instead of restricting the new area. New sets still last 30 minutes with 16 monsters. Both monster and player interaction limits remain 200 meters.

The image generation tool produced a layout concept from the exact user-selected screenshot. It informed layout only; existing hero, monster and background assets were retained in the actual game. Concept: docs/images/rpg-stage-concept-v0808.webp. Prompt: “Combine the narrow moonlit attack animation strip and the two character portrait frames into one taller scenic battlefield; keep the original green assassin and white-haired elf identities, remove the green annotations and VS, remove Attack Animation text, keep round and turn status, and preserve lower controls.”

Browser QA used the full built RPG, RPG bridge protocol and real battle service with isolated fixture data. Verified battle opening, a completed attack and enemy reply, persistent idle fighters, no VS, scene retention, and desktop plus 752 × 340 landscape layouts. Mobile battlefield height measured 144px. Actual screenshots: docs/images/rpg-battle-stage-v0808.jpg and docs/images/rpg-battle-stage-mobile-v0808.jpg. No production player data was modified during testing.

All 101 RPG tests and the production build passed.
