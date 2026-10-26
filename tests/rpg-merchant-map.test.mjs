import test from 'node:test';import assert from 'node:assert/strict';import {sellPrice,merchantVisit} from '../api/_rpg/merchant.mjs';import {merchantPins} from '../api/_rpg/merchant-pins.mjs';import {chestRequest,cityKey} from '../api/_rpg/chests.mjs';import {gameRequest} from '../api/_rpg/service.mjs';import {database} from './helpers/rpg-db.mjs';import {read} from '../api/_rpg/store.mjs';
const city={id:'town:a',name:'Town A',bounds:[11,11.02,124,124.02]},other={id:'town:b',name:'Town B',bounds:[11.02,11.04,124,124.02]};
const roads=c=>Array.from({length:40},(_,i)=>({lat:c.bounds[0]+.001+Math.floor(i/8)*.003,lng:124.001+i%8*.002}));
const gps=(p,now)=>({...p,accuracy:5,time:now});
test('specified sell tiers have stable whole CBG base ranges plus floor(2% of hero level)',()=>{
 for(const level of [1,49,50,88])for(const rarity of ['common','uncommon','rare','mythic']){const values=new Set();for(let i=0;i<100;i++){const item={uid:String(i),rarity,defId:'iron_sword_v1'},price=sellPrice(item,level),bonus=Math.floor(level*.02),min=['common','uncommon'].includes(rarity)?1:2;assert.ok(Number.isInteger(price)&&price>=min+bonus&&price<=min+2+bonus);assert.equal(price,sellPrice(item,level));values.add(price-bonus);}assert.equal(values.size,3);}
});
test('12 shared merchant pins stay on city roads for the day and use a different layout for another city/day',()=>{
 const record={...city,key:cityKey(city),day:'2026-10-26',roads:roads(city)},pins=merchantPins(record);assert.equal(pins.length,12);assert.equal(new Set(pins.map(p=>p.id)).size,12);assert.equal(new Set(pins.map(p=>`${p.lat}:${p.lng}`)).size,12);assert.ok(pins.every(p=>record.roads.some(r=>r.lat===p.lat&&r.lng===p.lng)));assert.deepEqual(pins,merchantPins(record));assert.notDeepEqual(pins,merchantPins({...record,day:'2026-10-27'}));assert.ok(merchantPins({...record,roads:[...record.roads,{lat:12,lng:125}]}).every(p=>p.lat<11.02));
});
test('city travel invalidates old monsters and merchant visits, then generates encounters for the new town',async()=>{
 const db=database(),now=Date.now(),services={worldOwner:async()=> 'owner',resolveCity:async p=>p.lat>=11.02?other:city,cityRoads:async c=>roads(c),roadPoints:async p=>roads(p.lat>=11.02?other:city),now:()=>now};
 const call=input=>gameRequest(db,'a','POST',input,services);await call({action:'register',heroId:'assassin',name:'Traveller',skill:'punch'});
 const first=await call({action:'chests',gps:gps(roads(city)[0],now)});assert.equal(first.merchants.length,12);const p=first.merchants[0];
 const profile=await read(db,'a');const valid=await merchantVisit(db,'a',profile,{gps:gps(p,now),merchantId:p.id},now,services);assert.equal(valid.id,p.id);await assert.rejects(merchantVisit(db,'a',profile,{merchantId:p.id},now,services),/fresh GPS/);
 const oldMonsters=await call({action:'spawn',gps:gps(p,now)});const nextFix=gps(roads(other)[0],now),next=await call({action:'chests',gps:nextFix});assert.notEqual(next.city.id,first.city.id);assert.ok(next.merchants.every(p=>p.lat>=11.02));assert.ok(next.chests.every(p=>p.lat>=11.02));assert.equal((await call({action:'init'})).spawnCache,null);
 if(oldMonsters.encounters.length)await assert.rejects(call({action:'select-encounter',target:oldMonsters.encounters[0].id,gps:nextFix}),/previous city/);
 const newMonsters=await call({action:'spawn',gps:nextFix});assert.ok(newMonsters.encounters.length);assert.ok(newMonsters.encounters.every(p=>p.lat>=11.02&&!oldMonsters.encounters.some(o=>o.id===p.id)));
 await assert.rejects(call({action:'merchant',merchantId:p.id,gps:nextFix}),/not in your current city/);
 await assert.rejects(merchantVisit(db,'a',await read(db,'a'),{merchantId:next.merchants[0].id,gps:gps({lat:11.039,lng:124.019},now)},now,services),/within 200/);
});
