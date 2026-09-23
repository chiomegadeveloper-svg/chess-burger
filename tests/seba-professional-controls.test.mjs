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

test("teacher controls form one compact icon row", () => {
  assert.match(css, /\/\* Compact single-row teacher toolbar\. \*\/[\s\S]*?\.teacher-toolbar-shell > \.teacher-toolbar \{[\s\S]*?display: flex;[\s\S]*?align-items: center/);
  assert.match(css, /\.teacher-toolbar > \.tool-group,[\s\S]*?grid-template-rows: auto 38px/);
  assert.match(css, /\.teacher-toolbar \.tool-group button,[\s\S]*?flex: 0 0 38px;[\s\S]*?width: 38px;[\s\S]*?height: 38px/);
});

test("teacher toolbar stays one row and scrolls on smaller screens", () => {
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?flex-wrap: nowrap;[\s\S]*?overflow-x: auto/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?display: flex;[\s\S]*?grid-template-columns: none/);
});

test("teacher actions are accessible icon-first controls with hover labels", () => {
  assert.match(source, /aria-label="Hand" title="Hand"/);
  assert.match(source, /className="tool-button-label">Activity Log/);
  assert.match(source, /className="tool-color-dot red"/);
  assert.match(css, /\/\* Compact single-row teacher toolbar\. \*\/[\s\S]*?\.teacher-toolbar \.tool-button-label \{[\s\S]*?position: absolute;[\s\S]*?opacity: 0/);
  assert.match(css, /button:hover \.tool-button-label,[\s\S]*?button:focus-visible \.tool-button-label/);
});

test("top-right classroom actions are compact icon controls with tooltips", () => {
  assert.match(source, /className="seba-cbc-button icon-action"[\s\S]*?data-tooltip=/);
  assert.match(source, /seba-cbc-button icon-action[\s\S]*?cbc-token\.webp/);
  assert.match(source, /className="workshop-stat icon-action"[\s\S]*?data-tooltip=/);
  assert.match(css, /\.workshop-actions > \.icon-action,[\s\S]*?width: 42px;[\s\S]*?height: 42px/);
  assert.match(css, /\.workshop-actions \[data-tooltip\]::after/);
});
