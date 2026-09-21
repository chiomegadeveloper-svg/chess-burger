import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const social = readFileSync(new URL("../app/social.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const onlineGame = readFileSync(new URL("../app/online-game.tsx", import.meta.url), "utf8");

test("result popup offers normal and wager rematches", () => {
  assert.match(social, /Offer a rematch/);
  assert.match(social, /Standard Gold rewards/);
  assert.match(social, /Both players stake equally/);
  assert.match(social, /rematch_of: result\.id/);
  assert.match(page, /control: m\.control/);
});

test("rematches are limited to the original players and time control", () => {
  assert.match(api, /previous\.status!==\'finished\'/);
  assert.match(api, /target=previous\.white_id===account\.id\?previous\.black_id:previous\.white_id/);
  assert.match(api, /control=previous\.control/);
  assert.match(api, /A rematch offer between these players is already waiting/);
});

test("auto-aborted matches open a reward-free summary after acknowledgement", () => {
  assert.match(onlineGame, /Tap to view the match summary/);
  assert.match(onlineGame, /onFinished\(confirmed\)/);
  assert.match(page, /\["finished", "cancelled"\]\.includes\(m\.status\)/);
  assert.match(social, /No rating or Gold was awarded/);
  assert.match(social, /!result\.aborted && !result\.local/);
});
