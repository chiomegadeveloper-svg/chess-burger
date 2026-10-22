# RPG v0.0680

Hero Room now shows true Health, Mana and AP bars, larger stat/level labels, saved upgrade points and an icon-only Skill Book. The Explorer bars track actual values, including zero. Marked explanatory labels were removed, and encounter level badges sit inside portraits. Hero artwork is unchanged and fits its frame.

Each level retains automatic +4 HP, +2 AP, +3 MP and +1 Attack/Magic/Armor/Wisdom, and grants one spendable stat point. Existing levels receive missing points once, minus previously spent upgrades. Server saves preserve upgrades and reject forged item passives.

Explorer recovery adds 1 HP and 1 MP every 30 seconds with continuous fresh GPS heartbeats. It stops in battles, hidden pages and outside Explorer, caps at maximum resources and does not accumulate offline recovery.

Monster knockout victories independently roll 48% for 1–8 CBG, in addition to existing loot and XP. A saved receipt is rolled once. Equipped CBG luck raises the chance to 88%, without stacking; CBG gain increases the payout. Other percentage bonuses stack to 200%, except damage resistance, capped at 60%. New equipment receives one random passive; existing equipment retains its rolls. Consumables never receive passives.

| Passive | Range |
| --- | --- |
| CBG luck | 88% drop chance |
| CBG gain | +28–68% |
| Attack | +8–48% |
| Attack Points capacity | +2–10% |
| Mana Points capacity | +8–28% |
| Damage to monsters | +2–8% |
| Health capacity | +2–8% |
| Magic | +2–8% |
| Armor | +2–8% |
| Wisdom | +2–8% |
| Physical damage | +2–8% |
| Magic skill damage | +2–8% |
| Damage resistance | +2–8% |
| Potion effectiveness | +2–8% |

Merchant potion quantities are 1–99 at 8 CBG each. Purchases are all-or-nothing if stash space is insufficient. Bag expansions add 12 cells (two rows) for 488 CBG, up to three expansions / 72 total cells. Purchases work by button or dragging stock into the inventory panel. Purchased items enter the stash. Selling retains drag-and-drop and the existing atomic wallet transaction.

Autosave immediately queues inventory edits, coalesces updates, retries transient failures and reconnects, retains pending edits locally, and restores compatible pending edits on reopening. A 20-second Hero Room checkpoint and visibility/page-exit flush supplement action saves. Combat, shop, potion and stat upgrade mutations are server-persisted as part of each action. A Saved/Saving/Save pending badge replaces manual saving. An interrupted browser shutdown cannot guarantee network completion; pending local inventory is retried on reopening if its hero generation and inventory revision still match.

## Production activation

Merchant RPC is already installed and was verified ready. New CBG settlement requires `supabase/rpg-battle-rewards.sql` in project `ohaaoiiuaakidttsonxj`. The connected Supabase account denies access to that production project. Until installed, CBG rolls are retained as pending receipts, while XP/items remain usable. Reopening RPG retries up to five pending payouts. The service-role-only function locks wallet and RPG save, reads the saved amount, updates wallet/ledger/receipt atomically, and prevents duplicate payment. No client-supplied amount is accepted. Health probe: `/api/profile?feature=rpg&health=1&merchant=1&rewards=1`.

## Verification

All 60 targeted RPG regression tests passed, plus a repeated 15-test UI run after autosave hardening. SQL tests using PGlite, live API/DOM integration tests, production build and browser QA. Browser fixture verified 0 HP empty bar, partial MP/AP bars, retained upgrades after reload, 488-CBG/12-cell purchase, three-potion/24-CBG purchase, and drag-to-buy. Fixture wallet and GPS are test data; no production user account was altered.
