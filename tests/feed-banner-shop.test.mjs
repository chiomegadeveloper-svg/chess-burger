import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync(new URL("../app/feed-banner-catalog.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/0021_feed_banner_shop.sql", import.meta.url), "utf8");
const rentalSql = readFileSync(new URL("../supabase/0062_color_banner_collections.sql", import.meta.url), "utf8");
const shop = readFileSync(new URL("../app/shop.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("shop lists 25 pastel, 25 metallic, and 15 neon colors with matching database prices", () => {
  const current = catalog.split("const LEGACY_FEED_BANNERS")[0];
  const products = [...current.matchAll(/\{ id: "([^"]+)", name: "([^"]+)", tier: "(pastel|metallic|neon)", price: (\d+),/g)];
  for (const [tier, count] of [["pastel", 25], ["metallic", 25], ["neon", 15]])
    assert.equal(products.filter(product => product[3] === tier).length, count);
  for (const [, id, name, tier, price] of products.slice(20))
    assert.ok(rentalSql.includes(`('${id}','feed_banner','${name}','${tier}',${price})`), `${id} missing from SQL`);
  assert.match(shop, /\(\["pastel", "metallic", "neon"\] as const\)/);
  assert.doesNotMatch(shop, /Cute Chess|Electric Warriors|Animated Chess|Robot Chess/);
});

test("banner purchases are atomic, idempotent, and activate ownership", () => {
  assert.match(sql, /for update/i);
  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.match(sql, /gold_points=gold_points-v_price/i);
  assert.match(sql, /active_feed_banner=p_product_id/i);
  assert.match(api, /action==='buy-feed-banner'/);
  assert.match(api, /action==='activate-feed-banner'/);
});

test("color banners use three durations and retiring graphics preserve existing rentals", () => {
  assert.match(catalog, /FEED_BANNER_DURATIONS[^=]*= \[3, 5, 7\]/);
  assert.match(catalog, /tier === "neon".*\{ 3: 0, 5: 40, 7: 80 \}/);
  assert.match(catalog, /LEGACY_FEED_BANNERS/);
  assert.match(rentalSql, /set active=false\s+where kind='feed_banner' and tier in \('cute','warrior','animated','robot'\)/);
  assert.doesNotMatch(rentalSql, /delete from public\.cb_user_items/i);
  assert.match(api, /cb_buy_feed_banner_timed/);
  assert.match(api, /\^\(pastel\|metal\|neon\)/);
  assert.match(rentalSql, /greatest\(now\(\),cb_user_items\.expires_at\)/i);
});

test("main navigation uses the requested nine-item order", () => {
  const block = page.slice(page.indexOf("const navigation = ["), page.indexOf("type Invite"));
  const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["Home", "Map", "Card", "Guild", "Play", "Shop", "Bag", "Rank", "Profile"]);
});
