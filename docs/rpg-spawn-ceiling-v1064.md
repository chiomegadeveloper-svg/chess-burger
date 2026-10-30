# Explorer monster ceiling — v0.1064

Fresh Explorer sets sample monster levels from hero level minus one through hero level plus thirty, inclusive, bounded to levels 1–88. A level 6 hero can encounter levels 5–36. This brings level gaps of 21–30 into the regular spawn pool and activates the existing +80% outgoing monster damage tier for those encounters.

Spawn-policy version 6 invalidates older sets on the next discovery. New sets retain the existing thirty-minute pin lifetime, road spacing, 800-meter spawn radius and 35% nearby target.

Verification: 19 spawn, spacing and combat checks passed, including every eligible level, cap boundaries, cached set replacement, road placement, 200-meter interaction and damage tiers. Production build passed.
