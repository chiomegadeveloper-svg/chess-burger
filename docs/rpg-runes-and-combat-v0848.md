# Rune artwork and combat fixes

The supplied stone-rune sheet is preserved at `public/rpg/assets/skills/rune-source.webp`. `scripts/build-rpg-runes.mjs` crops and maps it to 30 WebP skill icons used in the room, starter picker, map, battle and report. Skill IDs and costs are unchanged.

Loot buttons use explicit border-box dimensions and an absolutely positioned contained thumbnail, avoiding intrinsic grid sizing from tall weapon images. Browser checks covered a sword, dagger, shield and potion.

Attack metadata now records the visible height of each pose and its matching idle sprite. The renderer normalizes every frame to the idle height while keeping its foot baseline planted. Breathing loops every 1.15 seconds, with a different phase for the opponent and reduced-motion support.

Monsters now attack with an affordable skill even below the previous arbitrary eight-point threshold. Valid defensive and recovery turns remain, but emit ordered events and visible feedback instead of silently returning control. PvP never receives an AI response.

Validation: production build; 25 UI tests; a separate UI test for visible monster recovery feedback; eight combat/renderer tests, including all-pose size consistency, low-resource attacks, cooldown recovery and PvP isolation. Remaining RPG checks passed; the two old SVG-path expectations found in the initial full run were updated and passed in the complete UI rerun.
