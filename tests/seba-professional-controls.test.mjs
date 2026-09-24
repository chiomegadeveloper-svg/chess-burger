import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/classroom-workshop.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/classroom-workshop.css", import.meta.url), "utf8");
const oneRowMarker = "/* Authoritative one-row SEba toolbar: overrides the old six-card console above. */";
const finalToolbarCss = css.slice(css.lastIndexOf(oneRowMarker));

test("SEba teacher console uses named professional control groups", () => {
  assert.match(source, /className="tool-group move-draw-tools"/);
  assert.match(source, /className="tool-group lesson-tools"/);
  assert.match(source, /className="tool-group ai-reader-tools"/);
});

test("teacher controls form one compact icon row", () => {
  assert.ok(css.lastIndexOf(oneRowMarker) > css.lastIndexOf("/* Polished responsive SEba control console. */"), "one-row rules must be the final layout override");
  assert.match(finalToolbarCss, /\.teacher-toolbar-shell \{\s*display: flex;/);
  assert.match(finalToolbarCss, /\.teacher-toolbar-shell > \.teacher-toolbar \{\s*display: flex;[\s\S]*?flex: 1 1 auto;[\s\S]*?flex-wrap: nowrap/);
  assert.match(finalToolbarCss, /\.teacher-toolbar > \.tool-group,[\s\S]*?grid-template-rows: auto 36px/);
  assert.match(finalToolbarCss, /\.teacher-toolbar \.tool-group button \{[\s\S]*?flex: 0 0 36px;[\s\S]*?width: 36px;[\s\S]*?height: 36px/);
});

test("teacher toolbar stays one row and scrolls on smaller screens", () => {
  assert.match(finalToolbarCss, /\.teacher-toolbar-shell > \.teacher-toolbar \{[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: hidden/);
  assert.match(finalToolbarCss, /\.teacher-toolbar \.tool-group > div:not\(\.piece-palette\):not\(\.ai-move-line\) \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: nowrap/);
  assert.match(finalToolbarCss, /@media \(max-width: 700px\)[\s\S]*?\.teacher-toolbar-handle button span \{\s*display: none;/);
});

test("teacher actions are accessible icon-first controls with hover labels", () => {
  assert.match(source, /aria-label="Hand" title="Hand"/);
  assert.match(source, /className="tool-button-label">Activity Log/);
  assert.match(source, /className="tool-color-dot red"/);
  assert.match(finalToolbarCss, /\.teacher-toolbar \.tool-button-label \{\s*display: none;/);
  assert.match(source, /aria-label="Clear board" title="Clear board"/);
  assert.match(source, /<aside id="seba-teacher-tools" className="teacher-toolbar" aria-label="Teacher tools">/);
  assert.match(source, /<div className="ai-reader-insights" aria-live="polite">/);
});

test("top-right classroom actions are compact icon controls with tooltips", () => {
  assert.match(source, /className="seba-cbc-button icon-action"[\s\S]*?data-tooltip=/);
  assert.match(source, /seba-cbc-button icon-action[\s\S]*?cbc-token\.webp/);
  assert.match(source, /className="workshop-stat icon-action"[\s\S]*?data-tooltip=/);
  assert.match(css, /\.workshop-actions > \.icon-action,[\s\S]*?width: 42px;[\s\S]*?height: 42px/);
  assert.match(css, /\.workshop-actions \[data-tooltip\]::after/);
  assert.match(css, /Keep header tooltips above the sticky teaching rail[\s\S]*?\.workshop-topbar \{\s*z-index: 50;\s*overflow: visible;/);
  assert.match(css, /Keep header tooltips above the sticky teaching rail[\s\S]*?\.workshop-actions \.seba-cbc-button\.icon-action img \{[\s\S]*?width: 36px;\s*height: 36px;/);
});
