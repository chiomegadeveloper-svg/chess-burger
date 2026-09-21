import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/arena.css",import.meta.url),"utf8");
test("Play opens destination selection before Match Lobby",()=>{assert.match(page,/key === "play" \? "play-select" : key/);assert.match(page,/Grand Arena is coming soon/);});
test("selection uses supplied responsive artwork",()=>{assert.ok(existsSync(new URL("../public/play-selection/match-lobby.jpg",import.meta.url)));assert.ok(existsSync(new URL("../public/play-selection/grand-arena.jpg",import.meta.url)));assert.match(css,/\.play-select-grid/);assert.match(css,/@media\(max-width:680px\)/);});
