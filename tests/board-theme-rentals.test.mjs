import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const catalog = read("../app/board-themes.ts");
const sql = read("../supabase/0063_board_theme_rentals.sql");
const api = read("../api/arena.ts");
const board = read("../app/match-board.tsx");
const shop = read("../app/board-theme-store.tsx");

test("free defaults and nine rentable themes appear in the catalog and migration", () => {
  const entries = [...catalog.matchAll(/\{ id: "([a-z-]+)", name: "([^"]+)", group: "(included|theme|color)"/g)];
  assert.equal(entries.filter(entry => entry[3] === "theme").length, 4);
  assert.equal(entries.filter(entry => entry[3] === "color").length, 5);
  for (const id of ["slate", "classic", "wood", "bubble-gum", "jungle"])
    assert.equal(entries.find(entry => entry[1] === id)?.[3], "included");
  for (const [, id, name, group] of entries.filter(entry => entry[3] !== "included"))
    assert.ok(sql.includes(`('${id}','${name}')`), `${group} ${id} missing from rental catalog`);
});

test("one week, three weeks and one month have matching server and shop prices", () => {
  assert.match(catalog, /\{ 7: 28, 21: 78, 30: 98 \}/);
  assert.match(sql, /if p_days not in \(7,21,30\)/);
  assert.match(sql, /case p_days when 7 then 28 when 21 then 78 else 98 end/);
  assert.match(shop, /BOARD_THEME_PRICES\[days\]/);
});

test("expired rentals fall back to included colors and purchases are idempotent", () => {
  assert.match(api, /action==='board-theme-state'/);
  assert.match(api, /\.gt\('expires_at',new Date\(\)\.toISOString\(\)\)/);
  assert.match(api, /active=\['slate','classic','wood','meta-blue','bubble-gum','jungle'\]/);
  assert.match(api, /action==='activate-board-theme'/);
  assert.match(api, /action==='rent-board-theme'/);
  assert.match(sql, /on conflict\(id\) do nothing/);
  assert.match(sql, /greatest\(now\(\),cb_board_rentals\.expires_at\)/);
  assert.match(board, /BoardThemePreview/);
});
