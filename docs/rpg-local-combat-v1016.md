# RPG local combat — v0.1016

Monster encounters obtain an account-owned battle snapshot after the existing 200 m map selection check. Turns, puzzles, chess clocks, potions, cooldowns, deterministic monster responses and impact presentation then run locally. Each command is saved to a device journal before advancing the UI. The finished journal is replayed against the server-issued snapshot and owned potion list before the existing XP, loot and wallet settlement runs. Duplicate settlement acknowledgements cannot award the battle again. PvP remains online.

Puzzle success restores 20% of maximum MP; a chess victory restores 20% of maximum AP. Values round to whole points and stop at the resource cap. Potion and defend gains retain their existing rules.

GPS watches continue automatically in Explorer, request a fresh device fix when needed, and renew the fix at request dispatch rather than using a position captured before a queue delay. Encounter selection retries automatically. Actual device timestamps and the server range check remain in use. GPS pauses during battle.

Healthy characters use their original idle art. Living poses use continuous CSS breathing rather than stepping through differently drawn poses. Injury stages and death collapse remain; damage reveals at skill impact. Monster reply presentation waits 180–300 ms, and effect loading/fallback waits are bounded.

## Validation

- 89 targeted tests passed, including the live UI, offline replay, save retry/idempotence, potion debit, harvest amounts/clocks, GPS range and refresh, injury/death presentation, and reward settlement.
- `npm run build:vercel` passed; existing large bundle warnings remain.
- Browser QA used a simulated account with the real RPG frontend and service: local attacks, puzzle entry, immediate harvest result and final forfeit settlement. No production account or wallet was used for QA.
- [Battle screenshot](images/rpg-local-battle-v1016.jpg).

A connection is required to select/start a saved monster encounter and to settle its result. Interrupted sync keeps the device journal and retries on reconnection. The server-issued settlement session expires after 24 hours. Full app startup and live player duels still require a connection. No database migration is required.
