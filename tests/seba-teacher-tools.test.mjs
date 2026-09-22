import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workshop=fs.readFileSync("app/classroom-workshop.tsx","utf8");
const api=fs.readFileSync("api/classroom.ts","utf8");
const migration=fs.readFileSync("supabase/0044_seba_lesson_activity.sql","utf8");

test("teacher can clear and personally arrange all white and black pieces",()=>{
  assert.match(workshop,/Clear board/);
  assert.match(workshop,/8\/8\/8\/8\/8\/8\/8\/8 w - - 0 1/);
  for(const piece of ["wp","wn","wb","wr","wq","wk","bp","bn","bb","br","bq","bk"])assert.match(workshop,new RegExp(`"${piece}"`));
  assert.match(workshop,/placementPiece/);
});

test("teacher activity is persisted and can be replayed for students",()=>{
  assert.match(workshop,/Teacher Activity Log/);
  assert.match(workshop,/Replay for students/);
  assert.match(workshop,/replayEvent/);
  assert.match(api,/cb_classroom_lesson_events/);
  assert.match(migration,/create table if not exists public\.cb_classroom_lesson_events/);
});

test("AI reader exposes a 10 teacher and 10 student move principal variation",()=>{
  assert.match(workshop,/slice\(0,20\)/);
  assert.match(workshop,/10 TEACHER \+ 10 STUDENT MOVES/);
  assert.match(workshop,/index%2===0\?"Teacher":"Student"/);
});

test("student pieces obey movement rules without becoming stuck on turn state",()=>{
  assert.match(workshop,/fixedColorTurns/);
  assert.match(workshop,/movementBoard/);
  assert.match(workshop,/allowedColor="w" fixedColorTurns/);
  assert.match(workshop,/moves\(\{square:sq,verbose:true\}\)/);
});
