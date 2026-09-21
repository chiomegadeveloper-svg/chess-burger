import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const online = readFileSync(new URL("../app/online-play.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");

test("Play Online requires a Regular or Wager choice before searching", () => {
  assert.match(online, /Choose Play Online mode/);
  assert.match(online, /Regular play/);
  assert.match(online, /Wager play/);
  assert.match(online, /play_mode: playMode/);
  assert.match(online, /wager_gold: playMode === "wager" \? wagerGold : 0/);
  assert.match(online, /setModeOpen\(true\)/);
});

test("automatic pairing separates regular players and exact wager amounts", () => {
  assert.match(api, /playMode === 'wager' \? `wager:\$\{wagerGold\}:\$\{controlId\}` : `normal:\$\{controlId\}`/);
  assert.match(api, /map\(\(\[id\]\) => queueTicket\(id, playMode, wagerGold\)\)/);
});

test("a found wager waits for explicit opponent approval without deducting Gold", () => {
  const pending = api.indexOf("if (playMode === 'wager') {");
  const debit = api.indexOf("client.rpc('cb_activate_gold_match'", pending);
  assert.ok(pending >= 0 && debit > pending);
  assert.match(api, /invite_to: playMode === 'wager' \? account\.id : null/);
  assert.match(api, /pending_wager: true/);
  assert.match(online, /Accept \$\{room\.wager_gold\} Gold Bet/);
  assert.match(online, /Reject Bet/);
  assert.match(online, /arena\("decline-room", \{ id: room\.id \}\)/);
});

test("the global invitation inbox clearly presents Accept Bet and Reject Bet", () => {
  assert.match(page, /offered a \$\{i\.wager_gold\} Gold bet/);
  assert.match(page, /"Accept Bet"/);
  assert.match(page, /"Reject Bet"/);
  assert.match(page, /Match \$\{i\.wager_gold\} Gold to play/);
});

test("regular automatic pairing has no mandatory Gold stake", () => {
  assert.match(api, /playMode: 'normal' \| 'wager'/);
  assert.match(api, /wagerGold = playMode === 'wager' \? Number\(requestedWager\) : 0/);
  assert.doesNotMatch(online, /Automatic pairing costs 3 Gold each/);
  assert.match(online, /Regular pairing has no stake/);
});
