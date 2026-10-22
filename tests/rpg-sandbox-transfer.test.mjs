import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=JSON.parse(readFileSync('rpg/sandbox-source.json','utf8'));
test('sandbox battle template, styling, original heroes and all skill artwork are transferred byte-for-byte',()=>{
 for(const [path,expected] of Object.entries(source.sha256)){
  const local=path.startsWith('assets/')?'public/rpg/'+path:'rpg/'+path;
  assert.equal(createHash('sha256').update(readFileSync(local)).digest('hex'),expected,local);
 }
});
test('original ct.js animation loader resolves all five sheets under the live RPG base path',()=>{
 const runtime=readFileSync('public/rpg/vendor/ctjs-skill-fx.js','utf8');
 assert.ok(!runtime.includes('/assets/skills/sheets/'),'no sandbox-root URLs in live animation bundle');
 assert.ok(runtime.includes('assets/skills/sheets/'));
 for(const category of ['physical','elemental','wind','fire','lightning']){
  const url=new URL(`assets/skills/sheets/${category}.webp`,'https://chessburger.site/rpg/');
  assert.equal(url.pathname,`/rpg/assets/skills/sheets/${category}.webp`);
  assert.ok(readFileSync('public'+url.pathname).length>0);
 }
});

test('canonical hero asset exports are preserved',()=>{
 const assets=JSON.parse(readFileSync('rpg/original-hero-assets.json','utf8'));
 assert.equal(Object.keys(assets).length,16);
 for(const [path,expected] of Object.entries(assets))assert.equal(createHash('sha256').update(readFileSync('public/rpg/'+path)).digest('hex'),expected,path);
});
