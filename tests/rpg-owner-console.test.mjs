import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {database} from './helpers/rpg-db.mjs';
import {ownerRequest} from '../api/_rpg/owner.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
import C from '../api/_rpg/src/inventory-core.js';
import P from '../api/_rpg/src/progression.js';
import Offline from '../api/_rpg/src/offline-rules.js';
import {Chess} from 'chess.js';
import * as R from '../api/_rpg/core.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
function setup(){
 const db=database(),logs=[],profiles=[{user_id:owner,username:'owner'},{user_id:other,username:'other'}];
 const client={...db,from(table){
  if(table==='cb_admin_logs')return {insert:async row=>{logs.push(row);return {error:null};}};
  if(table==='cb_profiles'){let rows=profiles;return {select(){return this;},eq(k,v){rows=rows.filter(r=>r[k]===v);return this;},ilike(k,v){rows=rows.filter(r=>r[k].toLowerCase()===v.replace(/\\(.)/g,'$1').toLowerCase());return this;},limit:async n=>({data:rows.slice(0,n)}),maybeSingle:async()=>({data:rows[0]||null})};}
  const query=db.from(table);query.ilike=(key,value)=>{query.filters.push(row=>String(key.includes('->>')?row.metadata?.[key.split('->>')[1]]:row[key]).toLowerCase()===value.replace(/\\(.)/g,'$1').toLowerCase());return query;};return query;
 }};
 const call=(input,user=owner)=>gameRequest(client,user,'POST',input);
 const command=(command,requestId=crypto.randomUUID(),role='owner')=>ownerRequest(client,owner,role,{action:'owner_command',command,requestId});
 const doc=user=>[...db.rows.values()].find(r=>r.user_id===user&&r.item_kind==='rpg_profile').metadata;
 return {client,db,logs,call,command,doc};
}
async function register(f,user=owner,name='Owner Hero'){await f.call({action:'register',heroId:'rogue',name,skill:'punch'},user);Object.assign(f.doc(user).state,{currentHp:0,currentMp:2,currentAp:1});}

