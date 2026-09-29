import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const account = read("../app/account.tsx");
const styles = read("../app/vanguard-card.css");

test("Vanguard card uses a fixed blank frame with live player identity and stats", () => {
  assert.equal(existsSync(new URL("../public/player-card/vanguard-template.webp", import.meta.url)), true);
  assert.match(account, /vanguard-template\.webp/);
  assert.match(account, /profile\.display_name/);
  assert.match(account, /profile\.username/);
  assert.match(account, /flag\(profile\.country_code\)/);
  assert.match(account, /profile\.gold_points\.toLocaleString\(\)/);
  assert.match(account, /cardSummary\?\.cbc/);
  assert.match(account, /profile\.cbr\.toLocaleString\(\)/);
  assert.match(account, /cardSummary\?\.tickets/);
  assert.match(account, /CardEmblemCollection selected=\{profile\.featured_badges\}/);
});

test("level and guild emblems are live overlays without shield artwork", () => {
  assert.match(account, /\/levels\/level-/);
  assert.match(account, /cardSummary\?\.guild_logo_url/);
  assert.match(styles, /\.card-level-insignia\{left:/);
  assert.match(styles, /\.card-guild-insignia\{left:/);
  assert.match(styles, /background:radial-gradient\(circle/);
});
