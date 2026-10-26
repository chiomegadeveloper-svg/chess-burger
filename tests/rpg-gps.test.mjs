import test from 'node:test';
import assert from 'node:assert/strict';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
import {database} from './helpers/rpg-db.mjs';
const at={lat:11.26,lng:125};
function fixture(){const db=database();let now=Date.now(),loads=0;const roads=async()=>{loads++;return Array.from({length:20},(_,i)=>({lat:at.lat+(i+1)*.0002,lng:at.lng}));};const call=(input,method='POST',user='a')=>gameRequest(db,user,method,input,{now:()=>now,roadPoints:roads});const gps=(offset=0)=>({...at,lat:at.lat+offset/111195,accuracy:40,time:now});return {db,call,gps,time:n=>now=n,now:()=>now,loads:()=>loads};}
const register=f=>f.call({action:'register',heroId:'rogue',name:'GPS Warrior',skill:'punch'});
test('pinned sets last a full rolling 30 minutes across clock boundaries and movement, and reopen without fetching roads',async()=>{
 const f=fixture();await register(f);const start=Math.floor(f.now()/3600000)*3600000+3590000;f.time(start);
 const first=await f.call({action:'spawn',gps:f.gps()});assert.equal(first.encounters.length,16);assert.equal(first.refreshAt,start+1800000);assert.ok(first.encounters.every(e=>e.expires_at===first.refreshAt));
 f.time(start+1200000);const moved=await f.call({action:'spawn',gps:f.gps(400)});assert.deepEqual(moved.encounters,first.encounters);assert.equal(f.loads(),1);
 const init=await f.call({action:'init'});assert.deepEqual(init.spawnCache.encounters,first.encounters);assert.equal(init.spawnCache.refreshAt,first.refreshAt);
 f.time(first.refreshAt);const next=await f.call({action:'spawn',gps:f.gps()});assert.equal(next.refreshAt,first.refreshAt+1800000);assert.ok(next.encounters.every(e=>!first.encounters.some(old=>old.id===e.id)));assert.equal(f.loads(),1,'valid saved road coordinates avoid a second map request');
});
test('200-meter monster attack boundary is enforced, and forfeits keep monsters while victories remove them once',async()=>{
 const f=fixture();await register(f);const batch=await f.call({action:'spawn',gps:f.gps()}),enemy=batch.encounters[0];
 const fix=meters=>({lat:enemy.lat+meters/111195,lng:enemy.lng,accuracy:40,time:f.now()});
 await assert.rejects(f.call({action:'encounter',target:enemy.id,gps:fix(201)}),e=>e.code==='out_of_range'&&e.distance>200);
 let b=(await f.call({action:'encounter',target:enemy.id,gps:fix(199)})).battle;assert.equal(b.status,'active');assert.equal((await read(f.db,'a')).encounters.find(e=>e.id===enemy.id).consumed,false);
 await f.call({action:'leave'});assert.ok((await f.call({action:'spawn',gps:f.gps()})).encounters.some(e=>e.id===enemy.id));
 b=(await f.call({action:'encounter',target:enemy.id,gps:fix(199)})).battle;
 const row=[...f.db.rows.values()].find(r=>r.item_kind==='rpg_profile');row.metadata.battle.actors[1].hp=1;
 const win=await f.call({action:'attack',skill:'basic',version:b.version});assert.equal(win.defeatedEncounterId,enemy.id);
 assert.ok(!(await f.call({action:'init'})).spawnCache.encounters.some(e=>e.id===enemy.id));assert.equal((await read(f.db,'a')).awards.length,1);
});
test('nearby online players can challenge and accept within 200 meters and are rejected beyond it',async()=>{
 const f=fixture();await register(f);await f.call({action:'register',heroId:'mage',name:'Other Warrior',skill:'punch'},'POST','b');
 for(const [user,offset]of[['a',0],['b',199]])await f.call({channel:'presence',...f.gps(offset)},'POST',user);
 const target=(await f.call({channel:'presence'},'GET')).players[0];let b=(await f.call({action:'challenge',target:target.peerId})).battle;
 b=(await f.call({action:'accept',version:b.version},'POST','b')).battle;assert.equal(b.status,'active');await f.call({action:'leave'});
 await f.call({channel:'presence',...f.gps(201)},'POST','b');await assert.rejects(f.call({action:'challenge',target:target.peerId}),e=>e.code==='out_of_range');
});

test('map selection grants a bound encounter ticket; battle starts and plays without another GPS fix',async()=>{
 const f=fixture();await register(f);const batch=await f.call({action:'spawn',gps:f.gps()}),enemy=batch.encounters[0];
 const near={lat:enemy.lat,lng:enemy.lng,accuracy:500,time:f.now()};
 await assert.rejects(f.call({action:'select-encounter',target:enemy.id,gps:{...near,lat:12}}),e=>e.code==='out_of_range');
 const selected=await f.call({action:'select-encounter',target:enemy.id,gps:near});assert.ok(selected.selectionToken);
 await assert.rejects(f.call({action:'encounter',target:enemy.id,selectionToken:'forged'}),/map again/);
 const battle=(await f.call({action:'encounter',target:enemy.id,selectionToken:selected.selectionToken})).battle;assert.equal(battle.status,'active');assert.equal(battle.encounterId,enemy.id);
 const turn=await f.call({action:'attack',skill:'basic',version:battle.version});assert.ok(turn.battle.version>battle.version);
});

