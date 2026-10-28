# Explorer nearby spawns — v0.0888

Fresh monster sets reserve 35% of their population, rounded to the nearest whole monster, for public-road coordinates within the hero's 200-meter attack range. A normal set of 16 therefore has six nearby monsters and ten farther away, up to the existing 800-meter spawn boundary. Species selection and level distribution are unchanged.

The target adapts to available road coverage. Sparse nearby roads can reduce the reachable count; sparse distant roads can increase it so valid road encounters are not discarded. No off-road coordinates are fabricated. The spawn-policy version invalidates older sets once, so the next Explorer opening uses the new distribution. Thereafter, reopening and GPS refreshes restore the same pinned set until its 30-minute expiry; defeated monsters remain removed.

Verification: 11 server checks passed, including 100 different spawn seeds with six reachable monsters, sparse-road cases, old-set invalidation, cache restoration on reopening, expiry, city transitions, the 200-meter attack boundary and nearby PvP. The production build passed.
