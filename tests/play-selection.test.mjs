import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/arena.css",import.meta.url),"utf8");
test("Play shortcuts open destination selection before Match Lobby",()=>{assert.match(page,/key === "play" \? "play-select" : key/);assert.match(page,/finishWelcome\("play-select"\)/);assert.match(page,/Grand Arena is coming soon/);});
test("selection uses optimized responsive WebP artwork",()=>{for(const name of ["match-lobby.webp","grand-arena.webp"]){const file=new URL(`../public/play-selection/${name}`,import.meta.url);assert.ok(existsSync(file));assert.ok(statSync(file).size<=600*1024);}assert.match(css,/\.play-select-grid/);assert.match(css,/@media\(max-width:680px\)/);});
