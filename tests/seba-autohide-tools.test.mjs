import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workshop=readFileSync(new URL("../app/classroom-workshop.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/classroom-workshop.css",import.meta.url),"utf8");

test("SEba teacher tools auto-hide with hover and button access",()=>{
  assert.match(workshop,/toolsOpen/);
  assert.match(workshop,/teacher-toolbar-shell/);
  assert.match(workshop,/aria-expanded=\{toolsOpen\}/);
  assert.match(styles,/\.teacher-toolbar-shell:hover>\.teacher-toolbar/);
  assert.match(styles,/\.teacher-toolbar-shell\.open>\.teacher-toolbar/);
  assert.match(styles,/max-height:0/);
});

test("SEba board can maximize and restore without dropping setup tools",()=>{
  assert.match(workshop,/boardMaximized/);
  assert.match(workshop,/requestFullscreen/);
  assert.match(workshop,/exitFullscreen/);
  assert.match(workshop,/fullscreenchange/);
  assert.match(workshop,/Maximize Board/);
  assert.match(workshop,/Restore Layout/);
  assert.match(workshop,/aria-pressed=\{boardMaximized\}/);
  assert.match(workshop,/board-piece-layout/);
  assert.match(workshop,/>Reset Board/);
  assert.match(styles,/\.board-maximized \.student-monitor\{display:none\}/);
  assert.match(styles,/\.classroom-workshop\.board-maximized\{position:fixed/);
  assert.match(styles,/\.classroom-workshop\.board-maximized:fullscreen/);
});
