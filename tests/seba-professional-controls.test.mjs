import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/classroom-workshop.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/classroom-workshop.css", import.meta.url), "utf8");

test("SEba teacher console uses named professional control groups", () => {
  assert.match(source, /className="tool-group move-draw-tools"/);
  assert.match(source, /className="tool-group lesson-tools"/);
  assert.match(source, /className="tool-group ai-reader-tools"/);
});

test("teacher control cards and buttons fill their responsive grid", () => {
  assert.match(css, /\.teacher-toolbar \{[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.teacher-toolbar > \.tool-group \{[\s\S]*?align-self: stretch;[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(css, /\.teacher-toolbar \.tool-group button \{[\s\S]*?width: 100%;[\s\S]*?min-height: 44px;[\s\S]*?height: 100%/);
});

test("teacher console collapses cleanly for tablet and mobile", () => {
  assert.match(css, /@media \(max-width: 1500px\)[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test("teacher actions are accessible icon-first controls with hover labels", () => {
  assert.match(source, /aria-label="Hand" title="Hand"/);
  assert.match(source, /className="tool-button-label">Activity Log/);
  assert.match(source, /className="tool-color-dot red"/);
  assert.match(css, /\.teacher-toolbar \.tool-button-label \{[\s\S]*?max-width: 0;[\s\S]*?opacity: 0/);
  assert.match(css, /button:hover \.tool-button-label,[\s\S]*?button:focus-visible \.tool-button-label/);
});

test("top-right classroom actions are compact icon controls with tooltips", () => {
  assert.match(source, /className="seba-cbc-button icon-action"[\s\S]*?data-tooltip=/);
  assert.match(source, /className="workshop-stat icon-action"[\s\S]*?data-tooltip=/);
  assert.match(css, /\.workshop-actions > \.icon-action,[\s\S]*?width: 42px;[\s\S]*?height: 42px/);
  assert.match(css, /\.workshop-actions \[data-tooltip\]::after/);
});
