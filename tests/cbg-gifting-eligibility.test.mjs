import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("CBG gifting requires Player Level 3 and a 188 CBG balance", async () => {
  const [sql, api, shop] = await Promise.all([
    read("supabase/0083_cbg_gifting_eligibility.sql"),
    read("api/arena.ts"),
    read("app/shop.tsx"),
  ]);
  assert.match(sql, /coalesce\(v_sender_cbr,0\)<177/i);
  assert.match(sql, /v_sender_gold<188/i);
  assert.match(api, /account\.profile\.cbr\?\?0\)<177/);
  assert.match(api, /account\.profile\.gold_points\?\?0\)<188/);
  assert.match(shop, /state\.cbr<177\|\|state\.gold<188/);
});

test("Chess Math uses the pawn and abacus mascot asset", async () => {
  const [classroom, chessMath, asset] = await Promise.all([
    read("app/classroom.tsx"),
    read("app/chess-math.tsx"),
    stat(new URL("../public/classroom/chess-math-mascot.webp", import.meta.url)),
  ]);
  assert.match(classroom, /chess-math-mascot\.webp/);
  assert.match(chessMath, /chess-math-mascot\.webp/);
  assert.ok(asset.size > 50_000);
});
