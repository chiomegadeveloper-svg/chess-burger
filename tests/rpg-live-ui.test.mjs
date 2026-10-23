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


test('all eight heroes preserve full-health identity and restore the sandbox injury and death poses',async()=>{
 const a=open(database());try{await pause();await pause();
 for(const id of ['rogue','theft','assassin','mage','tank','archer','queen','crusader'])for(const hp of [100,80,60,40,20,1,0])for(const facing of ['left','right']){
  assert.equal(a.w.DamageSprites.sprite(id,hp,facing),hp>80?`assets/heroes/${id}-${facing}.webp`:`assets/damage/frames/${id}-${hp<=1?1:hp<=20?20:hp<=40?40:hp<=60?60:80}-${facing}.webp`);
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

test('battle bag potion drag uses one turn, empties its slot and presents enemy damage after the potion heal',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Battle Potion',skill:'punch'});const C=(await import('../api/_rpg/src/inventory-core.js')).default,doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.currentHp=5;doc.state.currentMp=3;const potion=doc.state.items[0];C.place(doc.state,potion,'bag',0,0);
 const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()},batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.26,lng:125}]}),enemy=batch.encounters[0],a=open(db);
 try{await pause();await pause();a.w.RPGBattle.connect({id:'assassin',name:'Assassin',heroClass:'Rogue',stats:[20,4,4,4,20,4]},(await read(db,'player-a')).state);a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();
 const bag=a.d.querySelector(`#bt-bag [data-item-uid="${potion.uid}"]`),root=a.d.querySelector('#rpg-battle'),frame=a.d.querySelector('#bt-hero-art').parentElement;assert.ok(bag);root.setPointerCapture=()=>{};root.hasPointerCapture=()=>false;frame.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100});
 let impact,release;a.w.RPGSkillFX={sequence:async(host,events,options)=>{assert.equal(host.id,'bt-fx-bar');assert.equal(events.length,1);options.onPrepare?.(events[0]);await new Promise(resolve=>{release=resolve;impact=()=>options.onImpact(events[0]);});},stop(){}};
 const send=(target,type,x,y)=>{const event=new a.w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:2},pointerType:{value:'mouse'}});target.dispatchEvent(event);};send(bag,'pointerdown',200,200);send(root,'pointermove',50,50);assert.equal(frame.classList.contains('bt-potion-target'),true);send(root,'pointerup',50,50);await pause();await pause();assert.ok(a.d.querySelector('#bt-hero-art').alt.endsWith('20 health'));assert.equal(a.d.querySelector(`#bt-bag [data-item-uid="${potion.uid}"]`),null);impact();release();await pause();await pause();const saved=await read(db,'player-a');assert.equal(saved.battle.ply,2);assert.ok(a.d.querySelector('#bt-hero-art').alt.endsWith(`${saved.battle.actors[0].hp} health`));assert.equal(a.messages.filter(m=>m.body?.action==='usePotion').length,1);assert.equal(a.d.querySelector('#bt-close').closest('#bt-own-actions')?.id,'bt-own-actions');assert.equal(a.d.querySelector('.bt-harvester-label').textContent,'HARVESTER');assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('saved harvest feedback stays closed after RPG reopening while a new harvest still shows immediately',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'No Replay',skill:'punch'}),row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;row.state.currentMp=2;const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()},batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.26,lng:125}]});let result=await gameRequest(db,'player-a','POST',{action:'encounter',target:batch.encounters[0].id,gps});result=await gameRequest(db,'player-a','POST',{action:'harvest',resource:'mp',version:result.battle.version});await gameRequest(db,'player-a','POST',{action:'abandon',version:result.battle.version});
 const a=open(db);try{await pause();await pause();a.d.querySelector('#rpg-world').hidden=false;a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,true);a.d.querySelector('#bt-mp').click();await pause();await pause();a.d.querySelector('#bt-abandon').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,false);a.d.querySelector('#bt-harvest-done').click();await pause();a.w.RPGBattle.stop();a.d.querySelector('#rpg-world').hidden=false;a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,true);assert.deepEqual(a.errors,[]);}finally{a.close();}
 const reopened=open(db);try{await pause();await pause();reopened.d.querySelector('#rpg-world').hidden=false;reopened.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);await pause();await pause();assert.equal(reopened.d.querySelector('#bt-harvest-modal').hidden,true);}finally{reopened.close();}
});