test('only the server owner role can open or execute the console; commands are strictly parsed',async()=>{
 const f=setup();await register(f);
 for(const role of [undefined,'admin','player','OWNER'])for(const action of ['owner_console_access','owner_command'])await assert.rejects(ownerRequest(f.client,owner,role,{action,command:'recoverme',requestId:crypto.randomUUID()}),e=>e.status===403);
 assert.equal((await ownerRequest(f.client,owner,'owner',{action:'owner_console_access'})).allowed,true);
 for(const command of ['eval(1)','healme Other','recover','heal %','heal <script>','recoverme\n'])await assert.rejects(f.command(command));
 assert.equal(f.doc(owner).state.currentHp,0);assert.equal(f.logs.length,0);
});
test('heal restores only HP; recover restores all equipped caps, persists, audits and does not repeat after retry',async()=>{
 const f=setup();await register(f);C.gainXp(f.doc(owner).state,P.threshold(6));
 const id=crypto.randomUUID();await f.command('healme',id);
 let state=(await read(f.client,owner)).state;assert.deepEqual([state.currentHp,state.currentMp,state.currentAp],[40,2,1]);
 f.doc(owner).state.currentHp=7;await f.command('healme',id);assert.equal(f.doc(owner).state.currentHp,7);assert.equal(f.logs.length,1);
 await f.command('recoverme');state=(await read(f.client,owner)).state;assert.deepEqual([state.currentHp,state.currentMp,state.currentAp],[40,35,30]);
 const status=await f.call({action:'recoveryStatus'});assert.equal(status.recovery.mode,'recover');assert.deepEqual(status.resources,{hp:40,mp:35,ap:30});
 assert.equal((await f.call({action:'recoveryStatus',lastSeen:status.recovery.id})).recovery,null);
 assert.equal((await f.call({action:'init'})).game.currentHp,40);assert.equal(f.logs.length,2);
});
test('other heroes use exact case-insensitive multiword names, literal wildcard characters, duplicate protection and @username',async()=>{
 const f=setup();await register(f);await register(f,other,'Night Hero');
 await f.command('heal "night hero"');assert.equal(f.doc(other).state.currentHp,20);assert.equal(f.doc(owner).state.currentHp,0);assert.equal(f.doc(other).state.currentMp,2);
 await f.command('recover @other');assert.equal(f.doc(other).state.currentMp,20);
 f.doc(other).name='Owner Hero';await assert.rejects(f.command('heal Owner Hero'),/Multiple heroes/);
 f.doc(other).name='Night_Hero';f.doc(other).state.currentHp=0;await assert.rejects(f.command('heal Night%Hero'),/not found/);await f.command('heal Night_Hero');assert.equal(f.doc(other).state.currentHp,20);
});
test('server battles heal the selected actor without spending a turn; finished results cannot undo recovery',async()=>{
 const f=setup();await register(f);await register(f,other,'Other Hero');
 const profile=user=>({...R.profile({heroId:'rogue',name:'Hero',level:1,stats:P.baseStats(1),active:['basic',null,null,null]}),userId:user,hp:3,mp:2,ap:1});
 const b=R.createBattle(profile(owner),profile(other),'pvp');b.id='shared';b.status='active';
 f.db.rows.set(owner+':rpg_battle:shared',{user_id:owner,item_kind:'rpg_battle',item_id:'shared',metadata:{revision:0,owner,participants:[owner,other],status:'active',state:b}});
 await f.command('recover Other Hero');const saved=[...f.db.rows.values()].find(r=>r.item_kind==='rpg_battle').metadata.state;
 assert.deepEqual(saved.actors.map(a=>[a.hp,a.ap,a.mp]),[[3,1,2],[20,20,20]]);assert.equal(saved.turn,0);assert.equal(saved.ply,0);assert.equal(saved.version,1);
 const shared=[...f.db.rows.values()].find(r=>r.item_kind==='rpg_battle');shared.metadata.status='finished';R.endBattle(shared.metadata.state,0);Object.assign(shared.metadata.state.actors[1],{hp:0,mp:3,ap:4});f.doc(other).pvpId='shared';delete f.doc(other).healthBattle;
 await f.command('heal Other Hero');assert.equal((await gameRequest(f.client,other,'GET',{})).game.currentHp,20);assert.equal(f.doc(other).state.currentMp,3);assert.equal(f.doc(other).state.currentAp,4);
 f.db.rows.delete(owner+':rpg_battle:shared');const finished=R.createBattle(profile(owner),R.monster('erpack',1));finished.id='finished';R.endBattle(finished,1);f.doc(owner).battle=finished;
 await f.command('healme');assert.equal((await gameRequest(f.client,owner,'GET',{})).game.currentHp,20);
});
test('server-issued owner recovery works in durable offline journals and rejects fabricated or repeated grants',async()=>{
 const f=setup();await register(f);Object.assign(f.doc(owner).state,{currentHp:3,currentMp:2,currentAp:1});
 const gps={lat:11.26,lng:125,accuracy:5,time:Date.now()};
 const spawn=await gameRequest(f.client,owner,'POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]});
 const start=await f.call({action:'encounter',target:spawn.encounters[0].id,gps,offline:true});
 await f.command('recoverme');const status=await f.call({action:'recoveryStatus'}),server=await read(f.client,owner);
 const engine=Offline.create({Rules:R,Chess}),battle=structuredClone(start.battle),ctx={...start.offline,ownerRecoveries:status.offline.grants,usedPotions:[],solved:[],elapsed:0};
 const recovery={action:'ownerRecovery',grantId:status.recovery.id,t:10};
 assert.throws(()=>engine.apply(battle,{...recovery,grantId:'forged'},ctx,10),/unavailable/);
 engine.apply(battle,recovery,ctx,10);assert.deepEqual([battle.actors[0].hp,battle.actors[0].ap,battle.actors[0].mp],[20,20,20]);assert.equal(battle.ply,0);
 assert.throws(()=>engine.apply(battle,recovery,ctx,10),/already used/);
 const payload={action:'offlineFinish',sessionId:start.offline.id,battleId:start.battle.id,commands:[recovery,{action:'leave',t:20}]};
 await assert.rejects(f.call({...payload,commands:[{...recovery,grantId:'forged'},{action:'leave',t:20}],ownerRecoveries:[{id:'forged',mode:'recover'}]}),/unavailable/);
 const synced=await f.call(payload);assert.equal(synced.offlineSynced,true);assert.equal(synced.game.currentHp,20);assert.equal(synced.game.currentAp,20);
 assert.equal(server.offline.ownerRecoveries.length,1);assert.equal((await f.call(payload)).offlineSynced,true);
});

test('the saved local journal records a recovery once, survives reload and settles the restored resources',async()=>{
 const f=setup();await register(f);Object.assign(f.doc(owner).state,{currentHp:3,currentMp:2,currentAp:1});
 const gps={lat:11.26,lng:125,accuracy:5,time:Date.now()};const spawned=await gameRequest(f.client,owner,'POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]});
 const start=await f.call({action:'encounter',target:spawned.encounters[0].id,gps,offline:true});await f.command('healme');const status=await f.call({action:'recoveryStatus'});
 const storage=new Map(),window={RPGLive:{key:()=>owner},RPGBattleRules:R,RPGOfflineRules:Offline,Chess};
 vm.runInNewContext(fs.readFileSync('rpg/src/offline-combat.js','utf8'),{window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Date,JSON});
 const controller=window.RPGOfflineCombat.open(start.offline,start.battle,'rogue');controller.recover(status.offline.grants);assert.equal(controller.battle.actors[0].hp,20);assert.equal(controller.battle.actors[0].mp,2);assert.equal(controller.battle.actors[0].ap,1);
 const resumed=window.RPGOfflineCombat.resume('rogue');resumed.recover(status.offline.grants);assert.equal(resumed.payload().commands.length,1);resumed.act({action:'leave'});
 const synced=await f.call(JSON.parse(JSON.stringify(resumed.payload())));assert.equal(synced.game.currentHp,20);assert.equal(synced.game.currentMp,2);assert.equal(synced.game.currentAp,1);
});

test('a recovery issued after the device finished is retained when its result arrives',async()=>{
 const f=setup();await register(f);Object.assign(f.doc(owner).state,{currentHp:3,currentMp:2,currentAp:1});
 const gps={lat:11.26,lng:125,accuracy:5,time:Date.now()},spawned=await gameRequest(f.client,owner,'POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]});
 const start=await f.call({action:'encounter',target:spawned.encounters[0].id,gps,offline:true});await f.command('recoverme');
 const synced=await f.call({action:'offlineFinish',sessionId:start.offline.id,battleId:start.battle.id,commands:[{action:'leave',t:1}]});
 assert.equal(synced.battle.winner,1);assert.deepEqual([synced.game.currentHp,synced.game.currentAp,synced.game.currentMp],[20,20,20]);
});

test('console hotkey is owner-gated, top-mounted, supports command history and closes without leaking Escape',async()=>{
 let allowed=false;const requests=[],dom=new JSDOM('<button id="before">Game</button><div id="hr-feedback"></div>',{url:'https://chessburger.site/rpg/'}),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.RPGLive={async ownerConsole(body){requests.push(body);if(!allowed)throw Object.assign(Error('Owner only'),{status:403});return body.action==='owner_console_access'?{allowed:true}:{message:'Health restored to 100%'};},async recoveryStatus(){return {};}};
 const timers=[];w.setInterval=fn=>{timers.push(fn);return timers.length;};
 try{
  w.eval=code=>vm.runInContext(code,vm.createContext({window:w,document:d,location:w.location,parent:w,crypto:{getRandomValues:values=>globalThis.crypto.getRandomValues(values)},Uint8Array,setInterval:w.setInterval}));
  w.eval(fs.readFileSync('rpg/src/owner-console.js','utf8'));
  const key=(value,code)=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key:value,code,bubbles:true,cancelable:true}));
  key('~','Backquote');await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelector('#rpg-owner-console'),null);
  allowed=true;d.querySelector('#before').focus();key('~','Backquote');await new Promise(r=>setTimeout(r,0));
  const panel=d.querySelector('dialog'),input=d.querySelector('input');assert.ok(panel.open);assert.equal(d.activeElement,input);
  input.value='healme';panel.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
  assert.equal(requests.at(-1).command,'healme');assert.match(panel.textContent,/Health restored/);
  input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert.equal(input.value,'healme');
  let escapes=0;d.addEventListener('keydown',event=>{if(event.key==='Escape')escapes++;});key('Escape');assert.equal(panel.open,false);assert.equal(escapes,0);assert.equal(d.activeElement,d.querySelector('#before'));
 }finally{w.close();}
});
