import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workshop=fs.readFileSync("app/classroom-workshop.tsx","utf8");
const classroomUi=fs.readFileSync("app/classroom.tsx","utf8");
const api=fs.readFileSync("api/classroom.ts","utf8");

test("teacher can assign a selected puzzle to every active student",()=>{
  assert.match(workshop,/Assign to Students/);
  assert.match(workshop,/kind:"assign-puzzle"/);
  assert.match(workshop,/event:"student-board"/);
  assert.match(api,/kind==="assign-puzzle"/);
  assert.match(api,/Only the teacher can assign puzzles/);
  assert.match(api,/cb_classroom_student_boards/);
  assert.match(api,/upsert\(assignments/);
});

test("student can permanently quit a classroom from lobby or workshop",()=>{
  assert.match(classroomUi,/Quit Session/);
  assert.match(workshop,/Quit Session/);
  assert.match(workshop,/event:"student-left"/);
  assert.match(api,/action==="quit"/);
  assert.match(api,/cb_classroom_enrollments/);
  assert.match(api,/\.delete\(\)\.eq\("room_id",roomId\)\.eq\("student_id",userId\)/);
});
