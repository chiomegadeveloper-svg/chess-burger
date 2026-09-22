import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workshop=fs.readFileSync("app/classroom-workshop.tsx","utf8");

test("teacher has a local Stockfish board reader for student positions",()=>{
  assert.match(workshop,/stockfish-19-lite-single\.js/);
  assert.match(workshop,/Analyze Student/);
  assert.match(workshop,/AI BEST MOVE/);
  assert.match(workshop,/position fen/);
  assert.match(workshop,/go depth 14/);
  assert.match(workshop,/line\.startsWith\("bestmove /);
  assert.match(workshop,/student\?\.board\.fen\?\?data\.workspace\.fen/);
});
