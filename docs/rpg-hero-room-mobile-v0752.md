# Compact mobile Hero Room — v0.0752

The Hero Room fits its hero, statistics, resource bars, complete bag and stash grids, and skill controls into the available screen. Active attacks share the lower shelf with the power library, leaving uninterrupted height for both inventory grids. The orange Explore World control remains prominent.

Removed the inventory minimum width and scroll constraint that clipped the lower bag rows. Bag and stash now scale to their own available width and height, preserving square cells for standard and upgraded inventories. Short-screen type and spacing overrides prevent the hero panel from pushing XP and resources out of view. A portrait fallback arranges the hero above the inventories. Desktop retains the larger skill book.

Validation: 30 RPG live UI, sprite-frame and inventory persistence regression tests passed; production build passed. Browser checks of the generated game at 752 × 340, 568 × 320, 390 × 844 and 1024 × 768 found no page overflow, no clipped bag/stash grids and no hero panel overflow. Standard grids measured 145 × 145 pixels at 752 × 340; a fully upgraded bag measured 72.5 × 145 pixels, preserving all 12 rows. Selecting an item showed the existing rotate, transfer, details and discard actions while keeping the bag fully visible.

Preview uses fixture inventory, not a production account. Evidence: images/rpg-hero-room-v0752.jpg. Inventory, hero sprites, stat calculations, progression and purchase rules are unchanged.
