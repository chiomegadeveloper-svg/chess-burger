import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync(new URL("../app/feed-banner-catalog.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/0021_feed_banner_shop.sql", import.meta.url), "utf8");
const rentalSql = readFileSync(new URL("../supabase/0022_feed_banner_rentals.sql", import.meta.url), "utf8");
const priceSql = readFileSync(new URL("../supabase/0024_feed_banner_prices.sql", import.meta.url), "utf8");
const extensionSql = readFileSync(new URL("../supabase/0025_feed_banner_extension_discount.sql", import.meta.url), "utf8");
const shop = readFileSync(new URL("../app/shop.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("feed banner catalog contains ten pastel and ten metallic products", () => {
  assert.equal((catalog.match(/\{ id: "pastel-[^"]+"/g) ?? []).length, 10);
  assert.equal((catalog.match(/\{ id: "metal-[^"]+"/g) ?? []).length, 10);
  for (const price of [128, 148, 218, 268]) assert.match(catalog, new RegExp(`price: ${price}\\b`));
});

test("banner purchases are atomic, idempotent, and activate ownership", () => {
  assert.match(sql, /for update/i);
  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.match(sql, /gold_points=gold_points-v_price/i);
  assert.match(sql, /active_feed_banner=p_product_id/i);
  assert.match(api, /action==='buy-feed-banner'/);
  assert.match(api, /action==='activate-feed-banner'/);
});

test("feed banners are timed rentals with three duration choices", () => {
  assert.match(catalog, /FEED_BANNER_DURATIONS[^=]*= \[3, 5, 7\]/);
  assert.match(catalog, /\{ 3: 0, 5: 20, 7: 40 \}/);
  assert.match(catalog, /\{ 3: 0, 5: 60, 7: 120 \}/);
  assert.match(shop, /Choose rental duration/);
  assert.match(api, /cb_buy_feed_banner_timed/);
  assert.match(api, /\.gt\('expires_at'/);
  assert.match(rentalSql, /now\(\) \+ interval '7 days'/i);
  assert.match(rentalSql, /greatest\(now\(\),(?:public\.)?cb_user_items\.expires_at\)/i);
  assert.match(rentalSql, /expires_at>now\(\)/i);
  assert.match(priceSql, /'pastel-blush',128/);
  assert.match(priceSql, /'pastel-coral',148/);
  assert.match(priceSql, /'metal-gold',218/);
  assert.match(priceSql, /'metal-ruby',268/);
  assert.match(priceSql, /select tier,price_gold into v_tier,v_price/i);
});

test("active rental extensions receive a 30 percent discount", () => {
  assert.match(catalog, /Math\.round\(feedBannerRentalPrice\(banner, days\) \* 0\.7\)/);
  assert.match(shop, /Extend · 30% off/);
  assert.match(extensionSql, /expires_at>now\(\)/i);
  assert.match(extensionSql, /if v_extending then v_price := round\(v_price \* 0\.70\)/i);
  assert.match(extensionSql, /discount_percent/);
});

test("main navigation uses the requested nine-item order", () => {
  const block = page.slice(page.indexOf("const navigation = ["), page.indexOf("type Invite"));
  const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["Home", "Map", "Card", "Guild", "Play", "Shop", "Bag", "Rank", "Profile"]);
  assert.match(page, /Coming soon/);
});