test('road candidates and new monster sets span 800 meters while combat stays within 200 meters',async()=>{
 const {walkingCandidates}=await import('../api/_rpg/roads.mjs'),Layout=(await import('../api/_rpg/src/encounter-layout.js')).default,{distanceMeters}=await import('../api/_rpg/world.mjs');
 const point=meters=>({lat:at.lat+meters/111195,lng:at.lng});
 const ways=[{tags:{highway:'residential'},geometry:[100,900].map(m=>({lat:point(m).lat,lon:point(m).lng}))}];
 for(const candidates of [walkingCandidates(ways,at),Layout.roadPoints(ways,at)]){assert.ok(candidates.some(p=>distanceMeters(at,p)>750));assert.ok(candidates.every(p=>distanceMeters(at,p)<=800));}
 const db=database();let loads=0;const call=input=>gameRequest(db,'a','POST',input,{roadPoints:async()=>{loads++;return [point(100),point(790),point(810)];}});
 await call({action:'register',heroId:'rogue',name:'Far Explorer',skill:'punch'});
 // Older 600 m caches must not restrict the next set to their old coverage.
 const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');row.metadata.roadCache={...at,at:Date.now(),radius:10800,points:[point(100)]};row.metadata.monsterSet={radius:10800,refreshAt:Date.now()+1800000};
 const batch=await call({action:'spawn',gps:{...at,accuracy:5,time:Date.now()}});assert.equal(loads,1);assert.equal(batch.encounters.length,2);
 const far=batch.encounters.find(e=>distanceMeters(at,e)>750);assert.ok(far);
 await assert.rejects(call({action:'select-encounter',target:far.id,gps:{...at,accuracy:5,time:Date.now()}}),e=>e.code==='out_of_range');
 const selected=await call({action:'select-encounter',target:far.id,gps:{lat:far.lat-199/111195,lng:far.lng,accuracy:5,time:Date.now()}});assert.ok(selected.selectionToken);
});

test('fresh sets reserve 3–5 distinct road monsters inside 200m, with the rest out to 800m',async()=>{
 const Layout=(await import('../api/_rpg/src/encounter-layout.js')).default,{distanceMeters}=await import('../api/_rpg/world.mjs');
 const points=[30,60,90,120,150,180,199,...Array.from({length:24},(_,i)=>220+i*24)].map(m=>({lat:at.lat+m/111195,lng:at.lng}));
 const counts=new Set();for(let seed=0;seed<100;seed++){
  const batch=Layout.create(at,10,[{id:'mhakiduk'}],1700000000000+seed,points),near=batch.filter(e=>distanceMeters(at,e)<=200);
  assert.equal(batch.length,16);assert.ok(near.length>=3&&near.length<=5);counts.add(near.length);
  assert.equal(new Set(batch.map(e=>`${e.lat},${e.lng}`)).size,16);assert.ok(batch.every(e=>points.some(p=>p.lat===e.lat&&p.lng===e.lng)));
  assert.ok(batch.every(e=>distanceMeters(at,e)<=800));assert.equal(batch.filter(e=>e.level===8).length,5);assert.equal(batch.filter(e=>e.level===10).length,4);assert.equal(batch.filter(e=>e.level===11||e.level===12).length,4);assert.equal(batch.filter(e=>e.level===13).length,3);
 }
 assert.deepEqual([...counts].sort(),[3,4,5]);
 const db=database(),call=input=>gameRequest(db,'a','POST',input,{roadPoints:async()=>points});await call({action:'register',heroId:'rogue',name:'Nearby Warrior',skill:'punch'});
 const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');row.metadata.monsterSet={radius:800,refreshAt:Date.now()+1800000};row.metadata.encounters=[];
 assert.equal((await call({action:'init'})).spawnCache,null);
 const gps={...at,accuracy:5,time:Date.now()},batch=await call({action:'spawn',gps});assert.ok(batch.encounters.filter(e=>distanceMeters(at,e)<=200).length>=3);
 assert.deepEqual((await call({action:'spawn',gps})).encounters,batch.encounters,'GPS refresh must not reroll or refill pinned monsters');
 const sparse=Layout.create(at,10,[{id:'mhakiduk'}],1700000000000,points.slice(0,2));assert.equal(sparse.length,2,'never invent off-road positions or stack duplicates when road coverage is sparse');
});

test('missing or expired selection tickets fall back to fresh 200-meter GPS validation',async()=>{
 for(const mode of ['missing','expired']){
  const f=fixture();await register(f);const batch=await f.call({action:'spawn',gps:f.gps()}),enemy=batch.encounters[0];let token;
  if(mode==='expired'){const selected=await f.call({action:'select-encounter',target:enemy.id,gps:{...f.gps(),lat:enemy.lat,lng:enemy.lng}});token=selected.selectionToken;f.time(f.now()+121000);}
  const fix=meters=>({...f.gps(),lat:enemy.lat-meters/111195,lng:enemy.lng});
  await assert.rejects(f.call({action:'encounter',target:enemy.id,selectionToken:token,gps:fix(232)}),e=>e.code==='out_of_range'&&e.distance>=232);
  await assert.rejects(f.call({action:'encounter',target:enemy.id,selectionToken:token,gps:{...fix(100),time:f.now()-31000}}),/map again/);
  const result=await f.call({action:'encounter',target:enemy.id,selectionToken:token,gps:fix(199)});assert.equal(result.battle.encounterId,enemy.id);assert.equal(result.battle.status,'active');
 }
});
