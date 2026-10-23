# RPG bag display — v0.0792

Explorer previously rotated item images inside their unrotated image boxes. A three-cell vertical weapon placed horizontally could therefore be clipped to a small glowing fragment. The Explorer bag now uses centered absolute image boxes, swapping width and height proportions for 90° and 270° rotation, as Hero Room does. This also fixes the battle bag, which copies Explorer item markup. Inventory data, footprints, rotations, ownership and stats are unchanged.

The Explorer grid aligns directly below its heading instead of sitting halfway down a tall empty panel. Grid size still fits the available width and height.

Validation: 13 existing inventory, potion, battle-potion, frame layout and Postgres JSONB tests passed. Production build passed. Browser QA used the actual Explorer rendering function and item artwork with fixture equipment, verifying that all eight item image rectangles fit their assigned boxes at 90° and inspecting reverse rotation. No production player data was edited. Screenshot: `docs/images/rpg-bag-fit-v0792.jpg`.
