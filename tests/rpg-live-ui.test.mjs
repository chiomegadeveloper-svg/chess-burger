import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
import {database} from './helpers/rpg-db.mjs';
const pause=()=>new Promise(r=>setTimeout(r,25));
function open(db){
 const errors=[],messages=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css-parsing')errors.push(e.message)});
 const html=fs.readFileSync('public/rpg/index.html','utf8').replace('<script src="live-skill-picker.js"></script>','<script>'+fs.readFileSync('public/rpg/live-skill-picker.js','utf8')+'</script>').replace('<script src="live-bootstrap.js"></script>','<script>'+fs.readFileSync('public/rpg/live-bootstrap.js','utf8')+'</script>');
 const dom=new JSDOM(html,{url:'https://chessburger.site/rpg/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.Response=Response;w.fetch=async()=>new Response('{}');
  w.eval(fs.readFileSync('public/rpg/vendor/chess.js','utf8'));w.eval(fs.readFileSync('public/rpg/vendor/battle-core.js','utf8'));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const send=data=>w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data}));
  w.postMessage=data=>{messages.push(data);if(data.type==='CB_RPG_READY')setTimeout(()=>send({type:'CB_RPG_BOOT',userId:'player-a'}),0);if(data.type==='CB_RPG_API')gameRequest(db,'player-a',data.method,data.body).then(result=>send({type:'CB_RPG_REPLY',id:data.id,status:200,data:result})).catch(e=>send({type:'CB_RPG_REPLY',id:data.id,status:e.status||500,data:{error:e.message}}));};
 }});
 return {dom,w:dom.window,d:dom.window.document,errors,messages,close:()=>dom.window.close()};
}
test('live portal creates one named hero with two attacks, hides test tools, exits instead of changing hero, and restores cloud hero on reopening',async()=>{
 const db=database(),a=open(db);try{
  await pause();await pause();assert.equal(a.d.querySelector('#live-loading'),null);assert.equal(a.d.querySelectorAll('.live-skill-icon').length,30);assert.equal(a.d.querySelector('select#live-starter'),null);
  a.d.querySelector('#heroName').value='Live Warrior';a.d.querySelector('#saveBtn').click();assert.equal(a.d.querySelector('.live-confirm').open,false);
  a.d.querySelector('.live-skill-open').click();assert.equal(a.d.querySelector('.live-skill-picker').open,true);a.d.querySelector('[data-skill="punch"]').dispatchEvent(new a.w.Event('mouseenter'));assert.match(a.d.querySelector('.live-skill-details').textContent,/Attack damage/);a.d.querySelector('[data-skill="punch"]').click();a.d.querySelector('[data-use]').click();assert.equal(a.d.querySelector('#live-starter').value,'punch');assert.equal(a.d.querySelector('.live-skill-picker').open,false);a.d.querySelector('#saveBtn').click();assert.equal(a.d.querySelector('.live-confirm').open,true);assert.match(a.d.querySelector('.live-confirm p').textContent,/cannot change/);
  a.d.querySelector('[data-confirm]').click();await pause();await pause();assert.equal(a.d.querySelector('#hr-room').hidden,false);assert.equal(a.d.querySelector('.app').hidden,true);
  const doc=await read(db,'player-a');assert.equal(doc.name,'Live Warrior');assert.deepEqual(doc.state.active,['basic','punch',null,null]);assert.equal(a.d.querySelector('#hr-active').children.length,4);
  for(const id of ['hr-collect','hr-damage','hr-levelup','hr-test-cbg','world-battle-lab','bt-practice'])assert.equal(a.d.getElementById(id).hidden,true,id);
  a.d.querySelector('#hr-back').click();await pause();assert.ok(a.messages.some(m=>m.type==='CB_RPG_EXIT'));assert.equal(a.d.querySelector('.app').hidden,true);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
 const b=open(db);try{await pause();await pause();assert.equal(b.d.querySelector('#hr-room').hidden,false);assert.equal(b.d.querySelector('#hr-name').textContent,'Live Warrior');assert.equal(b.d.querySelector('.app').hidden,true);assert.deepEqual(b.errors,[]);}finally{b.close();}
});

test('out-of-range message is centered, lasts ten seconds, fades out and can close early',async()=>{
 const a=open(database());try{await pause();await pause();const timers=[],original=a.w.setTimeout;a.w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};
 a.w.RPGWorld.position=()=>({lat:11.26,lng:125,accuracy:40,time:Date.now()});a.w.RPGWorld.monster=()=>({lat:11.26+350/111195,lng:125});await a.w.RPGBattle.encounter('far-monster');const popup=a.d.querySelector('.world-range-notice');assert.equal(popup.hidden,false);assert.match(popup.textContent,/350 m/);assert.match(popup.textContent,/200 meters/);assert.equal(timers.at(-1).ms,10000);
 timers.at(-1).fn();assert.equal(popup.classList.contains('leaving'),true);assert.equal(timers.at(-1).ms,350);timers.at(-1).fn();assert.equal(popup.hidden,true);
 a.w.RPGWorld.outOfRange(450);assert.equal(popup.hidden,false);assert.equal(popup.classList.contains('leaving'),false);popup.querySelector('button').click();assert.equal(popup.classList.contains('leaving'),true);a.w.setTimeout=original;
 }finally{a.close();}
});

