import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workshop=fs.readFileSync("app/classroom-workshop.tsx","utf8");
const css=fs.readFileSync("app/classroom-workshop.css","utf8");

test("teacher hand tool supports pointer and touch drag-and-drop",()=>{
  assert.match(workshop,/setPointerCapture/);
  assert.match(workshop,/data-square=\{sq\}/);
  assert.match(workshop,/document\.elementFromPoint/);
  assert.match(workshop,/onPointerMove=\{dragPiece\}/);
  assert.match(workshop,/onPointerUp=\{dropPiece\}/);
  assert.match(workshop,/freeMove\?cells/);
});

test("held piece follows above the pointer with translucent feedback",()=>{
  assert.match(workshop,/className="held-piece"/);
  assert.match(css,/\.held-piece/);
  assert.match(css,/opacity: \.72/);
  assert.match(css,/translate\(-50%, -115%\)/);
  assert.match(css,/touch-action: none/);
});

test("student session timer and CBC balance use one compact summary",()=>{
  assert.match(workshop,/student-session-summary/);
  assert.match(workshop,/TIME LEFT/);
  assert.match(workshop,/BALANCE/);
  assert.match(css,/grid-template-columns: repeat\(2, minmax\(92px, 1fr\)\)/);
});

test("teacher free-move board hides unused destination dots",()=>{
  assert.match(workshop,/!freeMove&&legal\.includes\(sq\)/);
});

test("SEba Workshop displays and copies the classroom room code",()=>{
  assert.match(workshop,/data\.room\.code/);
  assert.match(workshop,/workshop-room-code/);
  assert.match(workshop,/navigator\.clipboard\.writeText/);
  assert.match(css,/\.workshop-room-code/);
});
