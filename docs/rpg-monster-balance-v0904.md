# Monster level range and strength — v0.0904

Each fresh Explorer set samples 16 monster levels uniformly from the hero's level minus one through the hero's level plus twenty, inclusive. The interval is bounded to levels 1–88 before sampling so levels near the cap do not concentrate extra probability at level 88. A level 6 hero therefore encounters levels 5–26; a level 80 hero encounters levels 79–88. The spawn-policy version refreshes older cached sets once on discovery.

New monster combatants receive 1.2 times their former level-based Health, Attack, Magic, Armor, Mana, Wisdom and maximum AP, rounded to the nearest whole number. Current resources start at those boosted caps. This multiplier applies once in the shared monster constructor used by server combat and the generated browser bundle. A level 6 monster has 48 HP, 42 MP, 36 AP and 11 each in Attack, Magic, Armor and Wisdom. Hero growth and existing battles are not rewritten.

Road coordinates, the 800-meter spawn boundary, 200-meter interaction distance, 35% nearby target and 30-minute pin lifetime retain their existing behavior. Species, skill unlocks, elements and loot rules use their existing catalogs.

Verification: 25 spawn/combat checks and three focused UI checks passed. Coverage includes every eligible level at lower and upper boundaries, every monster species at all 88 levels, resource caps, unchanged hero bases, browser/server parity, server encounter construction, old-set invalidation, pinned reopening, reach validation, hit timing and enemy recovery. Production build passed.
