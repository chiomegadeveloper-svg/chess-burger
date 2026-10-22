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
 await a.w.RPGBattle.encounter(enemy.id);const dialog=a.d.querySelector('.world-encounter-choice');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-hero-name]').textContent,'Preview Warrior');assert.equal(dialog.querySelector('[data-monster-name]').textContent,enemy.name);assert.match(dialog.querySelector('[data-hero]').src,/heroes\/rogue-right/);assert.match(dialog.querySelector('[data-monster]').src,/-100-left/);
 assert.equal((await read(db,'player-a')).battle,undefined);dialog.querySelector('[data-run]').click();assert.equal(dialog.open,false);assert.equal((await read(db,'player-a')).battle,undefined);
 a.w.RPGWorld.position=()=>null;await a.w.RPGBattle.encounter(enemy.id);dialog.querySelector('[data-attack]').click();await pause();await pause();assert.equal(dialog.open,true);assert.match(dialog.querySelector('[data-encounter-status]').textContent,/map again/);assert.equal(a.d.querySelector('#rpg-battle').hidden,true);assert.equal(dialog.querySelector('[data-attack]').disabled,false);assert.equal((await read(db,'player-a')).battle,undefined);dialog.querySelector('[data-run]').click();
 a.w.RPGWorld.position=()=>({...gps,accuracy:500,time:Date.now()});await a.w.RPGBattle.encounter(enemy.id);await pause();await pause();a.w.RPGWorld.position=()=>null;
 let pauses=0,resumes=0;a.w.RPGWorld.pauseForBattle=()=>pauses++;a.w.RPGWorld.resumeAfterBattle=()=>resumes++;
 dialog.querySelector('[data-attack]').click();await pause();await pause();assert.equal(dialog.open,false);assert.equal((await read(db,'player-a')).battle.encounterId,enemy.id);assert.equal(a.d.querySelector('#rpg-battle').hidden,false);assert.equal(a.d.querySelector('#bt-fight').hidden,false);assert.equal(a.d.querySelector('#bt-title').textContent,'Monster encounter');assert.ok(a.d.querySelectorAll('#bt-skills button').length>0);assert.ok(pauses>0);
 const actors=(await read(db,'player-a')).battle.actors;
 for(const [id,actor] of [['bt-own-stats',actors[0]],['bt-enemy-stats',actors[1]]]){assert.equal(a.d.querySelector('#'+id).children.length,6);assert.deepEqual([...a.d.querySelectorAll('#'+id+' b')].map(n=>Number(n.textContent)),actor.stats);}
 for(const img of a.d.querySelectorAll('#bt-skills img,#bt-enemy-skills img'))assert.match(img.getAttribute('src'),/^assets\/skills\/runes\/[a-z_]+\.svg$/);
 assert.equal(a.d.querySelector('#bt-turn-label').parentElement.id,'bt-stage');
 for(const id of ['bt-ap','bt-mp']){const control=a.d.getElementById(id);assert.equal(control.textContent,'');assert.ok(control.closest('.bt-loadouts'));assert.equal(control.closest('.bt-own'),null);assert.match(control.parentElement.dataset.tooltip,/Harvest/);}
 a.d.querySelector('[data-bt-skill="basic"]').click();await pause();await pause();a.d.querySelector('#bt-mp').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-turn-label').parentElement.className,'bt-turn');assert.match(a.d.querySelector('#bt-turn-label').textContent,/Puzzle/);
 a.d.querySelector('#bt-abandon').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-turn-label').parentElement.id,'bt-stage');
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


test('all eight heroes keep their original artwork at every health threshold and in both directions',async()=>{
 const a=open(database());try{await pause();await pause();
 for(const id of ['rogue','theft','assassin','mage','tank','archer','queen','crusader'])for(const hp of [100,80,60,40,20,1,0])for(const facing of ['left','right']){
  assert.equal(a.w.DamageSprites.sprite(id,hp,facing),`assets/heroes/${id}-${facing}.webp`);
 }
 assert.equal(a.w.DamageSprites.sprite('chaanack',40,'right'),'assets/damage/frames/chaanack-40-left.webp');
 }finally{a.close();}
});

