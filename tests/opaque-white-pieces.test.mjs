import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matchBoard = readFileSync(new URL("../app/match-board.tsx", import.meta.url), "utf8");
const offline = readFileSync(new URL("../app/offline.tsx", import.meta.url), "utf8");

test("white chess pieces use solid silhouettes instead of hollow glyphs", () => {
  for (const source of [matchBoard, offline]) {
    for (const hollow of ["♔", "♕", "♖", "♗", "♘", "♙"]) {
      assert.doesNotMatch(source, new RegExp(hollow));
    }
  }

  for (const solid of ["♚", "♛", "♜", "♝", "♞", "♟"]) {
    assert.match(matchBoard, new RegExp(`w[a-z]: "${solid}"`));
  }
});
