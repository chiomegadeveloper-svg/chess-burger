# Skill activation confirmation and Skill Book reminder — v0.0720

Tapping an available rune in Attack Skill Book now previews its icon, AP/MP costs, damage formula, cooldown and attribute bonuses in a compact confirmation dialog. Cancel returns to the rune list without learning the skill or spending a choice. Activate spends one choice and equips the new skill in an empty active slot. When all four slots are occupied, the player must select a replacement; the previous skill is retained in the Power Library. No replacement occurs without an explicit selection.

The Skill Book is larger (72 × 64 pixels on taller screens; 60 × 52 on short landscape screens) and sits beside skill progress. A green glow and indicator remain visible while unspent choices are available, disappear once all choices are used and return with new level rewards. The existing progression remains one new skill choice every two levels. Reduced-motion preferences use a static glow. The confirmation uses a native modal dialog with keyboard focus containment; Escape cancels the selection while keeping the book open.

Validation: 78 tests pass and production build passes. The new integration test covers cancellation, selecting another rune, learning and equipping, credit consumption, glow persistence/exhaustion, a later level reward and replacing a full loadout while preserving the old skill. Browser fixture QA confirmed the larger glowing book, Cancel returning to the grid, choosing Fireball instead, Activate updating the equipped rune and bonuses, and successful autosave. No production user's hero was modified for testing.

Screenshots: docs/images/rpg-skill-confirm-v0720.jpg and docs/images/rpg-skill-book-v0720.jpg.