test('confirmed attacks change damage sprites at the hit frame and show the selected monster skill during its 1–2s reply',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'crusader',name:'Quick Hero',skill:'punch'});
 const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()},batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]}),enemy=batch.encounters[0];
 const a=open(db);try{await pause();await pause();a.w.RPGBattle.connect({id:'crusader',name:'Aurex',stats:[20,4,4,4,20,4]},saved.game);a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;
 await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();
 let impact,finish,release;const queued=[];
 a.w.RPGSkillFX={sequence:async(host,events,options)=>{queued.push(...events);for(const event of events){options.onPrepare?.(event);if(event.side!==0){assert.ok(event.delayMs>=1000&&event.delayMs<=2000);assert.ok(a.d.querySelector('#bt-enemy-skills .bt-casting'));}options.onAttack?.(event);if(event.side===0)await new Promise(resolve=>{impact=()=>options.onImpact(event);finish=resolve;});else options.onImpact(event);}},stop(){}};
 const fetch=a.w.fetch;a.w.fetch=(input,options)=>JSON.parse(options?.body||'{}').action==='attack'?new Promise(resolve=>{release=()=>resolve(fetch(input,options));}):fetch(input,options);
 const beforeImpact=a.d.querySelector('#bt-enemy-art').alt;const button=a.d.querySelector('[data-bt-skill="basic"]');assert.equal(button.textContent,'');assert.equal(button.children.length,1);assert.match(button.getAttribute('aria-label'),/Basic Tackle.*4 AP.*2 MP.*Damage/);
 button.click();assert.equal(queued.length,0);assert.ok(a.d.querySelector('#rpg-battle').classList.contains('bt-hero-windup'));assert.equal(a.d.querySelector('#bt-enemy-art').alt,beforeImpact);
 release();await pause();await pause();assert.equal(queued.filter(e=>e.side===0).length,1);assert.equal(a.d.querySelector('#bt-enemy-art').alt,beforeImpact);
 impact();assert.ok(a.d.querySelector('#bt-enemy-art').alt.endsWith(`${(await read(db,'player-a')).battle.actors[1].hp} health`));finish();await pause();await pause();assert.equal(queued.filter(e=>e.side===0).length,1);assert.equal(a.d.querySelectorAll('#bt-skills strong,#bt-skills small,#bt-skills em').length,0);
 }finally{a.close();}
});

test('a slow map presence response cannot hold a combat request in the account queue',async()=>{
 const a=open(database());try{await pause();await pause();const post=a.w.postMessage;let held;
 a.w.postMessage=data=>{if(data.type==='CB_RPG_API'&&data.body.channel==='presence')held=data;else post(data);};
 const presence=a.w.fetch('/api/world/presence',{method:'POST',body:JSON.stringify({lat:11.26,lng:125,accuracy:40})});await pause();assert.ok(held);
 let complete=false;const combat=a.w.fetch('/api/battle').then(()=>complete=true);await pause();await pause();assert.equal(complete,true);
 a.w.dispatchEvent(new a.w.MessageEvent('message',{source:a.w,origin:a.w.location.origin,data:{type:'CB_RPG_REPLY',id:held.id,status:200,data:{ok:true}}}));await presence;await combat;
 }finally{a.close();}
});

test('hero room, library, picker and map use runes; map GPS and player presence start and reconnect automatically',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'crusader',name:'Auto Explorer',skill:'punch'}),a=open(db);
 try{await pause();await pause();
 for(const img of a.d.querySelectorAll('#hr-active img,#hr-spell-storage img,.live-skill-icon img'))assert.match(img.getAttribute('src'),/assets\/skills\/runes\/[a-z_]+\.svg$/);
 const callbacks=[],cleared=[];Object.defineProperty(a.w,'isSecureContext',{value:true,configurable:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(success){callbacks.push(success);return callbacks.length;},clearWatch(id){cleared.push(id);}},configurable:true});
 a.w.RPGBattle.spawn=async()=>({encounters:[],spawnStatus:'ready',refreshAt:Date.now()+1800000});
 a.w.RPGWorld.open(a.w.eval('HEROES.find(h=>h.id==="crusader")'),saved.game);assert.equal(callbacks.length,1);assert.equal(a.d.querySelector('.world-location-buttons').hidden,true);assert.equal(a.d.querySelector('#world-gps').tabIndex,-1);assert.equal(a.d.querySelector('#world-share').tabIndex,-1);
 for(const img of a.d.querySelectorAll('#world-attacks img'))assert.match(img.getAttribute('src'),/assets\/skills\/runes\/[a-z_]+\.svg$/);
 const fix=()=>({coords:{latitude:11.26,longitude:125,accuracy:40},timestamp:Date.now()});callbacks[0](fix());await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));
 Object.defineProperty(a.w.navigator,'onLine',{value:false,configurable:true});a.w.dispatchEvent(new a.w.Event('offline'));await pause();assert.equal(await read(db,'player-a','rpg_presence','live'),null);
 Object.defineProperty(a.w.navigator,'onLine',{value:true,configurable:true});a.w.dispatchEvent(new a.w.Event('online'));assert.equal(callbacks.length,2);callbacks[1](fix());await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));
 a.w.RPGWorld.pauseForBattle();await pause();assert.equal(await read(db,'player-a','rpg_presence','live'),null);callbacks[1](fix());await pause();assert.equal(await read(db,'player-a','rpg_presence','live'),null);
 a.w.RPGWorld.resumeAfterBattle();assert.equal(callbacks.length,3);callbacks[2](fix());await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));assert.ok(cleared.includes(2));a.w.RPGWorld.stop();
 }finally{a.close();}
});


