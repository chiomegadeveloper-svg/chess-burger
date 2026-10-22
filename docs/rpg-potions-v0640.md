# RPG potions v0.0640

Health and mana potions are consumables, not equipment. They have no passive stats, enhancements, bonus attributes, item level, gear tier, or level requirement. Existing potions normalize in place on account load/request; identity, inventory placement and rarity are preserved. New rolls use the consumable schema from the shared inventory core.

In Hero Room, drag a potion from the bag or stash onto the hero. The hero scene highlights as a drop target. Releasing consumes that exact owned potion through the authenticated server API. Selecting a potion and using the inspector’s Use potion button provides a keyboard-friendly alternative. Health restores a fixed 20 HP; mana restores a fixed 20 MP, capped at the hero’s maximum. Full resources reject activation without consuming the item. Requests are serialized and revision-protected; retries cannot consume the same UID again.

Remaining mana now carries across battles alongside health. AP still refills. Both current resources are server-owned and cannot be changed by an inventory save. Potions are used in Hero Room outside active combat; the existing turn-based battle rules remain intact.

Validation includes account integration tests for conversion, exact restoration, caps, ownership, replay and resource forgery; DOM pointer-drag tests for both potion types; and existing RPG battle, GPS, hero reset, artwork and API tests. No database schema change is required.
