import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workshop=readFileSync(new URL("../app/classroom-workshop.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../app/classroom-workshop.css",import.meta.url),"utf8");

test("SEba teacher tools stay visible without an auto-hide toggle",()=>{
  const oneRow=styles.slice(styles.lastIndexOf("/* Authoritative one-row SEba toolbar"));
  assert.match(workshop,/className="teacher-toolbar-shell"/);
  assert.match(oneRow,/\.teacher-toolbar-shell > \.teacher-toolbar \{\s*display: flex;/);
  assert.match(oneRow,/overflow-x: auto;\s*overflow-y: hidden;/);
  assert.doesNotMatch(workshop,/toolsOpen|Auto-hide Tools|onPointerLeave=.*setToolsOpen/);
  assert.doesNotMatch(oneRow,/\.teacher-toolbar-shell\.open > \.teacher-toolbar|\.teacher-toolbar-shell:hover > \.teacher-toolbar/);
});

test("SEba board can maximize and restore without dropping setup tools",()=>{
  assert.match(workshop,/boardMaximized/);
  assert.match(workshop,/preMaximizeZoomRef\.current=boardZoom;setBoardZoom\(100\);setBoardMaximized\(true\)/);
  assert.match(workshop,/setBoardMaximized\(false\);if\(preMaximizeZoomRef\.current!==null\)\{changeBoardZoom\(preMaximizeZoomRef\.current\)/);
  assert.doesNotMatch(workshop,/requestFullscreen|exitFullscreen|fullscreenchange/);
  assert.match(workshop,/Maximize Board/);
  assert.match(workshop,/Restore Layout/);
  assert.match(workshop,/aria-pressed=\{boardMaximized\}/);
  assert.match(workshop,/board-piece-layout/);
  assert.match(workshop,/>Reset Board/);
  assert.match(styles,/\.board-maximized \.student-monitor\{display:none\}/);
  assert.match(styles,/\.classroom-workshop\.board-maximized\{position:fixed/);
  assert.match(styles,/\.board-maximized \.board-piece-layout \{\s*max-width: min\(100%, calc\(100dvh \+ 36px\), 1200px\)/);
});
