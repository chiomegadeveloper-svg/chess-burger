import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workshop=fs.readFileSync("app/classroom-workshop.tsx","utf8");
const css=fs.readFileSync("app/classroom-workshop.css","utf8");

test("SEba header has professional non-overlapping layout zones",()=>{
  assert.match(workshop,/workshop-session/);
  assert.match(workshop,/workshop-actions/);
  assert.match(workshop,/seba-mark/);
  assert.match(workshop,/CHESS BURGER CLASSROOM/);
  assert.match(css,/grid-template-columns: minmax\(250px, 1fr\) auto minmax\(250px, 1fr\)/);
  const professional=css.slice(css.indexOf("Professional responsive SEba workspace header"));
  assert.doesNotMatch(professional,/position:\s*absolute/);
  assert.doesNotMatch(professional,/-webkit-text-stroke:\s*1px/);
});

test("SEba header stacks cleanly for tablets and phones",()=>{
  assert.match(css,/@media \(max-width: 1180px\)/);
  assert.match(css,/grid-column: 1 \/ -1/);
  assert.match(css,/@media \(max-width: 700px\)/);
  assert.match(css,/grid-template-columns: 1fr/);
  assert.match(css,/\.teacher-toolbar \{\s*position: relative;/);
});
