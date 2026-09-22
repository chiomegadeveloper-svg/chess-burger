import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Bag slots default to 10 and upgrade by 10 for exactly 48 Gold", async () => {
  const sql = await read("supabase/0034_bag_slots_and_gold_gifts.sql");
  assert.match(sql, /bag_slots integer not null default 10/i);
  assert.match(sql, /gold_points=gold_points-48,bag_slots=bag_slots\+10/i);
  assert.match(sql, /'added_slots',10/i);
  assert.match(sql, /on conflict\(id\) do nothing/i);
  assert.match(sql, /Your Bag is full\. Buy 10 more slots in the Shop\./i);
  assert.match(sql, /cb_arena_tickets_bag_capacity/i);
  assert.match(sql, /cb_inventory_items_bag_capacity/i);
  assert.match(sql, /cb_user_items_bag_capacity/i);
});

test("Gold gifts debit and credit players atomically without a fee", async () => {
  const sql = await read("supabase/0034_bag_slots_and_gold_gifts.sql");
  assert.match(sql, /create or replace function public\.cb_gift_gold/i);
  assert.match(sql, /gold_points=gold_points-p_amount/i);
  assert.match(sql, /gold_points=gold_points\+p_amount/i);
  assert.doesNotMatch(sql, /p_amount\s*\+\s*4/i);
});

test("Shop and Bag expose slot upgrades, balance, and Gold gifting", async () => {
  const [shop, api] = await Promise.all([read("app/shop.tsx"), read("api/arena.ts")]);
  assert.match(shop, /Chess Burger Bag/);
  assert.match(shop, /\+10 slots · 48 Gold/);
  assert.match(shop, /Gift Gold/);
  assert.match(shop, /\{state\.used_slots\}\/\{state\.bag_slots\} slots/);
  assert.match(api, /action==='buy-bag-slots'/);
  assert.match(api, /action==='gift-gold'/);
});

test("Chess Burger Bag WebP asset is present", async () => {
  const asset = await stat(new URL("../public/inventory/chess-burger-bag.webp", import.meta.url));
  assert.ok(asset.size > 10_000);
});
