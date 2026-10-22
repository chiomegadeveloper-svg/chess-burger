# RPG battle v0.0632

Harvest chess uses server-owned one-minute clocks for each side and submits one move per request. Premoves queue during the AI turn, then execute only if still legal. Chess and puzzle results appear before the monster response presentation.

Every active battle has a five-minute wall-clock limit, including harvest time. Expiry awards no XP or drops. PvP starts its limit on acceptance. Damage and damage sprites update at the confirmed skill impact callback; no unconfirmed damage animation runs ahead of the server. Monster skill selection highlights its rune for a random 1–2 second windup. Cast and impact sounds use Web Audio with a persistent mute control.

Each of the original animation cells gets a virtual 640px frame around its 256px art: 60% transparent allowance, centered with 192px margins. Pixi orig/trim rectangles preserve art and avoid allocating larger GPU sheets. Hero and monster artwork is unchanged.

HP is stored in the account and survives win, loss, forfeit, timeout and level-up. World and Hero Room show remaining HP. A consumed owned health potion heals 50% of maximum HP, capped at maximum. Three starter health potions are granted once to new and existing heroes. Zero-HP heroes must heal before another battle. Potion consumption and item grants advance an inventory revision so stale layouts cannot erase rewards or resurrect consumed items.

A monster knockout victory rolls 1–3 drops. Every drop independently rolls 85% Common, 10% Uncommon, 5% Rare. One drop is a health potion; extra drops can be weapons, armor or potions. Server receipts settle XP and drops once. Drops fill available stash cells; pending drops remain unaccepted while the stash is full. Players select an item, press **Throw away**, then **Collect saved drops**. No automatic stash expansion occurs.

Browser review covered desktop and 844×390 landscape battle/report layouts and the original ct.js runtime. Automated tests cover clocks, premoves, harvest feedback timing, confirmed hit presentation, health persistence and potion ownership, full stash/delete/accept, rarity boundaries, reward replay, account scope, GPS and owner resets. The production build validates serverless helpers. Authenticated production gameplay needs the player's session; it is covered with the account API integration harness rather than borrowing a user session.
