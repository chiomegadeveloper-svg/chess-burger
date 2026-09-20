import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync(new URL("../app/feed-banner-catalog.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/0021_feed_banner_shop.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("feed banner catalog contains ten pastel and ten metallic products", () => {
  assert.equal((catalog.match(/\{ id: "pastel-[^"]+"/g) ?? []).length, 10);
  assert.equal((catalog.match(/\{ id: "metal-[^"]+"/g) ?? []).length, 10);
  for (const price of [38, 58, 68, 78]) assert.match(catalog, new RegExp(`price: ${price}\\b`));
});

test("banner purchases are atomic, idempotent, and activate ownership", () => {
  assert.match(sql, /for update/i);
  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.match(sql, /gold_points=gold_points-v_price/i);
  assert.match(sql, /active_feed_banner=p_product_id/i);
  assert.match(api, /action==='buy-feed-banner'/);
  assert.match(api, /action==='activate-feed-banner'/);
});

test("main navigation exposes Bag and Guild destinations", () => {
  assert.match(page, /key: "bag", label: "Bag"/);
  assert.match(page, /key: "guild", label: "Guild"/);
  assert.match(page, /Coming soon/);
});
