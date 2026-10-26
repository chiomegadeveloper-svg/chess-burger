import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import E from '../api/_rpg/src/elements.js';
import C from '../api/_rpg/src/inventory-core.js';
import * as R from '../api/_rpg/core.mjs';
import {saveInventory,makeHero} from '../api/_rpg/store.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {database} from './helpers/rpg-db.mjs';
const actor=(heroId='rogue')=>({...R.monster('erpack',10),heroId,name:'Test',stats:[500,80,80,0,500,10],hp:500,maxHp:500,mp:500,maxMp:500,ap:500,maxAp:500,active:['ember','basic','thorn_burst','tidal_orb']});
test('all 36 matchups follow the diagram: two strengths, two weaknesses, two neutral per element',()=>{
 const expected={earth:['thunder','toxic'],thunder:['water','air'],air:['earth','fire'],fire:['thunder','toxic'],toxic:['water','air'],water:['earth','fire']};
 for(const a of E.ids){let strong=0,weak=0,normal=0;for(const d of E.ids){const n=E.matchup(a,d),want=expected[a].includes(d)?1.25:expected[d].includes(a)?.8:1;assert.equal(n,want);if(n>1)strong++;else if(n<1)weak++;else normal++;}assert.deepEqual([strong,weak,normal],[2,2,2]);assert.equal(E.matchup('neutral',a),1);assert.equal(E.matchup(a,'neutral'),1);}
});
test('all heroes, monsters, bosses and 30 skills have the approved affinities',()=>{
 for(const id of ['rogue','queen','mage','tank','crusader','assassin','archer','theft',...R.MONSTERS.map(m=>m.id)])assert.ok(E.ids.includes(E.affinity(id)),id);
 assert.equal(E.affinity('mhakiduk'),'toxic');assert.equal(E.affinity('draguu'),'water');
 assert.equal(Object.keys(R.SKILLS).length,30);for(const s of Object.values(R.SKILLS))assert.ok([...E.ids,'neutral'].includes(E.skillElement(s)));
 assert.equal(E.skillElement(R.SKILLS.basic),'neutral');assert.equal(E.skillElement(R.SKILLS.thorn_burst),'toxic');assert.equal(E.skillElement(R.SKILLS.frost_lance),'water');
});
test('real attacks, previews, defending and event metadata use identical elemental damage in PvE and PvP',()=>{
 for(const kind of ['monster','pvp'])for(const defender of ['theft','mage','rogue']){
  const a=actor(),d=actor(defender),b=R.createBattle(a,d,kind);b.status='active';a.passives={element_fire_damage:20,magicDamage:5};d.passives={element_fire_resistance:8};d.defending=true;
  const expected=R.damageFor(a,d,R.SKILLS.ember,kind==='monster');assert.equal(R.attack(b,0,'ember'),expected);assert.equal(d.hp,500-expected);assert.equal(b.events[0].element,'fire');assert.equal(b.events[0].effectiveness,E.attackInfo(a,d,R.SKILLS.ember).label);assert.equal(a.mp,500-R.SKILLS.ember.mp);
 }
 const a=actor('rogue'),d=actor('theft');assert.equal(E.attackInfo(a,d,R.SKILLS.ember).multiplier,1.25*1.05);assert.equal(E.attackInfo(a,d,R.SKILLS.basic).multiplier,1);
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('public/rpg/vendor/battle-core.js','utf8'),ctx);assert.equal(ctx.RPGBattleRules.damageFor(a,d,R.SKILLS.ember),R.damageFor(a,d,R.SKILLS.ember));
});
test('new gear rolls optional elemental properties, potions never do; only usable bag items apply and cap at 20%',()=>{
 const state=C.newState('rogue','Tester');state.level=88;let elemental=0,neutral=0;
 for(let i=0;i<100;i++){const roll=C.rollItem(C.itemMap.iron_dagger_v1,1);if(roll.elemental){elemental++;assert.ok(E.ids.includes(roll.elemental.element));assert.equal(roll.elemental.kind,'damage');assert.ok(roll.elemental.value>=2&&roll.elemental.value<=8);}else neutral++;}
 assert.ok(elemental&&neutral);
 for(const id of ['health_potion','mana_potion'])assert.equal(C.rollItem(C.itemMap[id],10).elemental,undefined);
 for(let i=0;i<5;i++)state.items.push({uid:String(i),defId:'iron_dagger_v1',where:'bag',requiredLevel:1,elemental:{element:'fire',kind:'damage',value:8}});
 state.items.push({defId:'armor_v1',where:'stash',elemental:{element:'water',kind:'resistance',value:8}},{defId:'armor_v1',where:'bag',requiredLevel:89,elemental:{element:'water',kind:'resistance',value:8}});
 assert.equal(C.passives(state).element_fire_damage,20);assert.equal(C.passives(state).element_water_resistance,undefined);
 state.items.push({defId:'armor_v1',where:'bag',requiredLevel:1,elemental:{element:'fire',kind:'resistance',value:8}});assert.equal(C.passives(state).element_fire_resistance,8);
});
test('old items stay neutral; elemental attributes survive moves but cannot be forged in saves',()=>{
 const doc=makeHero({heroId:'rogue',name:'Tester',skill:'ember'}),def=C.itemMap.iron_dagger_v1,item={uid:'owned',defId:def.id,rotation:0,rotated:false,...C.rollItem(def,1,()=>0,{rarity:'common',iLvl:1,requiredLevel:1})};
 delete item.elemental;assert.ok(C.place(doc.state,item,'stash',0,0));assert.ok(C.validState(doc.state,'rogue'));assert.deepEqual(C.passives(doc.state),{});
 const next=structuredClone(doc.state);next.items[0].elemental={element:'fire',kind:'damage',value:8};assert.throws(()=>saveInventory(doc,next),/attributes cannot be changed/);
 doc.state.items[0].elemental={element:'water',kind:'damage',value:4};const moved=structuredClone(doc.state);assert.ok(C.place(moved,moved.items[0],'bag',0,0));saveInventory(doc,moved);assert.equal(C.passives(doc.state).element_water_damage,4);
 const invalid=structuredClone(doc.state);invalid.items[0].elemental.value=80;assert.equal(C.validState(invalid,'rogue'),false);
});
test('server registration and load preserve hero identity and old neutral inventories',async()=>{
 const db=database();await gameRequest(db,'elements-user','POST',{action:'register',heroId:'theft',name:'Nyx',skill:'thorn_burst'});
 const loaded=await gameRequest(db,'elements-user','GET',{action:'init'});assert.equal(loaded.game.heroId,'theft');assert.equal(E.affinity(loaded.game.heroId),'toxic');assert.ok(loaded.game.items.every(i=>!i.elemental));
});
