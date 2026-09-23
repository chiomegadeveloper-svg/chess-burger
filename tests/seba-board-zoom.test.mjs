import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workshop=readFileSync(new URL("../app/classroom-workshop.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/classroom-workshop.css",import.meta.url),"utf8");

test("teacher can zoom the SEba board between responsive limits",()=>{
  assert.match(workshop,/boardZoom,setBoardZoom/);
  assert.match(workshop,/min="60" max="100" step="5"/);
  assert.match(workshop,/Zoom board in/);
  assert.match(workshop,/Zoom board out/);
  assert.match(workshop,/seba-board-zoom/);
  assert.match(workshop,/changeBoardZoom\(100\)/);
});

test("board and zoom controls adapt to desktop and tablet height",()=>{
  assert.match(styles,/max-width:min\(820px,calc\(100dvh - 40px\)\)/);
  assert.match(styles,/\.board-zoom-control\{position:absolute/);
  assert.match(styles,/@media\(max-width:1100px\)\{\.board-piece-layout/);
  assert.match(styles,/writing-mode:horizontal-tb/);
});
