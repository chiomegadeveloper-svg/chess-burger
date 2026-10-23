# Compact Explorer layout — v0.0744

The Explorer sidebar now uses a compact hero/identity header, visible health and mana bars, XP, a flexible bag panel, four attack icons and an anchored Exit button. Long names truncate rather than wrapping into multiple rows. Short phone screens use icon shortcuts with accessible names and tooltips.

The full bag grid scales to its available width and height, including upgraded 6 × 12 bags. A size container preserves the inventory aspect ratio and square cells; the panel no longer scrolls or clips lower rows. Landscape keeps the sidebar beside the map; a portrait fallback places the bag beside the compact hero panel above the map. Safe-area insets protect controls on phones.

Validation: 34 RPG live UI, GPS and frame regression tests passed; production build passed. Browser checks of the actual generated game at 568 × 320, 844 × 390, 1024 × 768 and 390 × 844 confirmed the bag stays inside its panel with no Explorer page overflow. Upgraded bag at 844 × 390 measured 90 × 180 pixels (6 × 12), preserving square cells and all rows. Preview used fixture inventory and simulated GPS. Screenshot: images/rpg-mobile-v0744.jpg.

No inventory, rewards, GPS or battle rules changed. Equipment still opens through the existing equipment controls.
