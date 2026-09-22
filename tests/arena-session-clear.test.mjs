import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const arenaApi = await readFile(new URL("../api/grand-arena.ts", import.meta.url), "utf8");
const arenaPage = await readFile(new URL("../app/grand-arena.tsx", import.meta.url), "utf8");
const bagPage = await readFile(new URL("../app/shop.tsx", import.meta.url), "utf8");
const bagCss = await readFile(new URL("../app/rpg-bag.css", import.meta.url), "utf8");

test("finalized Arena sessions return an empty live leaderboard", () => {
  assert.match(arenaApi, /Boolean\(session\.champion_id\)\|\|Date\.now\(\)>=Date\.parse\(session\.ends_at\)/);
  assert.match(arenaApi, /sessionFinalized\?\{data:\[\],error:null\}/);
  assert.match(arenaApi, /session_finalized:sessionFinalized/);
  assert.match(arenaPage, /Final standings have been archived/);
});

test("My Bag uses dedicated enlarged CBG artwork", () => {
  assert.match(bagPage, /className="bag-cbg-wallet-icon"/);
  assert.match(bagPage, /className="bag-cbg-card-icon"/);
  assert.match(bagCss, /\.rpg-gold-art>\.bag-cbg-card-icon/);
  assert.match(bagCss, /max-width:132px/);
});
