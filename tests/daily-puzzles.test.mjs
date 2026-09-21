import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { DAILY_PUZZLES } from "../app/puzzle-data.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const puzzleUi = readFileSync(new URL("../app/puzzles.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/0028_daily_puzzles.sql", import.meta.url), "utf8");

test("Match Lobby exposes a Gold-earning Puzzle Quest", () => {
  assert.match(page, /Puzzle Quest/);
  assert.match(page, /setTab\("puzzles"\)/);
  assert.match(page, /<Puzzles/);
});

test("campaign contains 100 distinct real-game Lichess positions", () => {
  assert.equal(DAILY_PUZZLES.length, 100);
  assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.id)).size, 100);
  assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.sourceId)).size, 100);
  assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.fen)).size, 100);
  assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.moves.join(" "))).size, 100);
  assert.deepEqual([...new Set(DAILY_PUZZLES.map(puzzle => puzzle.chapter))], [1,2,3,4,5,6,7,8,9,10]);
  for (const puzzle of DAILY_PUZZLES) {
    const game = new Chess(puzzle.fen);
    assert.ok(puzzle.sourceUrl.startsWith("https://lichess.org/"));
    assert.ok(puzzle.moves.length >= 3, `${puzzle.id} must contain a full tactical line`);
    for (const uci of puzzle.moves) {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
      assert.ok(move, `${puzzle.id} contains illegal move ${uci}`);
    }
  }
});

test("puzzle Gold is server validated and idempotent", () => {
  assert.match(api, /proof!==puzzle\.moves\.join\(' '\)/);
  assert.match(api, /Complete the previous puzzle first/);
  assert.match(sql, /primary key\(user_id,puzzle_day,puzzle_id\)/);
  assert.match(sql, /v_delta:=2/);
  assert.match(sql, /v_delta:=v_delta\+5/);
  assert.match(sql, /on conflict do nothing/);
});

test("puzzle UI plays forced replies and requires the complete line",()=>{
  assert.match(puzzleUi,/Coach Patty is playing the forced reply/);
  assert.match(puzzleUi,/setStep\(opponentStep\+1\)/);
  assert.match(puzzleUi,/proof: puzzle\.moves\.join\(" "\)/);
  assert.match(puzzleUi,/Lichess CC0 source/);
});

test("Coach Patty prefers a friendly female English device voice", () => {
  assert.match(puzzleUi, /female\|samantha\|zira\|aria\|jenny/);
  assert.match(puzzleUi, /en-PH/);
  assert.match(puzzleUi, /utterance\.pitch=1\.12/);
});

test("every correct puzzle solve displays a popup notification", () => {
  assert.match(puzzleUi, /toast\.success\(`Puzzle \$\{puzzle\.number\} solved/);
  assert.match(puzzleUi, /\+5 Gold chapter bonus/);
  assert.match(puzzleUi, /Practice replay/);
});