test('returning from the bag immediately restores the last GPS fix and refreshes pinned encounters and player presence',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Bag Return',skill:'punch'}),a=open(db);
 try{await pause();await pause();const callbacks=[],intervals=[];Object.defineProperty(a.w,'isSecureContext',{value:true,configurable:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(success){callbacks.push(success);return callbacks.length;},clearWatch(){}},configurable:true});const original=a.w.setInterval;a.w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return original(fn,ms);};const pins=new Set(),map={setView(){return this;},getZoom(){return 16;},on(){},invalidateSize(){},attributionControl:{addAttribution(){}}},marker=()=>({addTo(){pins.add(this);return this;},remove(){pins.delete(this);},on(){return this;},bindTooltip(){return this;},setLatLng(){return this;},setRadius(){return this;}});a.w.L={map:()=>map,marker,circle:marker,divIcon:x=>x};a.w.RPGBasemap.create=async()=>({on(){},addTo(){},remove(){}});let discovers=0;a.w.RPGBattle.spawn=async()=>{discovers++;return {encounters:[{id:'pinned',monsterId:'chaanack',name:'Chaanack',level:1,lat:11.26,lng:125,expires_at:Date.now()+1800000}],spawnStatus:'ready',refreshAt:Date.now()+1800000};};const hero=a.w.eval('HEROES[0]');a.w.RPGWorld.open(hero,saved.game);callbacks[0]({coords:{latitude:11.26,longitude:125,accuracy:5},timestamp:Date.now()});await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));a.d.querySelector('#world-bag-open').click();assert.equal(a.d.querySelector('#rpg-world').hidden,true);assert.equal(a.w.RPGWorld.position(),null);a.w.RPGWorld.open(hero,saved.game);assert.equal(a.w.RPGWorld.position().lat,11.26);assert.equal(callbacks.length,2);assert.ok(pins.size>=3,'hero, range and monster pins restore before a new GPS fix');await pause();await pause();assert.ok(discovers>=2);assert.ok(await read(db,'player-a','rpg_presence','live'));assert.ok(intervals.some(i=>i.ms===10000));intervals.filter(i=>i.ms===10000).at(-1).fn();assert.equal(a.w.RPGWorld.position().lng,125);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Hero Room merchant shows 28 daily gear items, purchases with account CBG, and sells an owned item by dragging onto merchant tiles',async()=>{
 const db=database();let balance=5000;const from=db.from.bind(db);db.from=table=>table==='cb_profiles'?{select(){return this;},eq(){return this;},async maybeSingle(){return {data:{gold_points:balance},error:null};}}:from(table);db.rpc=async(_name,p)=>{const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile'),old=row.metadata;if(p.p_request_id===null)return {data:old,error:null};if(old.revision!==p.p_revision)return {error:{message:'inventory changed'}};if(balance+p.p_delta<0)return {error:{message:'Not enough CBG'}};balance+=p.p_delta;row.metadata={...structuredClone(p.p_document),revision:old.revision+1};row.metadata.state.cbg=balance;return {data:row.metadata,error:null};};await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Shopper',skill:'punch'});const a=open(db);try{await pause();await pause();assert.equal(a.d.querySelector('#hr-shop').hidden,false);a.d.querySelector('#hr-shop').click();await pause();await pause();assert.equal(a.d.querySelector('#rpg-merchant').open,true);assert.equal(a.d.querySelectorAll('#merchant-stock [data-offer]').length,28);assert.equal(a.d.querySelector('#merchant-balance').textContent,'5,000');a.d.querySelector('[data-offer="health_potion"]').click();a.d.querySelector('[data-trade]').click();await pause();await pause();assert.equal(balance,4992);assert.match(a.d.querySelector('#merchant-status').textContent,/Purchased/);const owned=a.d.querySelector('#merchant-bag [data-sell-uid]'),dialog=a.d.querySelector('#rpg-merchant'),target=a.d.querySelector('#merchant-stock');assert.ok(owned);dialog.setPointerCapture=()=>{};dialog.hasPointerCapture=()=>false;target.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100});const send=(node,type,x,y)=>{const event=new a.w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:7},pointerType:{value:'mouse'}});node.dispatchEvent(event);};const uid=owned.dataset.sellUid;send(owned,'pointerdown',200,200);send(dialog,'pointermove',50,50);send(dialog,'pointerup',50,50);await pause();await pause();assert.equal(balance,4994);assert.equal((await read(db,'player-a')).state.items.some(i=>i.uid===uid),false);assert.match(a.d.querySelector('#merchant-status').textContent,/Sold/);a.d.querySelector('[data-offer="mana_potion"]').click();const qty=a.d.querySelector('#merchant-quantity');qty.value='3';qty.dispatchEvent(new a.w.Event('input',{bubbles:true}));assert.match(a.d.querySelector('[data-trade]').textContent,/24 CBG/);a.d.querySelector('[data-trade]').click();await pause();await pause();assert.equal(balance,4970);const before=(await read(db,'player-a')).state.items.length,drop=a.d.querySelector('#merchant-bag');drop.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100});send(a.d.querySelector('[data-offer="health_potion"]'),'pointerdown',200,200);send(dialog,'pointermove',50,50);send(dialog,'pointerup',50,50);await pause();await pause();assert.equal(balance,4962);assert.equal((await read(db,'player-a')).state.items.length,before+1);a.d.querySelector('#merchant-bag-upgrade').click();await pause();await pause();assert.equal(balance,4474);assert.equal((await read(db,'player-a')).state.grids.bag.rows,8);assert.deepEqual(a.errors,[]);}finally{a.close();}
});

