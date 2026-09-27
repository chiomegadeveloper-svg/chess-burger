import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { legalStudentMove } from "../api/_classroom-movement.ts";

test("locked student board accepts exactly one legal White move",()=>{
  const start=new Chess();
  const afterWhite=new Chess(start.fen());afterWhite.move("e4");
  assert.equal(legalStudentMove("start",afterWhite.fen()),true);
  const twoMoves=new Chess(afterWhite.fen());twoMoves.move("e5");
  assert.equal(legalStudentMove("start",twoMoves.fen()),false);
  assert.equal(legalStudentMove(afterWhite.fen(),twoMoves.fen()),false);
  assert.equal(legalStudentMove("start","8/8/8/8/8/8/8/8 w - - 0 1"),false);
});

test("locked student board accepts the next White move after teacher plays Black",()=>{
  const before=new Chess();before.move("e4");before.move("e5");
  const after=new Chess(before.fen());after.move("Nf3");
  assert.equal(legalStudentMove(before.fen(),after.fen()),true);
});
