import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const online = readFileSync(new URL("../app/online-play.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const wagerSql = readFileSync(new URL("../supabase/0015_match_wagers.sql", import.meta.url), "utf8");

test("Play Online offers normal and user-priced wager modes", () => {
  assert.match(online, /Choose online match mode/);
  assert.match(online, /Post \$\{wagerGold\} Gold wager/);
  assert.match(online, /publicChallenge: !target && !challenge && playMode === "wager" \? true/);
  assert.match(online, /opponent must match \{wagerGold\|\|0\} Gold or reject/);
});

test("targeted wager recipient can match the stake or reject", () => {
  assert.match(page, /Match \$\{Number\(i\.wager_gold \?\? 0\)\} Gold/);
  assert.match(page, /arena\("decline-room", \{ id: i\.id \}\)/);
  assert.match(page, />\s*Reject\s*</);
  assert.match(page, /You need \{Number\(i\.wager_gold \?\? 0\)\} Gold to match this wager/);
});

test("server escrows equal stakes only after acceptance", () => {
  assert.match(api, /cb_activate_gold_match/);
  assert.match(wagerSql, /host_gold<stake/);
  assert.match(wagerSql, /acceptor_gold<stake/);
  assert.match(wagerSql, /gold_points=gold_points-stake/);
});
