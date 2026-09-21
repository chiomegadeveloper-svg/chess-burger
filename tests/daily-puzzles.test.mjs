import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { DAILY_PUZZLES } from "../app/puzzle-data.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/0028_daily_puzzles.sql", import.meta.url), "utf8");

test("Match Lobby exposes a Gold-earning Puzzle Quest", () => {
  assert.match(page, /Puzzle Quest/);
  assert.match(page, /setTab\("puzzles"\)/);
  assert.match(page, /<Puzzles/);
});

test("daily pack contains ten legal checkmate solutions", () => {
  assert.equal(DAILY_PUZZLES.length, 10);
  assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.id)).size, 10);
  for (const puzzle of DAILY_PUZZLES) {
    const game = new Chess(puzzle.fen);
    const move = game.move({ from: puzzle.solution.slice(0, 2), to: puzzle.solution.slice(2, 4), promotion: puzzle.solution.slice(4) || "q" });
    assert.ok(move, `${puzzle.id} must have a legal solution`);
    assert.ok(game.isCheckmate(), `${puzzle.id} must end in checkmate`);
  }
});

test("puzzle Gold is server validated and idempotent", () => {
  assert.match(api, /move!==puzzle\.solution/);
  assert.match(api, /Complete the previous puzzle first/);
  assert.match(sql, /primary key\(user_id,puzzle_day,puzzle_id\)/);
  assert.match(sql, /v_delta:=2/);
  assert.match(sql, /v_delta:=v_delta\+5/);
  assert.match(sql, /on conflict do nothing/);
});
