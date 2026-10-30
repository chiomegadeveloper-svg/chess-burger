import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Layout from '../api/_rpg/src/encounter-layout.js';
import P from '../api/_rpg/src/progression.js';
import * as R from '../api/_rpg/core.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {database} from './helpers/rpg-db.mjs';

test('all levels from hero minus one through plus thirty are eligible, bounded to 1–88 without cap pileups',()=>{
 for(const level of [1,6,10,58,68,80,88]){
  const min=Math.max(1,level-1),max=Math.min(88,level+30),span=max-min+1;
  for(let slot=0;slot<span;slot++){
   const values=Layout.levels(level,()=>(slot+.5)/span);
   assert.equal(values.length,16);assert.ok(values.every(n=>n===min+slot));
  }
  assert.ok(Layout.levels(level,()=>0).every(n=>n===min));
  assert.ok(Layout.levels(level,()=>1-Number.EPSILON).every(n=>n===max));
 }
});

test('20% monster growth applies once at each level, with synchronized full resource caps and unchanged hero bases',()=>{
 const hero=R.profile({heroId:'rogue',name:'Hero',level:6,stats:P.baseStats(6),active:['basic',null,null,null]});
 assert.deepEqual(hero.stats,[40,9,9,9,35,9]);assert.equal(hero.maxAp,30);
 assert.deepEqual(R.monster('erpack',6).stats,[48,11,11,11,42,11]);assert.equal(R.monster('erpack',6).maxAp,36);
 assert.deepEqual(R.monster('chaanack',10).stats,[67,16,16,16,56,16]);assert.equal(R.monster('chaanack',10).maxAp,46);
 for(const m of R.MONSTERS)for(let level=1;level<=88;level++){
  const actor=R.monster(m.id,level),base=P.baseStats(level);
  assert.deepEqual(actor.stats,base.map(n=>Math.round(n*1.2)));
  assert.equal(actor.hp,actor.maxHp);assert.equal(actor.hp,actor.stats[0]);
  assert.equal(actor.mp,actor.maxMp);assert.equal(actor.mp,actor.stats[4]);
  assert.equal(actor.ap,actor.maxAp);assert.equal(actor.ap,Math.round(P.maxAp(level)*1.2));
 }
 assert.deepEqual(P.baseStats(6),[40,9,9,9,35,9]);
});

test('server encounters use boosted stats and the shipped browser core agrees with every species',async()=>{
 const context={};vm.runInNewContext(fs.readFileSync('public/rpg/vendor/battle-core.js','utf8'),context);
 for(const m of R.MONSTERS)for(const level of [1,6,30,88]){
  assert.deepEqual(JSON.parse(JSON.stringify(context.RPGBattleRules.monster(m.id,level))),R.monster(m.id,level));
 }
 const db=database(),now=Date.now(),gps={lat:11.26,lng:125,accuracy:5,time:now};
 const call=input=>gameRequest(db,'player','POST',input,{now:()=>now,roadPoints:async()=>[{lat:11.2602,lng:125}]});
 await call({action:'register',heroId:'rogue',name:'Hero',skill:'punch'});
 const batch=await call({action:'spawn',gps});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;
 doc.encounters[0].monsterId='erpack';doc.encounters[0].level=6;
 const {battle}=await call({action:'encounter',target:batch.encounters[0].id,gps});
 assert.deepEqual(battle.actors[1].stats,[48,11,11,11,42,11]);
 assert.equal(battle.actors[1].maxHp,48);assert.equal(battle.actors[1].maxMp,42);assert.equal(battle.actors[1].maxAp,36);
 assert.equal(battle.actors[0].maxHp,20);
});