test('monster tap previews hero versus monster; Run makes no battle and Attack opens combat without needing GPS again',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Preview Warrior',skill:'punch'});
 const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()};
 const batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]});const enemy=batch.encounters[0];
 const a=open(db);try{await pause();await pause();a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);
 a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;
 await a.w.RPGBattle.encounter(enemy.id);const dialog=a.d.querySelector('.world-encounter-choice');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-hero-name]').textContent,'Preview Warrior');assert.equal(dialog.querySelector('[data-monster-name]').textContent,enemy.name);assert.match(dialog.querySelector('[data-hero]').src,/rogue-100-right/);assert.match(dialog.querySelector('[data-monster]').src,/-100-left/);
 assert.equal((await read(db,'player-a')).battle,undefined);dialog.querySelector('[data-run]').click();assert.equal(dialog.open,false);assert.equal((await read(db,'player-a')).battle,undefined);
 a.w.RPGWorld.position=()=>null;await a.w.RPGBattle.encounter(enemy.id);dialog.querySelector('[data-attack]').click();await pause();await pause();assert.equal(dialog.open,true);assert.match(dialog.querySelector('[data-encounter-status]').textContent,/map again/);assert.equal(a.d.querySelector('#rpg-battle').hidden,true);assert.equal(dialog.querySelector('[data-attack]').disabled,false);assert.equal((await read(db,'player-a')).battle,undefined);dialog.querySelector('[data-run]').click();
 a.w.RPGWorld.position=()=>({...gps,accuracy:500,time:Date.now()});await a.w.RPGBattle.encounter(enemy.id);await pause();await pause();a.w.RPGWorld.position=()=>null;
 let pauses=0,resumes=0;a.w.RPGWorld.pauseForBattle=()=>pauses++;a.w.RPGWorld.resumeAfterBattle=()=>resumes++;
 dialog.querySelector('[data-attack]').click();await pause();await pause();assert.equal(dialog.open,false);assert.equal((await read(db,'player-a')).battle.encounterId,enemy.id);assert.equal(a.d.querySelector('#rpg-battle').hidden,false);assert.equal(a.d.querySelector('#bt-fight').hidden,false);assert.equal(a.d.querySelector('#bt-title').textContent,'Monster encounter');assert.ok(a.d.querySelectorAll('#bt-skills button').length>0);assert.ok(pauses>0);
 a.d.querySelector('#bt-close').click();assert.ok(resumes>0);
 assert.equal(a.messages.filter(m=>m.type==='CB_RPG_API'&&m.body.action==='encounter').length,1);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('battle pauses the actual GPS watch and returning to the map starts it again',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'GPS Pause',skill:'punch'}),a=open(db);
 try{await pause();await pause();let watches=0;const cleared=[];
 Object.defineProperty(a.w,'isSecureContext',{value:true,configurable:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(){return ++watches;},clearWatch(id){cleared.push(id);}},configurable:true});
 const hero=a.w.eval('HEROES[0]');a.w.RPGWorld.open(hero,saved.game);assert.equal(watches,1);a.w.RPGWorld.pauseForBattle();assert.deepEqual(cleared,[1]);a.w.RPGWorld.resumeAfterBattle();assert.equal(watches,2);a.w.RPGWorld.stop();assert.deepEqual(cleared,[1,2]);
 }finally{a.close();}
});
