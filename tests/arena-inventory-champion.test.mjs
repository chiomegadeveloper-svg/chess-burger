import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bag = readFileSync(new URL("../app/shop.tsx", import.meta.url), "utf8");
const bagCss = readFileSync(new URL("../app/rpg-bag.css", import.meta.url), "utf8");
const arena = readFileSync(new URL("../app/grand-arena.tsx", import.meta.url), "utf8");
const arenaApi = readFileSync(new URL("../api/grand-arena.ts", import.meta.url), "utf8");
const feed = readFileSync(new URL("../app/community-feed.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/0033_arena_champion_payout_feed_cleanup.sql", import.meta.url), "utf8");

test("My Bag uses responsive RPG inventory tiles and includes Arena Tickets", () => {
  assert.match(bag, /rpg-bag/);
  assert.match(bag, /Arena Ticket/);
  assert.match(bag, /state\.tickets/);
  assert.match(bagCss, /repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(bagCss, /repeat\(3,minmax\(0,1fr\)\)/);
});

test("champion payout is idempotent and clears completed standings", () => {
  assert.match(migration, /arena-champion:/);
  assert.match(migration, /returning id into v_ledger_id/);
  assert.match(migration, /gold_points=gold_points\+v_prize/);
  assert.match(migration, /Repair a previously declared champion/);
  assert.match(migration, /delete from public\.cb_arena_entries where session_id=s\.id/);
});

test("Arena publishes one champion card instead of per-match win cards", () => {
  assert.doesNotMatch(migration, /won a Grand Arena match\.',4,8/);
  assert.match(migration, /won Grand Arena Session/);
  assert.match(migration, /Champion Pot/);
  assert.match(feed, /grand-arena-champion-feed/);
  assert.match(feed, /Champion Pot/);
});

test("Grand Arena exposes and renders only the latest 20 champions", () => {
  assert.match(arenaApi, /limit\(20\)/);
  assert.match(arenaApi, /history:/);
  assert.match(arena, /This week’s Grand Arena winners/);
  assert.match(arena, /state\.history\.slice\(0, 20\)/);
});