test('harvest result appears before the enemy reply animation and premove survives an AI turn',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Chess Tester',skill:'punch'}),gps={lat:11.26,lng:125,accuracy:40,time:Date.now()};
 const batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.26,lng:125}]}),enemy=batch.encounters[0],a=open(db);
 try{await pause();await pause();a.w.RPGBattle.connect({id:'rogue',name:'Tester',stats:[20,4,4,4,20,4]},saved.game);a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();a.d.querySelector('[data-bt-skill="basic"]').click();await pause();await pause();
 let reply;a.w.Worker=class{postMessage(command){if(command==='uci')setTimeout(()=>this.onmessage({data:'uciok'}),0);if(command==='isready')setTimeout(()=>this.onmessage({data:'readyok'}),0);if(command.startsWith('go '))reply=()=>this.onmessage({data:'bestmove e7e5'});}terminate(){}};
 // Use regular engine search, rather than the low-Elo random mistake branch.
 a.w.Math.random=()=>.99;a.d.querySelector('#bt-ap').click();await pause();await pause();
 const tap=square=>a.d.querySelector(`[data-bt-square="${square}"]`).click();tap('e2');tap('e4');await pause();await pause();assert.ok(reply);tap('g1');tap('f3');assert.match(a.d.querySelector('#bt-chess-status').textContent,/Premove queued/);reply();await pause();await pause();await pause();const doc=await read(db,'player-a');assert.deepEqual(doc.battle.challenge.moves.slice(0,3),['e2e4','e7e5','g1f3']);
 let animation=0;a.w.RPGSkillFX={sequence:async()=>{animation++;},stop(){}};a.d.querySelector('#bt-abandon').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,false);assert.equal(animation,0);a.d.querySelector('#bt-harvest-done').click();await pause();assert.ok(animation>0);
 }finally{a.close();}
});


test('dragging health and mana potions from inventory onto the hero consumes each once and shows consumable-only descriptions',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Potion User',skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.currentHp=1;doc.state.currentMp=2;
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,mp={uid:'mana-drag',defId:'mana_potion',rotation:0,rotated:false,...C.rollItem(C.itemMap.mana_potion,1,()=>0,{rarity:'rare'})};C.place(doc.state,mp,'bag',0,0);const hp=doc.state.items.find(i=>i.defId==='health_potion');
 const a=open(db);try{await pause();await pause();const room=a.d.querySelector('#hr-room'),scene=a.d.querySelector('.hr-hero-scene');room.setPointerCapture=()=>{};room.hasPointerCapture=()=>false;scene.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100,width:100,height:100});
 const drag=async uid=>{const node=a.d.querySelector(`[data-uid="${uid}"]`);node.getBoundingClientRect=()=>({left:200,top:200,right:220,bottom:220,width:20,height:20});node.focus();assert.match(a.d.querySelector('#hr-item-tooltip').textContent,/Consumable.*Restores 20/);assert.doesNotMatch(a.d.querySelector('#hr-item-tooltip').textContent,/Enhancement|Insight|Base attributes|Requires level/i);const send=(target,type,x,y)=>{const event=new a.w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'mouse'}});target.dispatchEvent(event);};send(node,'pointerdown',210,210);send(room,'pointermove',50,50);assert.equal(scene.classList.contains('hr-potion-ready'),true);send(room,'pointerup',50,50);await pause();await pause();};
 await drag(hp.uid);let saved=await read(db,'player-a');assert.equal(saved.state.currentHp,20);assert.equal(saved.state.items.some(i=>i.uid===hp.uid),false);
 await drag(mp.uid);saved=await read(db,'player-a');assert.equal(saved.state.currentMp,20);assert.equal(saved.state.items.some(i=>i.uid===mp.uid),false);assert.equal(a.messages.filter(m=>m.body?.action==='usePotion').length,2);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});