test('autosave retains a pending inventory edit during a network failure, retries on reconnect, and restores the saved layout on reopening',async()=>{const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Auto Save',skill:'punch'});const a=open(db);try{await pause();await pause();assert.equal(a.d.querySelector('#hr-save').hidden,true);const send=a.w.postMessage;let fail=true;a.w.postMessage=data=>{if(fail&&data.type==='CB_RPG_API'&&data.body?.action==='save'){fail=false;setTimeout(()=>a.w.dispatchEvent(new a.w.MessageEvent('message',{source:a.w,origin:a.w.location.origin,data:{type:'CB_RPG_REPLY',id:data.id,status:503,data:{error:'Network interrupted'}}})),0);}else send(data);};const state=structuredClone((await read(db,'player-a')).state);state.active=['punch','basic',null,null];a.w.RPGLive.save(state);await a.w.RPGLive.flush();assert.equal(a.d.querySelector('#rpg-autosave-status').textContent,'Save pending');assert.ok(a.w.localStorage.getItem('chessburger_rpg_pending_player-a'));a.w.dispatchEvent(new a.w.Event('online'));await pause();await pause();assert.equal(a.d.querySelector('#rpg-autosave-status').textContent,'Saved');assert.equal(a.w.localStorage.getItem('chessburger_rpg_pending_player-a'),null);assert.deepEqual((await read(db,'player-a')).state.active,['punch','basic',null,null]);assert.deepEqual(a.errors,[]);}finally{a.close();}const b=open(db);try{await pause();await pause();assert.match(b.d.querySelector('#hr-active [data-slot-index="0"]').getAttribute('aria-label'),/Super Punch/);}finally{b.close();}});

test('Explorer reads wait for the newest coalesced bag save, preventing an older stash snapshot from replacing equipment',async()=>{const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Bag Sync',skill:'punch'});const a=open(db);try{await pause();await pause();await a.w.RPGLive.flush();const send=a.w.postMessage;let release,held=false;a.w.postMessage=data=>{if(!held&&data.type==='CB_RPG_API'&&data.body?.action==='save'){held=true;release=()=>send(data);}else send(data);};const initial=structuredClone((await read(db,'player-a')).state);initial.active=['punch','basic',null,null];const equipped=structuredClone(initial),potion=equipped.items[0],C=a.w.RPGInventory;C.place(equipped,potion,'bag',2,2);a.w.RPGLive.save(initial);a.w.RPGLive.save(equipped);const before=a.messages.length,reading=a.w.fetch('/api/battle');await pause();assert.ok(release);assert.equal(a.messages.slice(before).some(m=>m.type==='CB_RPG_API'&&m.method==='GET'),false);release();const result=await (await reading).json();assert.equal(result.game.items.find(i=>i.uid===potion.uid).where,'bag');assert.equal((await read(db,'player-a')).state.items.find(i=>i.uid===potion.uid).where,'bag');assert.equal(JSON.parse(a.w.localStorage.getItem(a.w.RPGLive.key('rogue'))).items.find(i=>i.uid===potion.uid).where,'bag');assert.deepEqual(a.errors,[]);}finally{a.close();}const b=open(db);try{await pause();await pause();assert.equal(b.d.querySelectorAll('#hr-bag .hr-item').length,1);assert.equal(b.d.querySelectorAll('#hr-stash .hr-item').length,2);b.d.querySelector('#hr-explore').click();await pause();await pause();assert.equal(b.d.querySelectorAll('#world-bag .world-bag-item').length,1);assert.equal(b.d.querySelector('#world-exit').parentElement.className,'world-sidebar');}finally{b.close();}});

test('a late Explorer poll cannot replace the bag layout after returning to Hero Room',async()=>{const db=database();const saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Late Read',skill:'punch'}),a=open(db);try{await pause();await pause();await a.w.RPGLive.flush();const send=a.w.postMessage;let release;const stale=structuredClone(saved.game);a.w.postMessage=data=>{if(data.type==='CB_RPG_API'&&data.method==='GET'){release=()=>a.w.dispatchEvent(new a.w.MessageEvent('message',{source:a.w,origin:a.w.location.origin,data:{type:'CB_RPG_REPLY',id:data.id,status:200,data:{game:stale,battle:null}}}));}else send(data);};a.d.querySelector('#rpg-world').hidden=false;a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);await pause();assert.ok(release);a.w.RPGBattle.stop();a.d.querySelector('#rpg-world').hidden=true;const item=saved.game.items[0];a.w.RPGInventory.place(saved.game,item,'bag',0,0);release();await pause();await pause();assert.equal(saved.game.items.find(i=>i.uid===item.uid).where,'bag');assert.deepEqual(a.errors,[]);}finally{a.close();}});

test('city chest markers open a compact reward dialog and remain visibly claimed until the daily reset',async()=>{const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Treasure Hunter',skill:'punch'});const a=open(db);try{await pause();await pause();const city={id:'test-city',name:'Test Town',bounds:[11.25,11.28,124.99,125.03]},roads=Array.from({length:18},(_,i)=>({lat:11.26+Math.floor(i/6)*.001,lng:125+i%6*.001})),send=a.w.postMessage;let markers=[];a.w.postMessage=data=>{if(data.type==='CB_RPG_API'&&['chests','openChest'].includes(data.body?.action)){gameRequest(db,'player-a',data.method,data.body,{worldOwner:async()=> 'owner',resolveCity:async()=>city,cityRoads:async()=>roads,rng:()=>.5}).then(result=>a.w.dispatchEvent(new a.w.MessageEvent('message',{source:a.w,origin:a.w.location.origin,data:{type:'CB_RPG_REPLY',id:data.id,status:200,data:result}})));}else send(data);};a.d.querySelector('#hr-room').hidden=true;a.d.querySelector('#rpg-world').hidden=false;a.w.RPGWorld.position=()=>({...roads[0],accuracy:5,time:Date.now()});a.w.RPGWorld.showChests=rows=>{markers=rows;};await a.w.RPGChests.refresh(true);assert.equal(markers.length,7);assert.match(a.d.querySelector('#world-chests-bar').textContent,/Test Town.*7\/7/);for(const kind of ['golden','emerald','enchanted']){a.w.RPGChests.open(markers.find(c=>c.kind===kind));assert.equal(a.d.querySelector('#chest-art img').getAttribute('src'),`assets/chests/${kind}.webp`);a.d.querySelector('#rpg-chest').close();}const chest=markers[0];a.w.RPGWorld.position=()=>({...chest,accuracy:5,time:Date.now()});a.w.RPGChests.open(chest);assert.equal(a.d.querySelector('#rpg-chest').open,true);assert.match(a.d.querySelector('#chest-title').textContent,/Chest/);a.d.querySelector('#chest-open').click();await pause();await pause();assert.equal(markers.length,7);assert.equal(markers.filter(c=>c.claimed).length,1);assert.ok(a.d.querySelectorAll('#chest-loot img').length>=4);assert.equal(a.d.querySelector('#chest-open').hidden,true);assert.equal((await read(db,'player-a')).chestAwards.length,1);assert.deepEqual(a.errors,[]);}finally{a.close();}});


test('equipping gear and entering Explorer survives JSONB object key ordering without changing the inventory revision',async()=>{
 const db=database({jsonb:true});await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Equipped Hero',skill:'punch'});
 const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,def=C.items.find(i=>i.category==='Weapons');
 const item={uid:'owned-weapon',defId:def.id,rotation:0,rotated:false,...C.rollItem(def,1,()=>0,{requiredLevel:1,rarity:'rare'})};
 const spot=C.findSpace(row.metadata.state,item,'stash');assert.ok(C.place(row.metadata.state,item,'stash',spot.x,spot.y,spot.rotation));
 await db.from('cb_inventory_items').update({metadata:row.metadata}).eq('user_id','player-a');
 const revision=row.metadata.state.inventoryRevision,a=open(db);
 try{await pause();await pause();a.d.querySelector('[data-uid="owned-weapon"]').click();a.d.querySelector('[data-item-action="transfer"]').click();
 a.d.querySelector('#hr-explore').click();await pause();await pause();await a.w.RPGLive.flush();
 assert.equal(a.d.querySelector('#rpg-world').hidden,false,a.d.querySelector('#hr-feedback').textContent);
 assert.equal(a.d.querySelector('#rpg-autosave-status').textContent,'Saved');
 const saved=await read(db,'player-a');assert.equal(saved.state.items.find(i=>i.uid===item.uid).where,'bag');assert.equal(saved.state.inventoryRevision,revision);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Skill Book glows for unspent choices; Cancel keeps the choice and Activate learns and equips only the confirmed rune',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Skill Student',skill:'punch'});
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,P=(await import('../api/_rpg/src/progression.js')).default;
 const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');C.gainXp(row.metadata.state,P.threshold(4));
 const a=open(db);try{await pause();await pause();assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),true);
 a.d.querySelector('#hr-learn').click();const candidates=[...a.d.querySelectorAll('[data-learn]:not([disabled])')].map(n=>n.dataset.learn),first=candidates[0],second=candidates[1];
 a.d.querySelector(`[data-learn="${first}"]`).click();assert.equal(a.d.querySelector('#hr-skill-confirm').open,true);assert.equal((await read(db,'player-a')).state.learned.includes(first),false);
 a.d.querySelector('#hr-skill-cancel').click();await pause();assert.equal(a.d.querySelector('#hr-learn-modal').hidden,false);assert.equal((await read(db,'player-a')).state.learnCredits,2);
 a.d.querySelector(`[data-learn="${second}"]`).click();a.d.querySelector('#hr-skill-activate').click();await pause();await a.w.RPGLive.flush();let saved=await read(db,'player-a');assert.equal(saved.state.learned.includes(first),false);assert.equal(saved.state.active[2],second);assert.equal(saved.state.learnCredits,1);assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),true);
 a.d.querySelector('#hr-learn').click();a.d.querySelector(`[data-learn="${first}"]`).click();a.d.querySelector('#hr-skill-activate').click();await pause();await a.w.RPGLive.flush();saved=await read(db,'player-a');assert.equal(saved.state.active[3],first);assert.equal(saved.state.learnCredits,0);assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),false);
 // A later level reward makes the book glow again. Full loadouts require an explicit replacement.
 const current=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');C.gainXp(current.metadata.state,P.threshold(6));a.w.RPGRoom.accept(structuredClone(current.metadata.state));assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),true);
 a.d.querySelector('#hr-learn').click();const third=a.d.querySelector('[data-learn]:not([disabled])').dataset.learn;a.d.querySelector(`[data-learn="${third}"]`).click();assert.equal(a.d.querySelector('#hr-skill-activate').disabled,true);assert.equal(a.d.querySelector('#hr-skill-confirm-slots').hidden,false);
 a.d.querySelector('[data-activate-slot="1"]').click();a.d.querySelector('#hr-skill-activate').click();await pause();await a.w.RPGLive.flush();saved=await read(db,'player-a');assert.equal(saved.state.active[1],third);assert.ok(saved.state.spellStorage.includes('punch'));assert.equal(saved.state.learnCredits,0);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('city chest lookup failures show a retry action and the map finder reveals loaded city treasure',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Retry Treasure',skill:'punch'});const a=open(db);
 try{await pause();await pause();const send=a.w.postMessage;let fail=true,framed=null;const city={id:'fixture-city',name:'Retry Town',bounds:[11.25,11.28,124.99,125.03]},roads=Array.from({length:20},(_,i)=>({lat:11.26+Math.floor(i/6)*.001,lng:125+i%6*.001}));
 a.w.postMessage=data=>{if(data.type==='CB_RPG_API'&&data.body?.action==='chests'){const reply=(status,result)=>a.w.dispatchEvent(new a.w.MessageEvent('message',{source:a.w,origin:a.w.location.origin,data:{type:'CB_RPG_REPLY',id:data.id,status,data:result}}));if(fail){fail=false;reply(503,{error:'Road provider timeout'});}else gameRequest(db,'player-a',data.method,data.body,{worldOwner:async()=> 'owner',resolveCity:async()=>city,cityRoads:async()=>roads}).then(r=>reply(200,r));}else send(data);};
 a.d.querySelector('#hr-room').hidden=true;a.d.querySelector('#rpg-world').hidden=false;a.w.RPGWorld.position=()=>({...roads[0],accuracy:5,time:Date.now()});a.w.RPGWorld.showChests=()=>{};a.w.RPGWorld.chestArea=b=>framed=b;
 await a.w.RPGChests.refresh(true);assert.equal(a.d.querySelector('#world-chests-bar').dataset.state,'error');assert.equal(a.d.querySelector('.world-chest-finder').getAttribute('aria-label'),'Retry city chests');a.d.querySelector('#world-chests-bar button').click();await pause();await pause();assert.equal(a.d.querySelector('#world-chests-bar').dataset.state,'ready');assert.equal(a.d.querySelector('.world-chest-finder span').textContent,'7/7 chests');a.d.querySelector('.world-chest-finder').click();assert.deepEqual(framed,city.bounds);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('crossing a city boundary immediately clears old chest pins while the next city loads',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'City Traveler',skill:'punch'});const a=open(db);
 try{await pause();await pause();let fix={lat:11.26,lng:125,accuracy:5,time:Date.now()},markers=[],release,hold=false;const send=a.w.postMessage;
 a.w.postMessage=data=>{if(data.type==='CB_RPG_API'&&data.body?.action==='chests'){const other=data.body.gps.lng>125.1,base=other?125.2:125,city={id:other?'b':'a',name:other?'City B':'City A',bounds:[11.25,11.28,base-.01,base+.03]},roads=Array.from({length:20},(_,i)=>({lat:11.26+Math.floor(i/6)*.001,lng:base+i%6*.001}));const reply=()=>gameRequest(db,'player-a',data.method,data.body,{worldOwner:async()=> 'owner',resolveCity:async()=>city,cityRoads:async()=>roads}).then(result=>a.w.dispatchEvent(new a.w.MessageEvent('message',{source:a.w,origin:a.w.location.origin,data:{type:'CB_RPG_REPLY',id:data.id,status:200,data:result}})));if(hold)release=reply;else void reply();}else send(data);};
 a.d.querySelector('#hr-room').hidden=true;a.d.querySelector('#rpg-world').hidden=false;a.w.RPGWorld.position=()=>({...fix,time:Date.now()});a.w.RPGWorld.showChests=rows=>markers=rows;
 await a.w.RPGChests.refresh(true);assert.equal(markers.length,7);hold=true;fix.lng=125.2;const pending=a.w.RPGChests.refresh(true);assert.equal(markers.length,0);await pause();assert.ok(release);await release();await pending;assert.equal(markers.length,7);assert.ok(markers.every(p=>p.lng>=125.2));assert.match(a.d.querySelector('#world-chests-bar').textContent,/City B/);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Hero Room and background tabs make no city chest requests',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Quiet City',skill:'punch'});const a=open(db);try{await pause();await pause();a.w.RPGWorld.position=()=>({lat:11.31,lng:124.94,accuracy:5,time:Date.now()});const count=()=>a.messages.filter(m=>m.type==='CB_RPG_API'&&m.body?.action==='chests').length,before=count();await a.w.RPGChests.refresh(true);assert.equal(count(),before);
 a.d.querySelector('#rpg-world').hidden=false;Object.defineProperty(a.d,'hidden',{value:true,configurable:true});await a.w.RPGChests.refresh(true);assert.equal(count(),before);assert.equal([...db.rows.values()].some(r=>r.item_kind==='rpg_chest_city'),false);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Explorer uses a fast cached fix without restarting a slow accurate watch or accepting a late coarse location',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Quick GPS',skill:'punch'}),a=open(db);
 try{await pause();await pause();let watchSuccess,quickSuccess,watches=0;const cleared=[],timers=[],quickOptions=[];const interval=a.w.setInterval;
 a.w.setInterval=(fn,ms)=>{timers.push({fn,ms});return interval(fn,ms);};Object.defineProperty(a.w,'isSecureContext',{value:true,configurable:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(fn){watchSuccess=fn;return ++watches;},getCurrentPosition(fn,error,options){quickSuccess=fn;quickOptions.push(options);},clearWatch(id){cleared.push(id);}},configurable:true});
 a.w.RPGWorld.open(a.w.eval('HEROES[0]'),saved.game);assert.equal(watches,1);assert.equal(quickOptions[0].enableHighAccuracy,false);assert.ok(quickOptions[0].maximumAge<=30000);
 timers.find(t=>t.ms===10000).fn();timers.find(t=>t.ms===10000).fn();assert.deepEqual(cleared,[]);assert.equal(watches,1);
 const now=Date.now();quickSuccess({coords:{latitude:11.26,longitude:125,accuracy:300},timestamp:now-10000});assert.equal(a.w.RPGWorld.position().lat,11.26);assert.equal(a.w.RPGWorld.position().time,now-10000);assert.equal(a.d.querySelector('#world-map-mode').textContent,'GPS ESTIMATE');
 watchSuccess({coords:{latitude:11.261,longitude:125.001,accuracy:5},timestamp:now});assert.equal(a.w.RPGWorld.position().accuracy,5);quickSuccess({coords:{latitude:11.1,longitude:125,accuracy:500},timestamp:now-5000});assert.equal(a.w.RPGWorld.position().lat,11.261);
 a.w.RPGWorld.stop();quickSuccess({coords:{latitude:11.2,longitude:125,accuracy:50},timestamp:Date.now()});assert.equal(a.w.RPGWorld.position(),null);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('chest dialog shows the 50-meter requirement and enables opening only after reaching range',async()=>{
 const a=open(database());try{await pause();await pause();const chest={id:'range-test',kind:'golden',name:'Golden Chest',lat:11.26,lng:125};let distance=51,accuracy=5;a.w.RPGWorld.position=()=>({lat:chest.lat+distance/111195,lng:125,accuracy,time:Date.now()});a.w.RPGChests.open(chest);assert.equal(a.d.querySelector('#chest-open').disabled,true);assert.match(a.d.querySelector('#chest-range').textContent,/opening range 50 m/);distance=49;accuracy=51;a.w.RPGChests.updateRange();assert.equal(a.d.querySelector('#chest-open').disabled,true);accuracy=5;a.w.RPGChests.updateRange();assert.equal(a.d.querySelector('#chest-open').disabled,false);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
