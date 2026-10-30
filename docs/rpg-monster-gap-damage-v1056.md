# Monster damage by level gap — v0.1056

Monster attacks against heroes now gain an outgoing damage multiplier based on monster level minus hero level. A gap of 3–5 grants +20%, 6–10 grants +40%, 11–20 grants +60%, and 21 or higher grants +80%. Equal-level monsters, lower-level monsters and gaps of one or two receive no additional gap bonus. The overlapping request at level 20 is resolved by keeping 20 in the explicit 11–20 interval and beginning the last interval at 21.

The multiplier applies once to normal integer damage after armor, equipment passives and elemental modifiers, then rounds to a whole number. Defending halves that result using the existing rule. It applies to physical, magical and boss attacks against heroes. Hero attacks and player-versus-player damage use their existing formulas. The earlier 20% monster base-stat increase remains part of the base calculation; this new change adjusts outgoing damage, not resource caps or recovery amounts.

Server attacks, AI damage estimates and browser skill tooltips share the same rule. Normal Explorer spawns still range from hero level minus one through plus twenty, capped at 88; the +80% tier is available for future encounters with larger level gaps.

Verification: 22 combat checks and three focused UI checks passed, including all interval boundaries, signed level differences, magic/physical and boss damage, equipment/element modifiers, defending, AI finishing-attack selection, event/report values, resource costs, browser/server agreement, hit timing and encounter retries. Production build passed.
