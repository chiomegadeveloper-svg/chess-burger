import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as R from '../api/_rpg/core.mjs';

const hero=(level=30,id='rogue')=>({...R.profile({heroId:id,name:'Hero',level,stats:[1000,100,100,4,1000,100],active:['basic','ember',null,null]}),stats:[1000,100,100,0,1000,100]});
const monster=(level=30,id='erpack')=>({...R.monster(id,level),stats:[1000,100,100,0,1000,100],hp:1000,maxHp:1000,active:['basic','stone_shard']});
const cases=[[-20,1],[-3,1],[-1,1],[0,1],[1,1],[2,1],[3,1.2],[5,1.2],[6,1.4],[10,1.4],[11,1.6],[19,1.6],[20,1.6],[21,1.8],[40,1.8]];

test('monster damage tiers use the signed level gap and resolve every boundary, including 20 versus 21',()=>{
 const target=hero();
 for(const [gap,factor]of cases){
  assert.equal(R.damageFor(monster(30+gap),target,R.SKILLS.basic),Math.round(40*factor),`gap ${gap}`);
 }
});

test('level-gap damage applies to physical, magic and boss attacks after equipment/elements, before defending',()=>{
 for(const id of ['erpack','pektu','draguu'])for(const skill of ['basic','ember']){
  const a=monster(41,id),d=hero();a.passives={physicalDamage:8,magicDamage:8};d.passives={damageReduction:8,element_fire_resistance:8};
  const normal=R.damageFor({...a,level:d.level},d,R.SKILLS[skill]);
  assert.equal(R.damageFor(a,d,R.SKILLS[skill]),Math.round(normal*1.6));
  d.defending=true;assert.equal(R.damageFor(a,d,R.SKILLS[skill]),Math.ceil(Math.round(normal*1.6)/2));
 }
});

test('hero attacks, PvP and monster-versus-monster damage receive no monster gap bonus',()=>{
 assert.equal(R.damageFor(hero(60),hero(30,'assassin'),R.SKILLS.basic),40);
 assert.equal(R.damageFor(hero(60),monster(30),R.SKILLS.basic,true),40);
 assert.equal(R.damageFor(monster(60),monster(30,'chaanack'),R.SKILLS.basic),40);
 const a=hero(60);a.passives={monsterDamage:8};assert.equal(R.damageFor(a,monster(30),R.SKILLS.basic,true),43);
});

test('AI lethal selection, hit events and reports use the tiered damage without changing costs or recovery',()=>{
 const a=monster(36),d=hero();d.hp=50;a.stats[2]=1;
 const b=R.createBattle(d,a,'monster'),ap=a.ap,mp=a.mp;
 R.finishTurn(b);
 assert.equal(b.status,'finished');assert.equal(b.winner,1);
 assert.equal(b.events[0].skill,'basic');assert.equal(b.events[0].damage,56);assert.equal(b.events[0].hpAfter,0);
 assert.equal(b.report.actors[1].damage,50);assert.equal(a.ap,ap-4);assert.equal(a.mp,mp-2);
 const c=R.createBattle(hero(),monster(41),'monster');c.turn=1;c.actors[1].ap=0;c.actors[1].mp=0;
 R.defend(c,1);assert.equal(c.actors[1].ap,8);assert.equal(c.actors[1].mp,8);
});

test('shipped browser damage previews agree with server calculations at every gap boundary',()=>{
 const context={};vm.runInNewContext(fs.readFileSync('public/rpg/vendor/battle-core.js','utf8'),context);
 for(const [gap]of cases)for(const skill of ['basic','ember'])for(const defending of [false,true]){
  const a=monster(30+gap),d=hero();d.defending=defending;
  assert.equal(context.RPGBattleRules.damageFor(a,d,R.SKILLS[skill]),R.damageFor(a,d,R.SKILLS[skill]));
 }
});
