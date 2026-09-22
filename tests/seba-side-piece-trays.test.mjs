import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workshop=fs.readFileSync('app/classroom-workshop.tsx','utf8');
const styles=fs.readFileSync('app/classroom-workshop.css','utf8');

test('SEba adjustable pieces sit in responsive trays beside teacher boards',()=>{
  assert.match(workshop,/className="board-piece-layout"/);
  assert.match(workshop,/className="piece-side-tray white-tray"/);
  assert.match(workshop,/className="piece-side-tray black-tray"/);
  assert.match(workshop,/withPieceTrays\(<TeachingBoard/);
  assert.doesNotMatch(workshop,/className="piece-palette"/);
  assert.match(styles,/\.board-piece-layout\{display:grid;grid-template-columns:/);
  assert.match(styles,/@media\(max-width:420px\)\{\.board-piece-layout/);
});

test('SEba Reset Board restores the standard chess position',()=>{
  assert.match(workshop,/>Reset Board<\/button>/);
  assert.match(workshop,/updateMaster\(\{fen:"start",annotations:\[\]\}\)/);
  assert.match(workshop,/setPlacementPiece\(null\);setTool\("hand"\)/);
});
