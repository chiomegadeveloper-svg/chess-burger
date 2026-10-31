import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {sellPrice} from '../api/_rpg/merchant.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
import {database} from './helpers/rpg-db.mjs';
import {guildDatabase} from './helpers/rpg-guild-db.mjs';
const pause=()=>new Promise(r=>setTimeout(r,25));
function open(db,services={},transport={}){
 const errors=[],messages=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css-parsing')errors.push(e.message)});
 const html=fs.readFileSync('public/rpg/index.html','utf8').replace('<script src="live-skill-picker.js"></script>','<script>'+fs.readFileSync('public/rpg/live-skill-picker.js','utf8')+'</script>').replace('<script src="live-bootstrap.js"></script>','<script>'+fs.readFileSync('public/rpg/live-bootstrap.js','utf8')+'</script>');
 const dom=new JSDOM(html,{url:'https://chessburger.site/rpg/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.RPGOfflineCombatEnabled=transport.offline===true;w.structuredClone=structuredClone;w.Response=Response;w.fetch=async()=>new Response('{}');
  w.eval(fs.readFileSync('public/rpg/vendor/chess.js','utf8'));w.eval(fs.readFileSync('public/rpg/vendor/battle-core.js','utf8'));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const send=data=>w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data}));
  w.postMessage=data=>{messages.push(data);if(data.type==='CB_RPG_READY')setTimeout(()=>send({type:'CB_RPG_BOOT',userId:'player-a'}),0);if(data.type==='CB_RPG_API')gameRequest(db,'player-a',data.method,data.body,services).then(async result=>{await transport.beforeReply?.(data,result);send({type:'CB_RPG_REPLY',id:data.id,status:200,data:result});}).catch(e=>send({type:'CB_RPG_REPLY',id:data.id,status:e.status||500,data:{error:e.message,...(e.code?{code:e.code}:{})}}));};
 }});
 return {dom,w:dom.window,d:dom.window.document,errors,messages,close:()=>dom.window.close()};
}
test('stationary Explorer updates do not rebuild pins or recenter; projected sprites stay upright and retain click targets',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Fast Explorer',skill:'punch'}),a=open(db);
 try{await pause();await pause();let fix,centers=0,invalidates=0;const clicked=[];
 Object.defineProperty(a.w,'isSecureContext',{value:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(fn){fix=fn;return 1;},getCurrentPosition(){},clearWatch(){}}});
 const map={setView(){centers++;return this;},getZoom:()=>16,on(){},invalidateSize(){invalidates++;},attributionControl:{addAttribution(){}}};
 const marker=(ll,options={})=>{const node=a.d.createElement('div');node.className=options.icon?.className||'';node.innerHTML=options.icon?.html||'';return {addTo(){a.d.querySelector('#world-map').append(node);return this;},remove(){node.remove();},on(event,fn){node.addEventListener(event,fn);return this;},bindTooltip(){return this;},setLatLng(){return this;},setRadius(){return this;},getElement:()=>node};};
 a.w.L={map:()=>map,marker,circle:marker,divIcon:x=>x};a.w.RPGBasemap.create=async()=>({on(){},addTo(){},remove(){}});a.w.RPGChests.refresh=async()=>{};
 const enemies=Array.from({length:16},(_,i)=>({id:'fast-'+i,monsterId:'chaanack',name:'Chaanack',level:1,lat:11.26+(50+i*20)/111195,lng:125,expires_at:Date.now()+1800000}));
 a.w.RPGBattle.spawn=async()=>({encounters:enemies,spawnStatus:'ready',refreshAt:Date.now()+1800000});a.w.RPGBattle.encounter=id=>clicked.push(id);
 a.w.RPGWorld.open(a.w.eval('HEROES[0]'),saved.game);const send=offset=>fix({coords:{latitude:11.26+offset/111195,longitude:125,accuracy:5},timestamp:Date.now()});send(0);await pause();await pause();
 const pins=[...a.d.querySelectorAll('.world-monster-pin')],before=centers;let mutations=0;const observer=new a.w.MutationObserver(rows=>mutations+=rows.length);observer.observe(a.d.querySelector('#world-map'),{subtree:true,attributes:true,childList:true,characterData:true});
 for(let i=0;i<100;i++){send(0);a.w.RPGWorld.encounters(enemies);}await pause();assert.equal(mutations,0);assert.equal(centers,before);
 send(6);await pause();assert.equal(centers,before+1);assert.ok(mutations>0);assert.equal(a.d.querySelector('.world-monster-pin'),pins[0]);pins[0].click();assert.deepEqual(clicked,['fast-0']);
 a.w.RPGWorld.showMerchants([{id:'merchant',name:'Merchant',lat:11.26,lng:125}]);a.w.RPGWorld.showChests([{id:'chest',kind:'golden',name:'Golden Chest',lat:11.26,lng:125}]);
 for(const selector of ['.world-self-pin','.world-monster-pin','.world-merchant-pin','.world-chest-pin']){const billboard=a.d.querySelector(selector+' .world-pin-upright');assert.ok(billboard,selector);assert.equal(a.w.getComputedStyle(billboard).transform,'scaleY(1.41421356237)');}
 assert.equal(a.w.getComputedStyle(a.d.querySelector('#world-map')).transform,'rotateX(45deg)');assert.ok(invalidates<=2);observer.disconnect();assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Hero Room neon meters preserve zero health, update after a real potion, and show capped resources and maximum XP accurately',async()=>{
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,P=(await import('../api/_rpg/src/progression.js')).default,db=database();
 await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Neon Hero',skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;
 C.gainXp(doc.state,P.threshold(7)+244);Object.assign(doc.state,{currentHp:0,currentMp:19,currentAp:24});
 const a=open(db);try{await pause();await pause();
  const meters=()=>[...a.d.querySelectorAll('#hr-current-hp [role="meter"]')];
  assert.deepEqual(meters().map(n=>n.getAttribute('aria-valuenow')),['0','19','24']);
  assert.deepEqual(meters().map(n=>n.querySelector('.hr-meter-percent').textContent),['0%','50%','75%']);
  assert.equal(meters()[0].querySelector('i').style.width,'0%');assert.equal(a.d.querySelector('#hr-xp').value,244);assert.equal(a.d.querySelector('#hr-xp').max,490);assert.equal(a.d.querySelector('#hr-xp-percent').textContent,'50%');
  a.d.querySelector('#hr-drink-potion').click();await pause();await pause();
  assert.equal((await read(db,'player-a')).state.currentHp,9);assert.equal(meters()[0].getAttribute('aria-valuenow'),'9');assert.equal(meters()[0].querySelector('.hr-meter-percent').textContent,'20%');
  const next=structuredClone((await read(db,'player-a')).state);C.gainXp(next,P.threshold(88)-next.totalXp);Object.assign(next,{currentHp:-1,currentMp:9999,currentAp:9999});a.w.RPGRoom.accept(next);
  assert.equal(meters()[0].querySelector('i').style.width,'0%');assert.equal(meters()[1].querySelector('i').style.width,'100%');assert.equal(meters()[2].querySelector('i').style.width,'100%');
  assert.equal(a.d.querySelector('#hr-xp-percent').textContent,'100%');assert.equal(a.d.querySelector('#hr-xp').value,1);assert.equal(a.d.querySelector('#hr-xp').max,1);assert.match(a.d.querySelector('#hr-xp').getAttribute('aria-valuetext'),/maximum level/);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('live portal creates one named hero with two attacks, hides test tools, exits instead of changing hero, and restores cloud hero on reopening',async()=>{
 const db=database(),a=open(db);try{
  await pause();await pause();assert.equal(a.d.querySelector('#live-loading'),null);assert.equal(a.d.querySelectorAll('.live-skill-icon').length,30);assert.equal(a.d.querySelector('select#live-starter'),null);
  a.d.querySelector('#heroName').value='Live Warrior';a.d.querySelector('#saveBtn').click();assert.equal(a.d.querySelector('.live-confirm').open,false);
  a.d.querySelector('.live-skill-open').click();assert.equal(a.d.querySelector('.live-skill-picker').open,true);a.d.querySelector('[data-skill="punch"]').dispatchEvent(new a.w.Event('mouseenter'));assert.match(a.d.querySelector('.live-skill-details').textContent,/Attack damage/);a.d.querySelector('[data-skill="punch"]').click();a.d.querySelector('[data-use]').click();assert.equal(a.d.querySelector('#live-starter').value,'punch');assert.equal(a.d.querySelector('.live-skill-picker').open,false);a.d.querySelector('#saveBtn').click();assert.equal(a.d.querySelector('.live-confirm').open,true);assert.match(a.d.querySelector('.live-confirm p').textContent,/cannot change/);
  a.d.querySelector('[data-confirm]').click();await pause();await pause();assert.equal(a.d.querySelector('#hr-room').hidden,false);assert.equal(a.d.querySelector('.app').hidden,true);assert.match(a.d.querySelector('#hr-class').textContent,/Fire/);assert.equal(a.d.querySelectorAll('.live-skill-icon .rpg-element').length,30);
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
 a.w.RPGWorld.outOfRange(767,false,'merchant');assert.match(popup.textContent,/Merchant too far away/);assert.match(popup.textContent,/merchant.*767 m.*200 meters to trade/);assert.match(popup.textContent,/Trading range/);assert.doesNotMatch(popup.textContent,/attack|monster|battle/i);assert.equal(popup.querySelector('button').getAttribute('aria-label'),'Close trading range message');a.w.RPGWorld.outOfRange(450);assert.match(popup.textContent,/Outside attack range/);assert.match(popup.textContent,/monster.*to battle/);assert.equal(popup.hidden,false);assert.equal(popup.classList.contains('leaving'),false);popup.querySelector('button').click();assert.equal(popup.classList.contains('leaving'),true);a.w.setTimeout=original;
 }finally{a.close();}
});

test('monster tap previews hero versus monster; Run makes no battle and Attack opens combat without needing GPS again',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Preview Warrior',skill:'punch'});
 const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()};
 const batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]});const enemy=batch.encounters[0];enemy.level=1;[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata.encounters[0].level=1;
 const a=open(db);try{await pause();await pause();a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);
 a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;
 await a.w.RPGBattle.encounter(enemy.id);const dialog=a.d.querySelector('.world-encounter-choice');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-hero-name]').textContent,'Preview Warrior');assert.equal(dialog.querySelector('[data-monster-name]').textContent,enemy.name);assert.match(dialog.querySelector('[data-hero]').src,/heroes\/rogue-right/);assert.match(dialog.querySelector('[data-monster]').src,/-100-left/);
 assert.equal((await read(db,'player-a')).battle,undefined);dialog.querySelector('[data-run]').click();assert.equal(dialog.open,false);assert.equal((await read(db,'player-a')).battle,undefined);
 a.w.RPGWorld.position=()=>null;await a.w.RPGBattle.encounter(enemy.id);dialog.querySelector('[data-attack]').click();await pause();await pause();assert.equal(dialog.open,true);assert.match(dialog.querySelector('[data-encounter-status]').textContent,/map location/);assert.equal(a.d.querySelector('#rpg-battle').hidden,true);assert.equal(dialog.querySelector('[data-attack]').disabled,false);assert.equal((await read(db,'player-a')).battle,undefined);dialog.querySelector('[data-run]').click();
 a.w.RPGWorld.position=()=>({...gps,accuracy:500,time:Date.now()});await a.w.RPGBattle.encounter(enemy.id);await pause();await pause();a.w.RPGWorld.position=()=>null;
 let pauses=0,resumes=0;a.w.RPGWorld.pauseForBattle=()=>pauses++;a.w.RPGWorld.resumeAfterBattle=()=>resumes++;
 dialog.querySelector('[data-attack]').click();await pause();await pause();assert.equal(dialog.open,false);assert.equal((await read(db,'player-a')).battle.encounterId,enemy.id);assert.equal(a.d.querySelector('#rpg-battle').hidden,false);assert.equal(a.d.querySelector('#bt-fight').hidden,false);assert.equal(a.d.querySelector('#bt-title').textContent,'Monster encounter');assert.ok(a.d.querySelectorAll('#bt-skills button').length>0);assert.ok(pauses>0);
 const actors=(await read(db,'player-a')).battle.actors;
 for(const [id,actor] of [['bt-own-stats',actors[0]],['bt-enemy-stats',actors[1]]]){assert.equal(a.d.querySelector('#'+id).children.length,6);assert.deepEqual([...a.d.querySelectorAll('#'+id+' b')].map(n=>Number(n.textContent)),actor.stats);}
 for(const img of a.d.querySelectorAll('#bt-skills img,#bt-enemy-skills img'))assert.match(img.getAttribute('src'),/^assets\/skills\/runes\/[a-z_]+\.webp$/);
 assert.equal(a.d.querySelector('#bt-turn-label').parentElement.id,'bt-stage');
 for(const [id,label] of [['bt-ap','CHESS'],['bt-mp','PUZZLE']]){const control=a.d.getElementById(id);assert.equal(control.textContent,label);assert.ok(control.closest('.bt-action-slots'));assert.equal(control.closest('.bt-own'),null);assert.match(control.parentElement.dataset.tooltip,/Harvest/);}
 assert.equal(a.d.querySelector('#bt-stage').parentElement.id,'bt-fx-bar');assert.equal(a.d.querySelector('#bt-skills').children.length,4);assert.deepEqual([...a.d.querySelectorAll('.bt-action-slots button')].map(n=>n.id),['bt-ap','bt-mp','bt-defend','bt-run']);assert.equal(a.d.querySelector('#bt-turn-label').textContent,'Your turn');
 a.d.querySelector('[data-bt-skill="basic"]').click();await pause();await pause();a.d.querySelector('#bt-mp').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-turn-label').parentElement.className,'bt-turn');assert.equal(a.d.querySelector('#bt-run').parentElement.id,'bt-own-actions');assert.equal(a.d.querySelector('#bt-run svg').getAttribute('width'),'20');assert.equal(a.d.querySelector('#bt-run svg').getAttribute('height'),'20');assert.match(a.d.querySelector('#bt-turn-label').textContent,/Puzzle/);
 a.d.querySelector('#bt-abandon').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-turn-label').parentElement.id,'bt-stage');assert.equal(a.d.querySelector('#bt-run').parentElement.id,'bt-run-slot');a.d.querySelector('#bt-harvest-done').click();await pause();await pause();const ply=(await read(db,'player-a')).battle.ply;assert.equal(a.d.querySelector('#bt-defend').disabled,false);a.d.querySelector('#bt-defend').click();await pause();await pause();assert.equal((await read(db,'player-a')).battle.ply,ply+2);
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
  assert.equal(a.w.DamageSprites.sprite(id,hp,facing),hp===0?`assets/death/portraits/${id}-${facing}.webp`:hp>80?`assets/heroes/${id}-${facing}.webp`:`assets/damage/frames/${id}-${hp<=1?1:hp<=20?20:hp<=40?40:hp<=60?60:80}-${facing}.webp`);
 }
 assert.equal(a.w.DamageSprites.sprite('chaanack',40,'right'),'assets/damage/frames/chaanack-40-left.webp');
 }finally{a.close();}
});

test('confirmed attacks change damage sprites at the hit frame and show the selected monster skill during its short reply',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'crusader',name:'Quick Hero',skill:'punch'});
 const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()},batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]}),enemy=batch.encounters[0];
 const a=open(db);try{await pause();await pause();a.w.RPGBattle.connect({id:'crusader',name:'Aurex',stats:[20,4,4,4,20,4]},saved.game);a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;
 await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();
 let impact,finish,release;const queued=[];
 a.w.RPGSkillFX={sequence:async(host,events,options)=>{queued.push(...events);for(const event of events){options.onPrepare?.(event);if(event.side!==0){assert.ok(event.delayMs>=180&&event.delayMs<=300);assert.ok(a.d.querySelector('#bt-enemy-skills .bt-casting'));assert.equal(a.d.querySelector('#bt-turn-label').textContent,'Enemy’s turn');assert.equal(a.d.querySelector('#rpg-battle').dataset.turn,'enemy');}options.onAttack?.(event);if(event.side===0)await new Promise(resolve=>{impact=()=>options.onImpact(event);finish=resolve;});else options.onImpact(event);}},stop(){}};
 const fetch=a.w.fetch;a.w.fetch=(input,options)=>JSON.parse(options?.body||'{}').action==='attack'?new Promise(resolve=>{release=()=>resolve(fetch(input,options));}):fetch(input,options);
 const frame=a.d.querySelector('#bt-fx-bar');assert.equal(a.d.querySelector('#bt-hero-art'),null);assert.equal(a.d.querySelector('#bt-enemy-art'),null);assert.equal(a.d.querySelector('.bt-versus span'),null);assert.equal(a.d.querySelector('#bt-fx-idle').textContent,'');
 assert.ok(frame.contains(a.d.querySelector('#bt-fx-hero')));assert.ok(frame.contains(a.d.querySelector('#bt-fx-enemy')));assert.match(a.d.querySelector('#bt-fx-enemy').src,/assets\/idle\//);assert.ok(a.d.querySelector('#bt-fx-enemy').parentElement.classList.contains('is-health'));
 const beforeImpact=a.d.querySelector('#bt-fx-enemy').alt;const button=a.d.querySelector('[data-bt-skill="basic"]');assert.equal(button.textContent,'◇');assert.equal(button.querySelectorAll('img').length,1);assert.equal(button.querySelector('.rpg-element').getAttribute('aria-label'),'Neutral element');assert.match(button.getAttribute('aria-label'),/Basic Tackle.*4 AP.*2 MP.*Damage/);
 button.click();assert.equal(queued.length,0);assert.ok(a.d.querySelector('#rpg-battle').classList.contains('bt-hero-windup'));assert.equal(a.d.querySelector('#bt-fx-enemy').alt,beforeImpact);
 release();await pause();await pause();assert.equal(queued.filter(e=>e.side===0).length,1);assert.equal(a.d.querySelector('#bt-fx-enemy').alt,beforeImpact);
 impact();assert.equal(Number(a.d.querySelector('#bt-fx-enemy').parentElement.dataset.health),a.w.RPGCharacterHealth.stage((await read(db,'player-a')).battle.actors[1].hp,(await read(db,'player-a')).battle.actors[1].maxHp));assert.ok(queued.every(e=>e.persistentFighters));assert.ok(a.d.querySelector('#bt-fx-enemy').alt.endsWith(`${(await read(db,'player-a')).battle.actors[1].hp} health`));finish();await pause();await pause();assert.equal(queued.filter(e=>e.side===0).length,1);assert.equal(a.d.querySelectorAll('#bt-skills strong,#bt-skills small,#bt-skills em').length,0);
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
 for(const img of a.d.querySelectorAll('#hr-active img,#hr-spell-storage img,.live-skill-icon img'))assert.match(img.getAttribute('src'),/assets\/skills\/runes\/[a-z_]+\.webp$/);
 const callbacks=[],cleared=[];Object.defineProperty(a.w,'isSecureContext',{value:true,configurable:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(success){callbacks.push(success);return callbacks.length;},clearWatch(id){cleared.push(id);}},configurable:true});
 a.w.RPGBattle.spawn=async()=>({encounters:[],spawnStatus:'ready',refreshAt:Date.now()+1800000});
 a.w.RPGWorld.open(a.w.eval('HEROES.find(h=>h.id==="crusader")'),saved.game);assert.equal(callbacks.length,1);assert.equal(a.d.querySelector('.world-location-buttons').hidden,true);assert.equal(a.d.querySelector('#world-gps').tabIndex,-1);assert.equal(a.d.querySelector('#world-share').tabIndex,-1);
 for(const img of a.d.querySelectorAll('#world-attacks img'))assert.match(img.getAttribute('src'),/assets\/skills\/runes\/[a-z_]+\.webp$/);
 const fix=()=>({coords:{latitude:11.26,longitude:125,accuracy:40},timestamp:Date.now()});callbacks[0](fix());await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));
 Object.defineProperty(a.w.navigator,'onLine',{value:false,configurable:true});a.w.dispatchEvent(new a.w.Event('offline'));await pause();assert.equal(await read(db,'player-a','rpg_presence','live'),null);
 Object.defineProperty(a.w.navigator,'onLine',{value:true,configurable:true});a.w.dispatchEvent(new a.w.Event('online'));assert.equal(callbacks.length,2);callbacks[1](fix());await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));
 a.w.RPGWorld.pauseForBattle();await pause();assert.equal(await read(db,'player-a','rpg_presence','live'),null);callbacks[1](fix());await pause();assert.equal(await read(db,'player-a','rpg_presence','live'),null);
 a.w.RPGWorld.resumeAfterBattle();assert.equal(callbacks.length,3);callbacks[2](fix());await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));assert.ok(cleared.includes(2));a.w.RPGWorld.stop();
 }finally{a.close();}
});


test('harvest result appears before the enemy reply animation and premove survives an AI turn',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Chess Tester',skill:'punch'}),gps={lat:11.26,lng:125,accuracy:40,time:Date.now()};
 const batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.26,lng:125}]}),enemy=batch.encounters[0],a=open(db);enemy.level=1;[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata.encounters[0].level=1;
 try{await pause();await pause();a.w.RPGBattle.connect({id:'rogue',name:'Tester',stats:[20,4,4,4,20,4]},saved.game);a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();a.d.querySelector('[data-bt-skill="basic"]').click();await pause();await pause();
 let reply;a.w.Worker=class{postMessage(command){if(command==='uci')setTimeout(()=>this.onmessage({data:'uciok'}),0);if(command==='isready')setTimeout(()=>this.onmessage({data:'readyok'}),0);if(command.startsWith('go '))reply=()=>this.onmessage({data:'bestmove e7e5'});}terminate(){}};
 // Use regular engine search, rather than the low-Elo random mistake branch.
 a.w.Math.random=()=>.99;a.d.querySelector('#bt-ap').click();await pause();await pause();
 const tap=square=>a.d.querySelector(`[data-bt-square="${square}"]`).click();tap('e2');tap('e4');await pause();await pause();assert.ok(reply);tap('g1');tap('f3');assert.match(a.d.querySelector('#bt-chess-status').textContent,/Premove queued/);reply();await pause();await pause();await pause();const doc=await read(db,'player-a');assert.deepEqual(doc.battle.challenge.moves.slice(0,3),['e2e4','e7e5','g1f3']);
 let animation=0;a.w.RPGSkillFX={sequence:async()=>{animation++;},stop(){}};a.d.querySelector('#bt-abandon').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,false);assert.equal(animation,0);a.d.querySelector('#bt-harvest-done').click();await pause();assert.ok(animation>0);
 }finally{a.close();}
});


test('Hero Inventory uses potion context actions without an avatar and preserves consumable-only details',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Potion User',skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.currentHp=1;doc.state.currentMp=2;doc.state.currentAp=1;
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,mp={uid:'mana-use',defId:'mana_potion',rotation:0,rotated:false,...C.rollItem(C.itemMap.mana_potion,1,()=>0,{rarity:'rare'})};C.place(doc.state,mp,'bag',0,0);const ap={uid:'ap-use',defId:'cyan_spark',rotation:0,rotated:false,...C.rollItem(C.itemMap.cyan_spark,1,()=>0,{rarity:'common'})};C.place(doc.state,ap,'bag',1,0);const hp=doc.state.items.find(i=>i.defId==='health_potion');
 const a=open(db);try{await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();
 assert.equal(a.d.querySelector('#hr-character-page').hidden,true);assert.equal(a.d.querySelector('#hr-inventory-page .hr-hero-scene'),null);
 const use=async uid=>{const node=a.d.querySelector(`[data-uid="${uid}"]`);node.focus();assert.match(a.d.querySelector('#hr-item-tooltip').textContent,/Consumable.*Restores 20/);assert.doesNotMatch(a.d.querySelector('#hr-item-tooltip').textContent,/Enhancement|Insight|Base attributes|Requires level/i);node.click();a.d.querySelector('[data-item-action="consume"]').click();await pause();await pause();};
 await use(hp.uid);let saved=await read(db,'player-a');assert.equal(saved.state.currentHp,5);assert.equal(C.quantity(saved.state.items.find(i=>i.uid===hp.uid)),2);
 await use(mp.uid);saved=await read(db,'player-a');assert.equal(saved.state.currentMp,6);assert.equal(saved.state.items.some(i=>i.uid===mp.uid),false);await use(ap.uid);saved=await read(db,'player-a');assert.equal(saved.state.currentAp,5);assert.equal(saved.state.items.some(i=>i.uid===ap.uid),false);assert.match(a.d.querySelector('#hr-feedback').textContent,/Attack Points/);assert.equal(a.messages.filter(m=>m.body?.action==='usePotion').length,3);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('battle bag potion drag uses one turn, empties its slot and presents enemy damage after the potion heal',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Battle Potion',skill:'punch'});const C=(await import('../api/_rpg/src/inventory-core.js')).default,doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.currentHp=5;doc.state.currentMp=3;const potion=doc.state.items[0];C.place(doc.state,potion,'bag',0,0);
 const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()},batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.26,lng:125}]}),enemy=batch.encounters[0],a=open(db);enemy.level=1;[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata.encounters[0].level=1;
 try{await pause();await pause();a.w.RPGBattle.connect({id:'assassin',name:'Assassin',heroClass:'Rogue',stats:[20,4,4,4,20,4]},(await read(db,'player-a')).state);a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();
 const bag=a.d.querySelector(`#bt-bag [data-item-uid="${potion.uid}"]`),root=a.d.querySelector('#rpg-battle'),frame=a.d.querySelector('#bt-fx-hero').parentElement;assert.ok(bag);root.setPointerCapture=()=>{};root.hasPointerCapture=()=>false;frame.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100});
 let impact,release;a.w.RPGSkillFX={sequence:async(host,events,options)=>{assert.equal(host.id,'bt-fx-bar');assert.equal(events.length,1);options.onPrepare?.(events[0]);await new Promise(resolve=>{release=resolve;impact=()=>options.onImpact(events[0]);});},stop(){}};
 const send=(target,type,x,y)=>{const event=new a.w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:2},pointerType:{value:'mouse'}});target.dispatchEvent(event);};send(bag,'pointerdown',200,200);send(root,'pointermove',50,50);assert.equal(frame.classList.contains('bt-potion-target'),true);send(root,'pointerup',50,50);await pause();await pause();assert.ok(a.d.querySelector('#bt-fx-hero').alt.endsWith('9 health'));assert.equal(a.d.querySelector(`#bt-bag [data-item-uid="${potion.uid}"] .hr-stack-count`).textContent,'2');impact();release();await pause();await pause();const saved=await read(db,'player-a');assert.equal(saved.battle.ply,2);assert.ok(a.d.querySelector('#bt-fx-hero').alt.endsWith(`${saved.battle.actors[0].hp} health`));assert.equal(a.messages.filter(m=>m.body?.action==='usePotion').length,1);assert.equal(a.d.querySelector('#bt-close').closest('#bt-own-actions')?.id,'bt-own-actions');assert.equal(a.d.querySelector('.bt-action-slots').children.length,4);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('saved harvest feedback stays closed after RPG reopening while a new harvest still shows immediately',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'No Replay',skill:'punch'}),row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;row.state.currentMp=2;const gps={lat:11.26,lng:125,accuracy:40,time:Date.now()},batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.26,lng:125}]});[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata.encounters[0].level=1;let result=await gameRequest(db,'player-a','POST',{action:'encounter',target:batch.encounters[0].id,gps});result=await gameRequest(db,'player-a','POST',{action:'harvest',resource:'mp',version:result.battle.version});await gameRequest(db,'player-a','POST',{action:'abandon',version:result.battle.version});
 const a=open(db);try{await pause();await pause();a.d.querySelector('#rpg-world').hidden=false;a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,true);a.d.querySelector('#bt-mp').click();await pause();await pause();a.d.querySelector('#bt-abandon').click();await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,false);a.d.querySelector('#bt-harvest-done').click();await pause();a.w.RPGBattle.stop();a.d.querySelector('#rpg-world').hidden=false;a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);await pause();await pause();assert.equal(a.d.querySelector('#bt-harvest-modal').hidden,true);assert.deepEqual(a.errors,[]);}finally{a.close();}
 const reopened=open(db);try{await pause();await pause();reopened.d.querySelector('#rpg-world').hidden=false;reopened.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);await pause();await pause();assert.equal(reopened.d.querySelector('#bt-harvest-modal').hidden,true);}finally{reopened.close();}
});

test('returning from the bag immediately restores the last GPS fix and refreshes pinned encounters and player presence',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Bag Return',skill:'punch'}),a=open(db);
 try{await pause();await pause();const callbacks=[],intervals=[];Object.defineProperty(a.w,'isSecureContext',{value:true,configurable:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(success){callbacks.push(success);return callbacks.length;},clearWatch(){}},configurable:true});const original=a.w.setInterval;a.w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return original(fn,ms);};const pins=new Set(),map={setView(){return this;},getZoom(){return 16;},on(){},invalidateSize(){},attributionControl:{addAttribution(){}}},marker=()=>({addTo(){pins.add(this);return this;},remove(){pins.delete(this);},on(){return this;},bindTooltip(){return this;},setLatLng(){return this;},setRadius(){return this;}});a.w.L={map:()=>map,marker,circle:marker,divIcon:x=>x};a.w.RPGBasemap.create=async()=>({on(){},addTo(){},remove(){}});let discovers=0;a.w.RPGBattle.spawn=async()=>{discovers++;return {encounters:[{id:'pinned',monsterId:'chaanack',name:'Chaanack',level:1,lat:11.26,lng:125,expires_at:Date.now()+1800000}],spawnStatus:'ready',refreshAt:Date.now()+1800000};};const hero=a.w.eval('HEROES[0]');a.w.RPGWorld.open(hero,saved.game);callbacks[0]({coords:{latitude:11.26,longitude:125,accuracy:5},timestamp:Date.now()});await pause();await pause();assert.ok(await read(db,'player-a','rpg_presence','live'));a.d.querySelector('#world-bag-open').click();assert.equal(a.d.querySelector('#rpg-world').hidden,true);assert.equal(a.w.RPGWorld.position(),null);a.w.RPGWorld.open(hero,saved.game);assert.equal(a.w.RPGWorld.position().lat,11.26);assert.equal(callbacks.length,2);assert.ok(pins.size>=3,'hero, range and monster pins restore before a new GPS fix');await pause();await pause();assert.ok(discovers>=2);assert.ok(await read(db,'player-a','rpg_presence','live'));assert.ok(intervals.some(i=>i.ms===5000));intervals.filter(i=>i.ms===5000).at(-1).fn();assert.equal(a.w.RPGWorld.position().lng,125);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Map merchant shows 28 daily gear items, purchases with account CBG, and sells an owned item by dragging onto merchant tiles',async()=>{
 const db=database();let balance=5000;const from=db.from.bind(db);db.from=table=>table==='cb_profiles'?{select(){return this;},eq(){return this;},async maybeSingle(){return {data:{gold_points:balance},error:null};}}:from(table);db.rpc=async(_name,p)=>{const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile'),old=row.metadata;if(p.p_request_id===null)return {data:old,error:null};if(old.revision!==p.p_revision)return {error:{message:'inventory changed'}};if(balance+p.p_delta<0)return {error:{message:'Not enough CBG'}};balance+=p.p_delta;row.metadata={...structuredClone(p.p_document),revision:old.revision+1};row.metadata.state.cbg=balance;return {data:row.metadata,error:null};};await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Shopper',skill:'punch'});const a=open(db,{merchantVisit:async()=>({id:'test',city:'Test Town'})});try{await pause();await pause();assert.equal(a.d.querySelector('#hr-shop'),null);a.w.RPGWorld.position=()=>({lat:11.26,lng:125,accuracy:5,time:Date.now()});a.w.RPGMerchant.open((await read(db,'player-a')).state,{id:'test'});await pause();await pause();assert.equal(a.d.querySelector('#rpg-merchant').open,true);assert.equal(a.d.querySelectorAll('#merchant-stock [data-offer]').length,28);assert.equal(a.d.querySelector('#merchant-balance').textContent,'5,000');a.d.querySelector('[data-offer="health_potion"]').click();a.d.querySelector('[data-trade]').click();await pause();await pause();assert.equal(balance,4959);assert.match(a.d.querySelector('#merchant-status').textContent,/Purchased/);assert.equal(a.d.querySelectorAll('#merchant-potions [data-offer]').length,12);const potionTiles=[...a.d.querySelectorAll('#merchant-potions [data-offer]')];assert.ok(potionTiles.every(tile=>tile.children.length===1&&tile.firstElementChild.tagName==='IMG'&&tile.textContent===''));const hoverTile=a.d.querySelector('[data-offer="mana_potion"]');hoverTile.focus();assert.equal(a.d.querySelector('#merchant-potion-tooltip').hidden,false);assert.match(a.d.querySelector('#merchant-potion-tooltip').textContent,/Azure Dew Potion.*\nConsumable.*20%.*Mana.*1 × 1 tiles.*\n41 CBG/);a.d.querySelector('#merchant-potions').dispatchEvent(new a.w.Event('scroll'));assert.equal(a.d.querySelector('#merchant-potion-tooltip').hidden,false);hoverTile.blur();assert.equal(a.d.querySelector('#merchant-potion-tooltip').hidden,true);potionTiles[0].dispatchEvent(new a.w.MouseEvent('pointerover',{bubbles:true}));assert.equal(a.d.querySelector('#merchant-potion-tooltip').hidden,false);assert.match(a.d.querySelector('#merchant-potion-tooltip').textContent,/Normal Potion/);potionTiles[0].dispatchEvent(new a.w.MouseEvent('pointerout',{bubbles:true}));assert.equal(a.d.querySelector('#merchant-potion-tooltip').hidden,true);a.d.querySelector('[data-offer="tuba_wine_potion"]').click();const quantity=a.d.querySelector('#merchant-quantity');quantity.value='2';quantity.dispatchEvent(new a.w.Event('input',{bubbles:true}));assert.match(a.d.querySelector('[data-trade]').textContent,/322 CBG/);a.d.querySelector('[data-trade]').click();await pause();await pause();assert.equal(balance,4637);assert.equal((await read(db,'player-a')).state.items.filter(i=>i.defId==='tuba_wine_potion').reduce((n,i)=>n+(i.quantity??1),0),2);const owned=a.d.querySelector('#merchant-bag [data-sell-uid]'),dialog=a.d.querySelector('#rpg-merchant'),target=a.d.querySelector('#merchant-stock');assert.ok(owned);dialog.setPointerCapture=()=>{};dialog.hasPointerCapture=()=>false;target.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100});const send=(node,type,x,y)=>{const event=new a.w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:7},pointerType:{value:'mouse'}});node.dispatchEvent(event);};const uid=owned.dataset.sellUid,afterSale=balance+sellPrice((await read(db,'player-a')).state.items.find(i=>i.uid===uid),1)*((await read(db,'player-a')).state.items.find(i=>i.uid===uid).quantity??1);send(owned,'pointerdown',200,200);send(dialog,'pointermove',50,50);send(dialog,'pointerup',50,50);await pause();await pause();assert.equal(balance,afterSale);assert.equal((await read(db,'player-a')).state.items.some(i=>i.uid===uid),false);assert.match(a.d.querySelector('#merchant-status').textContent,/Sold/);a.d.querySelector('[data-offer="mana_potion"]').click();const qty=a.d.querySelector('#merchant-quantity');qty.value='3';qty.dispatchEvent(new a.w.Event('input',{bubbles:true}));assert.match(a.d.querySelector('[data-trade]').textContent,/123 CBG/);a.d.querySelector('[data-trade]').click();await pause();await pause();assert.equal(balance,afterSale-123);const before=(await read(db,'player-a')).state.items.length,drop=a.d.querySelector('#merchant-bag');drop.getBoundingClientRect=()=>({left:0,top:0,right:100,bottom:100});send(a.d.querySelector('[data-offer="health_potion"]'),'pointerdown',200,200);send(dialog,'pointermove',50,50);send(dialog,'pointerup',50,50);await pause();await pause();assert.equal(balance,afterSale-164);assert.equal((await read(db,'player-a')).state.items.length,before+1);a.d.querySelector('#merchant-bag-upgrade').click();await pause();await pause();assert.equal(balance,afterSale-164-488);assert.equal((await read(db,'player-a')).state.grids.bag.rows,8);assert.deepEqual(a.errors,[]);}finally{a.close();}
});

test('autosave retains a pending inventory edit during a network failure, retries on reconnect, and restores the saved layout on reopening',async()=>{const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Auto Save',skill:'punch'});const a=open(db);try{await pause();await pause();assert.equal(a.d.querySelector('#hr-save').hidden,true);const send=a.w.postMessage;let fail=true;a.w.postMessage=data=>{if(fail&&data.type==='CB_RPG_API'&&data.body?.action==='save'){fail=false;setTimeout(()=>a.w.dispatchEvent(new a.w.MessageEvent('message',{source:a.w,origin:a.w.location.origin,data:{type:'CB_RPG_REPLY',id:data.id,status:503,data:{error:'Network interrupted'}}})),0);}else send(data);};const state=structuredClone((await read(db,'player-a')).state);state.active=['punch','basic',null,null];a.w.RPGLive.save(state);await a.w.RPGLive.flush();assert.equal(a.d.querySelector('#rpg-autosave-status').textContent,'Save pending');assert.ok(a.w.localStorage.getItem('chessburger_rpg_pending_player-a'));a.w.dispatchEvent(new a.w.Event('online'));await pause();await pause();assert.equal(a.d.querySelector('#rpg-autosave-status').textContent,'Saved');assert.equal(a.w.localStorage.getItem('chessburger_rpg_pending_player-a'),null);assert.deepEqual((await read(db,'player-a')).state.active,['punch','basic',null,null]);assert.deepEqual(a.errors,[]);}finally{a.close();}const b=open(db);try{await pause();await pause();assert.match(b.d.querySelector('#hr-active [data-slot-index="0"]').getAttribute('aria-label'),/Super Punch/);}finally{b.close();}});

test('Explorer reads wait for the newest coalesced bag save, preventing an older stash snapshot from replacing equipment',async()=>{const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Bag Sync',skill:'punch'});const a=open(db);try{await pause();await pause();await a.w.RPGLive.flush();const send=a.w.postMessage;let release,held=false;a.w.postMessage=data=>{if(!held&&data.type==='CB_RPG_API'&&data.body?.action==='save'){held=true;release=()=>send(data);}else send(data);};const initial=structuredClone((await read(db,'player-a')).state);initial.active=['punch','basic',null,null];const equipped=structuredClone(initial),potion=equipped.items[0],C=a.w.RPGInventory;C.place(equipped,potion,'bag',2,2);a.w.RPGLive.save(initial);a.w.RPGLive.save(equipped);const before=a.messages.length,reading=a.w.fetch('/api/battle');await pause();assert.ok(release);assert.equal(a.messages.slice(before).some(m=>m.type==='CB_RPG_API'&&m.method==='GET'),false);release();const result=await (await reading).json();assert.equal(result.game.items.find(i=>i.uid===potion.uid).where,'bag');assert.equal((await read(db,'player-a')).state.items.find(i=>i.uid===potion.uid).where,'bag');assert.equal(JSON.parse(a.w.localStorage.getItem(a.w.RPGLive.key('rogue'))).items.find(i=>i.uid===potion.uid).where,'bag');assert.deepEqual(a.errors,[]);}finally{a.close();}const b=open(db);try{await pause();await pause();assert.equal(b.d.querySelectorAll('#hr-bag .hr-item').length,1);assert.equal(b.d.querySelectorAll('#hr-stash .hr-item').length,0);b.d.querySelector('#hr-explore').click();await pause();await pause();assert.equal(b.d.querySelectorAll('#world-bag .world-bag-item').length,1);assert.equal(b.d.querySelector('#world-exit').parentElement.className,'world-sidebar');}finally{b.close();}});

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

test('Skill Book hover and touch previews show details and animate without spending a skill choice',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Rune Reader',skill:'punch'});
 const a=open(db);try{await pause();await pause();const plays=[],stops=[];a.w.RPGSkillFX={play:(host,id)=>plays.push(id),stop:host=>stops.push(host.id)};
 a.d.querySelector('#hr-learn').click();const pop=a.d.querySelector('#hr-skill-popover'),list=a.d.querySelector('#hr-learn-list');assert.equal(pop.hidden,true);assert.equal(plays.length,0);
 const known=list.querySelector('[data-learn="basic"]');assert.equal(known.disabled,false);known.dispatchEvent(new a.w.MouseEvent('pointerover',{bubbles:true}));
 assert.equal(pop.hidden,false);assert.equal(plays.at(-1),'basic');assert.equal(a.d.querySelector('#hr-skill-preview-name').textContent,'Basic Tackle');assert.match(a.d.querySelector('#hr-skill-preview-detail').textContent,/4 AP \/ 2 MP.*0 turn cooldown.*38% Attack/);assert.match(a.d.querySelector('#hr-skill-preview-description').textContent,/shoulder/);assert.equal(a.d.querySelector('#hr-skill-preview-choose').disabled,true);
 const fire=list.querySelector('[data-learn="fireball"]');fire.focus();assert.equal(plays.at(-1),'fireball');assert.equal(known.hasAttribute('aria-describedby'),false);assert.equal(fire.hasAttribute('aria-describedby'),true);
 fire.getBoundingClientRect=()=>({left:100,right:180,top:100,bottom:180,width:80,height:80});list.getBoundingClientRect=()=>({top:20,bottom:600});list.dispatchEvent(new a.w.Event('scroll'));assert.equal(pop.hidden,false,'keyboard scrolling keeps the focused rune preview visible');
 a.d.querySelector('#hr-skill-replay').click();assert.equal(plays.at(-1),'fireball');
 fire.dispatchEvent(new a.w.MouseEvent('pointerout',{bubbles:true,relatedTarget:a.d.body}));await new Promise(r=>setTimeout(r,210));assert.equal(pop.hidden,true);assert.equal(stops.at(-1),'hr-skill-fx');
 known.click();assert.equal(pop.hidden,false);assert.equal(a.d.querySelector('#hr-skill-confirm').open,false);assert.equal((await read(db,'player-a')).state.learnCredits,0);
 a.d.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(pop.hidden,true);assert.equal(a.d.querySelector('#hr-learn-modal').hidden,false);
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,P=(await import('../api/_rpg/src/progression.js')).default,row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');C.gainXp(row.metadata.state,P.threshold(2));a.w.RPGRoom.accept(structuredClone(row.metadata.state));a.d.querySelector('#hr-skill-category').dispatchEvent(new a.w.Event('change'));
 const next=list.querySelector('[data-can-learn="true"]'),touch=new a.w.Event('pointerdown',{bubbles:true});Object.defineProperty(touch,'pointerType',{value:'touch'});next.dispatchEvent(touch);next.click();assert.equal(pop.hidden,false);assert.equal(a.d.querySelector('#hr-skill-confirm').open,false);assert.equal(a.d.querySelector('#hr-skill-preview-choose').disabled,false);
 a.d.querySelector('#hr-skill-preview-choose').click();assert.equal(pop.hidden,true);assert.equal(a.d.querySelector('#hr-skill-confirm').open,true);assert.equal((await read(db,'player-a')).state.learnCredits,1);
 a.d.querySelector('#hr-skill-cancel').click();a.d.querySelector('#hr-learn-modal [data-close-modal]').click();assert.equal(pop.hidden,true);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Skill Book glows for unspent choices; Cancel keeps the choice and Activate learns and equips only the confirmed rune',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Skill Student',skill:'punch'});
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,P=(await import('../api/_rpg/src/progression.js')).default;
 const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');C.gainXp(row.metadata.state,P.threshold(4));
 const a=open(db);try{await pause();await pause();assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),true);
 a.d.querySelector('#hr-learn').click();const candidates=[...a.d.querySelectorAll('[data-learn][data-can-learn="true"]')].map(n=>n.dataset.learn),first=candidates[0],second=candidates[1];
 a.d.querySelector(`[data-learn="${first}"]`).click();assert.equal(a.d.querySelector('#hr-skill-confirm').open,true);assert.equal((await read(db,'player-a')).state.learned.includes(first),false);
 a.d.querySelector('#hr-skill-cancel').click();await pause();assert.equal(a.d.querySelector('#hr-learn-modal').hidden,false);assert.equal((await read(db,'player-a')).state.learnCredits,2);
 a.d.querySelector(`[data-learn="${second}"]`).click();a.d.querySelector('#hr-skill-activate').click();await pause();await a.w.RPGLive.flush();let saved=await read(db,'player-a');assert.equal(saved.state.learned.includes(first),false);assert.equal(saved.state.active[2],second);assert.equal(saved.state.learnCredits,1);assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),true);
 a.d.querySelector('#hr-learn').click();a.d.querySelector(`[data-learn="${first}"]`).click();a.d.querySelector('#hr-skill-activate').click();await pause();await a.w.RPGLive.flush();saved=await read(db,'player-a');assert.equal(saved.state.active[3],first);assert.equal(saved.state.learnCredits,0);assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),false);
 // A later level reward makes the book glow again. Full loadouts require an explicit replacement.
 const current=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');C.gainXp(current.metadata.state,P.threshold(6));a.w.RPGRoom.accept(structuredClone(current.metadata.state));assert.equal(a.d.querySelector('#hr-learn').classList.contains('skill-ready'),true);
 a.d.querySelector('#hr-learn').click();const third=a.d.querySelector('[data-learn][data-can-learn="true"]').dataset.learn;a.d.querySelector(`[data-learn="${third}"]`).click();assert.equal(a.d.querySelector('#hr-skill-activate').disabled,true);assert.equal(a.d.querySelector('#hr-skill-confirm-slots').hidden,false);
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
 timers.find(t=>t.ms===5000).fn();timers.find(t=>t.ms===5000).fn();assert.deepEqual(cleared,[]);assert.equal(watches,1);
 const now=Date.now();quickSuccess({coords:{latitude:11.26,longitude:125,accuracy:300},timestamp:now-10000});assert.equal(a.w.RPGWorld.position().lat,11.26);assert.equal(a.w.RPGWorld.position().time,now-10000);assert.equal(a.d.querySelector('#world-map-mode').textContent,'GPS ESTIMATE');
 watchSuccess({coords:{latitude:11.261,longitude:125.001,accuracy:5},timestamp:now});assert.equal(a.w.RPGWorld.position().accuracy,5);quickSuccess({coords:{latitude:11.1,longitude:125,accuracy:500},timestamp:now-5000});assert.equal(a.w.RPGWorld.position().lat,11.261);
 a.w.RPGWorld.stop();quickSuccess({coords:{latitude:11.2,longitude:125,accuracy:50},timestamp:Date.now()});assert.equal(a.w.RPGWorld.position(),null);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('chest dialog shows the 50-meter requirement and enables opening only after reaching range',async()=>{
 const a=open(database());try{await pause();await pause();const chest={id:'range-test',kind:'golden',name:'Golden Chest',lat:11.26,lng:125};let distance=51,accuracy=5;a.w.RPGWorld.position=()=>({lat:chest.lat+distance/111195,lng:125,accuracy,time:Date.now()});a.w.RPGChests.open(chest);assert.equal(a.d.querySelector('#chest-open').disabled,true);assert.match(a.d.querySelector('#chest-range').textContent,/opening range 50 m/);distance=49;accuracy=51;a.w.RPGChests.updateRange();assert.equal(a.d.querySelector('#chest-open').disabled,true);accuracy=5;a.w.RPGChests.updateRange();assert.equal(a.d.querySelector('#chest-open').disabled,false);assert.deepEqual(a.errors,[]);}finally{a.close();}
});

test('monster recovery turns show visible feedback instead of silently skipping the response',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'crusader',name:'Recovery Hero',skill:'punch'}),gps={lat:11.26,lng:125,accuracy:40,time:Date.now()};
 const batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]}),enemy=batch.encounters[0],a=open(db);
 try{await pause();await pause();a.w.RPGBattle.connect({id:'crusader',name:'Aurex',stats:[20,4,4,4,20,4]},saved.game);a.w.RPGWorld.position=()=>({...gps,time:Date.now()});a.w.RPGWorld.monster=()=>enemy;
 await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();
 const row=[...db.rows.values()].find(r=>r.user_id==='player-a'&&r.item_kind==='rpg_profile');row.metadata.battle.actors[1].ap=0;row.metadata.battle.actors[1].mp=0;
 let response;a.w.RPGSkillFX={sequence:async(host,events,options)=>{for(const event of events){options.onPrepare?.(event);if(event.kind){response=event;options.onAction?.(event);}else{options.onAttack?.(event);options.onImpact?.(event);}}},stop(){}};
 a.d.querySelector('[data-bt-skill="basic"]').click();await pause();await pause();await pause();assert.equal(response.kind,'defend');assert.match(a.d.querySelector('#bt-notice').textContent,/defends.*AP.*MP/);assert.ok(a.d.querySelector('#rpg-battle').classList.contains('bt-has-notice'));assert.ok(!a.d.querySelector('#bt-own-vitals').textContent.includes('NaN'));assert.equal((await read(db,'player-a')).battle.turn,0);
 }finally{a.close();}
});

test('crossing towns clears all encounter types and blocks delayed monster results from the previous town',async()=>{
 const db=database();const saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Map Traveller',skill:'punch'}),a=open(db);
 try{await pause();await pause();let fix={lat:11.26,lng:125,accuracy:5,time:Date.now()},chests=[],release;
 a.w.RPGWorld.position=()=>fix;a.w.RPGWorld.showChests=rows=>chests=rows;
 const town={id:'town-a',name:'Town A',bounds:[11.25,11.28,124.99,125.02]},merchant={id:'merchant-a',name:'Merchant',lat:11.26,lng:125};
 a.d.querySelector('#hr-room').hidden=true;a.d.querySelector('#rpg-world').hidden=false;
 a.w.RPGWorld.applyCity(town,[merchant]);a.w.RPGWorld.encounters([{id:'old-monster',monsterId:'chaanack',name:'Chaanack',level:1,lat:11.26,lng:125,expires_at:Date.now()+1800000}]);a.w.RPGWorld.showChests([{id:'old-chest'}]);assert.equal(a.w.RPGWorld.merchants().length,1);assert.ok(a.w.RPGWorld.monster('old-monster'));
 a.w.RPGMerchant.open(saved.game,merchant);fix={...fix,lat:11.3};a.w.RPGWorld.checkCity();assert.equal(a.w.RPGWorld.cityPending(),true);assert.equal(a.w.RPGWorld.merchants().length,0);assert.equal(a.w.RPGWorld.monster('old-monster'),undefined);assert.equal(chests.length,0);assert.equal(a.d.querySelector('#rpg-merchant').open,false);
 const next={id:'town-b',name:'Town B',bounds:[11.29,11.32,124.99,125.02]};assert.equal(a.w.RPGWorld.applyCity(town,[merchant]),false);a.w.RPGWorld.applyCity(next,[{...merchant,id:'merchant-b',lat:11.3}]);assert.equal(a.w.RPGWorld.cityPending(),false);assert.equal(a.w.RPGWorld.merchants()[0].id,'merchant-b');
 }finally{a.close();}
});

test('ATTACK uses a cached map location without fetching device GPS or a preview ticket',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Reach Test',skill:'punch'}),gps={lat:11.26,lng:125,accuracy:5,time:Date.now()};
 const batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]}),enemy=batch.encounters[0],a=open(db);
 try{
  await pause();await pause();a.w.RPGBattle.connect({id:'assassin',name:'Morvex',stats:[20,4,4,4,20,4]},saved.game);a.w.RPGWorld.position=()=>({...gps,time:Date.now()-120000});a.w.RPGWorld.monster=()=>enemy;
  let gpsRequests=0;a.w.RPGWorld.freshPosition=()=>{gpsRequests++;throw Error('Must not fetch GPS');};
  const original=a.w.fetch;a.w.fetch=(url,options)=>JSON.parse(options?.body||'{}').action==='select-encounter'?Promise.resolve(new a.w.Response(JSON.stringify({error:'Your game changed in another window. Refresh and try again.'}),{status:409})):original(url,options);
  await a.w.RPGBattle.encounter(enemy.id);await pause();await pause();const dialog=a.d.querySelector('.world-encounter-choice');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-encounter-status]').textContent,'');a.w.RPGWorld.position=()=>null;
  dialog.querySelector('[data-attack]').click();await pause();await pause();assert.equal(dialog.open,false);assert.equal(a.d.querySelector('#rpg-battle').hidden,false);assert.equal((await read(db,'player-a')).battle.encounterId,enemy.id);
  assert.equal(gpsRequests,0);assert.ok(!a.messages.some(m=>m.type==='CB_RPG_API'&&m.body.action==='select-encounter'));const call=a.messages.find(m=>m.type==='CB_RPG_API'&&m.body.action==='encounter');assert.ok(call.body.gps);assert.equal(call.body.target,enemy.id);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('a pending background GPS reading cannot block ATTACK in the account queue',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'No GPS Wait',skill:'punch'}),gps={lat:11.26,lng:125,accuracy:5,time:Date.now()};
 const batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]}),enemy=batch.encounters[0],a=open(db);let releaseGPS,background;
 try{
  await pause();await pause();a.w.RPGBattle.connect({id:'rogue',name:'Varkesh',stats:[20,4,4,4,20,4]},saved.game);a.w.RPGWorld.position=()=>({...gps,time:Date.now()-120000});a.w.RPGWorld.monster=()=>enemy;
  a.w.RPGWorld.freshPosition=()=>new Promise(resolve=>releaseGPS=resolve);
  background=a.w.fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'exploreRecover',gps})}).catch(()=>{});
  await pause();assert.equal(typeof releaseGPS,'function');
  await a.w.RPGBattle.encounter(enemy.id);a.d.querySelector('[data-attack]').click();
  for(let i=0;i<10&&!((await read(db,'player-a')).battle);i++)await pause();
  assert.equal((await read(db,'player-a')).battle?.encounterId,enemy.id,'combat must start before the background GPS promise resolves');
  assert.equal(a.d.querySelector('.world-encounter-choice').open,false);assert.equal(a.d.querySelector('#rpg-battle').hidden,false);
  releaseGPS({...gps,time:Date.now()});await background;assert.deepEqual(a.errors,[]);
 }finally{releaseGPS?.({...gps,time:Date.now()});a.close();}
});

test('monster ground pins update distance and reach labels as GPS moves across 200 meters',async()=>{
 const db=database(),saved=await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Map Reach',skill:'punch'}),a=open(db);
 try{
  await pause();await pause();let fix;Object.defineProperty(a.w,'isSecureContext',{value:true,configurable:true});Object.defineProperty(a.w.navigator,'geolocation',{value:{watchPosition(success){fix=success;return 1;},clearWatch(){}},configurable:true});
  const map={setView(){return this;},getZoom(){return 16;},on(){},invalidateSize(){},attributionControl:{addAttribution(){}}};
  const marker=(ll,options={})=>{const node=a.d.createElement('div');node.className=options.icon?.className||'';node.innerHTML=options.icon?.html||'';return {addTo(){a.d.querySelector('#world-map').append(node);return this;},remove(){node.remove();},on(){return this;},bindTooltip(){return this;},setLatLng(){return this;},setRadius(){return this;},getElement(){return node;}};};
  a.w.L={map:()=>map,marker,circle:marker,divIcon:x=>x};a.w.RPGBasemap.create=async()=>({on(){},addTo(){},remove(){}});a.w.RPGChests.refresh=async()=>{};
  const enemies=[100,232].map((m,i)=>({id:'reach-'+i,monsterId:'chaanack',name:'Chaanack',level:1,lat:11.26+m/111195,lng:125,expires_at:Date.now()+1800000}));a.w.RPGBattle.spawn=async()=>({encounters:enemies,spawnStatus:'ready',refreshAt:Date.now()+1800000});
  a.w.RPGWorld.open(a.w.eval('HEROES[0]'),saved.game);fix({coords:{latitude:11.26,longitude:125,accuracy:5},timestamp:Date.now()});await pause();await pause();
  const pins=[...a.d.querySelectorAll('.world-monster-pin')];assert.equal(pins.length,2);assert.match(pins[0].textContent,/100 m · In reach/);assert.ok(pins[0].classList.contains('world-in-range'));assert.match(pins[1].textContent,/232 m · Move closer/);assert.ok(!pins[1].classList.contains('world-in-range'));assert.ok(pins.every(p=>p.querySelector('.world-monster-location')));
  fix({coords:{latitude:11.26+250/111195,longitude:125,accuracy:5},timestamp:Date.now()+10});await pause();assert.match(pins[1].textContent,/18 m · In reach/);assert.ok(pins[1].classList.contains('world-in-range'));assert.equal(a.d.querySelectorAll('.world-monster-pin').length,2);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

 test('Hero Room and Inventory stay separate, and guild deposits/withdrawals update the real shared stash and owned bonuses',async()=>{
 const db=guildDatabase(),C=(await import('../api/_rpg/src/inventory-core.js')).default;
 await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Guild Hero',skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata,item={uid:'shared-weapon',defId:'iron_dagger_v1',rotation:0,rotated:false,...C.rollItem(C.itemMap.iron_dagger_v1,1,()=>0,{rarity:'rare',requiredLevel:1})};C.place(doc.state,item,'bag',0,0);db.guildMembers.set('player-a','guild-a');
 const a=open(db);try{await pause();await pause();assert.equal(a.w.RPGRoom.view(),'hero');assert.match(a.d.querySelector('#hr-portrait').getAttribute('src'),/heroes\/assassin-right.webp/);assert.equal(a.d.querySelectorAll('#hr-stats .hr-stat').length,6);assert.equal(a.d.querySelectorAll('#hr-current-hp [role="meter"]').length,3);
 a.d.querySelector('#hr-inventory-open').click();await pause();await pause();assert.equal(a.w.RPGRoom.view(),'inventory');assert.equal(a.d.querySelector('#hr-character-page').hidden,true);assert.equal(a.d.querySelector('#hr-inventory-page').hidden,false);assert.equal(a.d.querySelectorAll('#hr-guild .hr-cell').length,144);assert.equal(a.d.querySelectorAll('#hr-stash .hr-cell').length,36);assert.equal(a.d.querySelectorAll('#hr-bag .hr-cell').length,36);assert.equal(a.d.querySelectorAll('#hr-inventory-page .hr-hero-img,#hr-inventory-page #hr-active,#hr-inventory-page #hr-stats,#hr-inventory-page .rpg-element').length,0);assert.equal(a.d.querySelector('#hi-guild-state').hidden,true);
 a.d.querySelector('#hr-bag [data-uid="shared-weapon"]').click();a.d.querySelector('[data-item-action="to-guild"]').click();await pause();await pause();await pause();assert.equal(a.d.querySelector('#hr-bag [data-uid="shared-weapon"]'),null);assert.ok(a.d.querySelector('#hr-guild [data-uid="shared-weapon"]'));assert.equal((await read(db,'player-a')).state.items.some(i=>i.uid==='shared-weapon'),false);
 a.d.querySelector('#hr-guild [data-uid="shared-weapon"]').click();a.d.querySelector('[data-item-action="to-stash"]').click();await pause();await pause();await pause();assert.ok(a.d.querySelector('#hr-stash [data-uid="shared-weapon"]'));assert.equal(a.d.querySelector('#hr-guild [data-uid="shared-weapon"]'),null);assert.equal(db.guildStashes.get('guild-a').items.length,0);assert.equal(db.guildReceipts.size,2);
 a.d.querySelector('#hi-hero-room').click();assert.equal(a.w.RPGRoom.view(),'hero');assert.equal(a.d.querySelector('#hr-inventory-page').hidden,true);assert.equal(a.d.querySelector('#hr-character-page').hidden,false);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('Guild Stash CBG controls deposit and withdraw the real wallet amount, while Cancel and invalid input make no transfer',async()=>{
 const db=guildDatabase();db.guildMembers.set('player-a','guild-a');db.guildWallets.set('player-a',500);db.guildStashes.set('guild-a',{revision:0,items:[],cbg_balance:75});await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Guild Banker',skill:'punch'});
 const a=open(db);try{await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();assert.equal(a.d.querySelector('#hi-cbg-balance').textContent,'75');a.d.querySelector('#hi-cbg-deposit').click();await pause();await pause();assert.equal(a.d.querySelector('#hi-cbg-modal').open,true);assert.equal(a.d.querySelector('#hi-cbg-wallet').textContent,'500 CBG');
 const amount=a.d.querySelector('#hi-cbg-amount');amount.value='0';amount.dispatchEvent(new a.w.Event('input'));assert.equal(a.d.querySelector('#hi-cbg-confirm').disabled,true);a.d.querySelector('#hi-cbg-cancel').click();assert.equal(db.guildCbgReceipts.size,0);
 a.d.querySelector('#hi-cbg-deposit').click();await pause();await pause();amount.value='100';amount.dispatchEvent(new a.w.Event('input'));a.d.querySelector('#hi-cbg-confirm').click();await pause();await pause();assert.equal(a.d.querySelector('#hi-cbg-modal').open,false);assert.equal(db.guildWallets.get('player-a'),400);assert.equal(a.d.querySelector('#hi-cbg-balance').textContent,'175');
 a.d.querySelector('#hi-cbg-withdraw').click();await pause();await pause();amount.value='50';amount.dispatchEvent(new a.w.Event('input'));a.d.querySelector('#hi-cbg-confirm').click();await pause();await pause();assert.equal(db.guildWallets.get('player-a'),450);assert.equal(a.d.querySelector('#hi-cbg-balance').textContent,'125');assert.equal(db.guildCbgReceipts.size,2);assert.equal(a.messages.filter(m=>m.type==='CB_RPG_WALLET_CHANGED').length,2);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('an unconfirmed CBG transfer keeps its request ID across closing and retrying, even with a zero wallet',async()=>{
 const db=guildDatabase();db.guildMembers.set('player-a','guild-a');db.guildWallets.set('player-a',500);db.guildStashes.set('guild-a',{revision:0,items:[],cbg_balance:0});await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Retry Banker',skill:'punch'});
 const original=db.rpc;let lost=false;db.rpc=async(name,args)=>{const result=await original(name,args);if(name==='cb_rpg_guild_cbg'&&!lost){lost=true;return {error:{code:'NETWORK_ERROR',message:'Reply lost after commit'}};}return result;};
 const a=open(db);try{await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();a.d.querySelector('#hi-cbg-deposit').click();await pause();await pause();const amount=a.d.querySelector('#hi-cbg-amount');amount.value='500';amount.dispatchEvent(new a.w.Event('input'));a.d.querySelector('#hi-cbg-confirm').click();await pause();await pause();await pause();assert.equal(db.guildWallets.get('player-a'),0);assert.equal(db.guildCbgReceipts.size,1);assert.equal(a.d.querySelector('#hi-cbg-modal').open,true);assert.match(a.d.querySelector('#hi-cbg-status').textContent,/not be confirmed/);a.d.querySelector('#hi-cbg-cancel').click();assert.equal(a.d.querySelector('#hi-cbg-deposit').disabled,false);
 a.d.querySelector('#hi-cbg-deposit').click();await pause();await pause();assert.equal(amount.value,'500');assert.equal(amount.readOnly,true);assert.equal(a.d.querySelector('#hi-cbg-confirm').disabled,false);a.d.querySelector('#hi-cbg-confirm').click();await pause();await pause();assert.equal(a.d.querySelector('#hi-cbg-modal').open,false);assert.equal(db.guildWallets.get('player-a'),0);assert.equal(db.guildStashes.get('guild-a').cbg_balance,500);assert.equal(db.guildCbgReceipts.size,1);const calls=a.messages.filter(m=>m.body?.action==='guildCbg');assert.equal(calls.length,2);assert.equal(calls[0].body.requestId,calls[1].body.requestId);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('missing guild setup shows an activation state rather than an ineffective Retry action',async()=>{
 const db=guildDatabase();db.guildMembers.set('player-a','guild-a');await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Setup Pending',skill:'punch'});const from=db.from;db.from=table=>table==='cb_rpg_guild_stashes'?{select(){return this;},eq(){return this;},async maybeSingle(){return {data:null,error:{code:'PGRST205'}};}}:from(table);
 const a=open(db);try{await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();assert.match(a.d.querySelector('#hi-guild-message').textContent,/not enabled yet/);assert.equal(a.d.querySelector('#hi-guild-retry').hidden,true);assert.equal(a.d.querySelector('#hi-cbg-deposit').disabled,true);assert.equal(a.d.querySelectorAll('#hr-guild .hr-cell').length,144);assert.deepEqual(a.errors,[]);}finally{a.close();}
});

async function transferFixture(){
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,db=guildDatabase();db.guildMembers.set('player-a','guild-a');
 await gameRequest(db,'player-a','POST',{action:'register',heroId:'assassin',name:'Quick Transfer',skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;
 const item={uid:'quick-transfer-item',defId:'iron_dagger_v1',rotation:0,rotated:false,...C.rollItem(C.itemMap.iron_dagger_v1,1,()=>0,{rarity:'rare',requiredLevel:1})};
 C.place(doc.state,item,'bag',0,0);return {db,item};
}

test('dragging guild gear by its lower corner into the top-left bag cell clamps the footprint and persists the withdrawal',async()=>{
 for(const pointerType of ['mouse','touch']){
  const {db,item}=await transferFixture(),doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;
  doc.state.items=[];db.guildStashes.set('guild-a',{revision:1,items:[{...item,where:'guild',x:0,y:0}]});
  const a=open(db);try{
   await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();
   const room=a.d.querySelector('#hr-room');room.setPointerCapture=()=>{};room.hasPointerCapture=()=>false;
   const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
   for(const [zone,left,width]of[['bag',0,240],['stash',300,240],['guild',600,240]]){
    const grid=a.d.querySelector('#hr-'+zone);grid.getBoundingClientRect=()=>rect(left,0,width,240);grid.parentElement.getBoundingClientRect=()=>rect(left,0,width,240);
   }
   const node=a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"]');node.getBoundingClientRect=()=>rect(600,0,20,40);
   const pointer=(target,type,x,y)=>{const e=new a.w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperties(e,{pointerId:{value:1},pointerType:{value:pointerType}});target.dispatchEvent(e);};
   pointer(node,'pointerdown',610,35);pointer(room,'pointermove',5,5);
   assert.ok(a.d.querySelector('#hr-bag .hr-placement:not(.invalid)'),'the visible preview must fit at the grid edge');
   pointer(room,'pointerup',5,5);for(let n=0;n<6;n++)await pause();
   const saved=(await read(db,'player-a')).state.items.find(i=>i.uid===item.uid);
   assert.equal(saved?.where,'bag');assert.equal(saved.x,0);assert.equal(saved.y,0);assert.equal(db.guildStashes.get('guild-a').items.length,0);
   assert.equal(db.guildReceipts.size,1);assert.deepEqual(a.errors,[]);
  }finally{a.close();}
 }
});

test('legacy guild potions display as consumables and withdraw without inheriting an old equipment level lock',async()=>{
 const {db}=await transferFixture(),doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;
 doc.state.items=[];db.guildStashes.set('guild-a',{revision:1,items:[{uid:'legacy-potion',defId:'health_potion',where:'guild',x:0,y:0,rotation:0,rotated:false,rarity:'common',consumable:true,restore:{hp:20},requiredLevel:10,enhancement:{stat:0,name:'Vitality',value:1}}]});
 const a=open(db);try{
  await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();
  const node=a.d.querySelector('#hr-guild [data-uid="legacy-potion"]');assert.equal(node.classList.contains('level-locked'),false);
  node.click();a.d.querySelector('[data-item-action="to-bag"]').click();for(let n=0;n<6;n++)await pause();
  const item=(await read(db,'player-a')).state.items.find(i=>i.uid==='legacy-potion');assert.equal(item.where,'bag');assert.equal(item.requiredLevel,undefined);assert.equal(item.enhancement,undefined);
  assert.equal(db.guildStashes.get('guild-a').items.length,0);assert.equal(db.guildReceipts.size,1);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('guild withdrawals survive a newer shared revision and remain in the personal destination after reopening',async()=>{
 for(const destination of ['stash','bag']){
  const {db,item}=await transferFixture();
  const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;
  doc.state.items=doc.state.items.filter(i=>i.uid!==item.uid);
  db.guildStashes.set('guild-a',{revision:1,items:[{...item,where:'guild',x:0,y:0}]});
  let a=open(db);
  try{
   await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();
   // Another member changes shared storage after this user has opened it.
   db.guildStashes.get('guild-a').revision++;
   a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"]').click();
   a.d.querySelector(`[data-item-action="to-${destination}"]`).click();
   for(let i=0;i<8;i++)await pause();
   assert.equal((await read(db,'player-a')).state.items.find(i=>i.uid===item.uid)?.where,destination);
   assert.equal(db.guildStashes.get('guild-a').items.some(i=>i.uid===item.uid),false);
   assert.ok(a.d.querySelector(`#hr-${destination} [data-uid="quick-transfer-item"]`));
   assert.equal(db.guildReceipts.size,1);
   const attempts=a.messages.filter(m=>m.body?.action==='guildTransfer');
   assert.equal(attempts.length,2);assert.equal(attempts[0].body.requestId,attempts[1].body.requestId);
   assert.deepEqual(attempts.map(m=>m.body.stashRevision),[1,2]);
   a.w.RPGRoom.persist();await a.w.RPGLive.flush();
   assert.deepEqual(a.errors,[]);
  }finally{a.close();}
  a=open(db);try{
   await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();
   assert.ok(a.d.querySelector(`#hr-${destination} [data-uid="quick-transfer-item"]`));
   assert.equal(a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"]'),null);
   assert.deepEqual(a.errors,[]);
  }finally{a.close();}
 }
});

test('guild withdrawal retry preserves another members ownership and newly occupied personal slots',async()=>{
 const C=(await import('../api/_rpg/src/inventory-core.js')).default;
 for(const conflict of ['moved','occupied']){
  const {db,item}=await transferFixture(),doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;
  doc.state.items=[];db.guildStashes.set('guild-a',{revision:1,items:[{...item,where:'guild',x:0,y:0}]});
  await gameRequest(db,'player-b','POST',{action:'register',heroId:'mage',name:'Other Member',skill:'punch'});
  const other=[...db.rows.values()].find(r=>r.user_id==='player-b'&&r.item_kind==='rpg_profile').metadata;
  other.state.items=[];
  const a=open(db);try{
   await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();
   if(conflict==='moved'){
    db.guildStashes.get('guild-a').items=[];db.guildStashes.get('guild-a').revision++;
    assert.ok(C.place(other.state,item,'stash',0,0));
   }else{
    C.place(doc.state,{...item,uid:'new-owned-item'},'stash',0,0);doc.state.inventoryRevision=(doc.state.inventoryRevision||0)+1;
   }
   a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"]').click();a.d.querySelector('[data-item-action="to-stash"]').click();
   for(let i=0;i<8;i++)await pause();
   assert.equal((await read(db,'player-a')).state.items.some(i=>i.uid===item.uid),false);
   assert.equal(db.guildReceipts.size,0);
   assert.match(a.d.querySelector('#hr-feedback').textContent,conflict==='moved'?/already moved/:/no longer available/);
   if(conflict==='moved')assert.equal(other.state.items.filter(i=>i.uid===item.uid).length,1);
   else{assert.equal(db.guildStashes.get('guild-a').items.filter(i=>i.uid===item.uid).length,1);assert.ok(a.d.querySelector('#hr-stash [data-uid="new-owned-item"]'));}
   assert.deepEqual(a.errors,[]);
  }finally{a.close();}
 }
});

test('level-locked guild gear explains the bag requirement and can still be withdrawn to Hero Stash',async()=>{
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,{db,item}=await transferFixture();
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.items=[];
 const locked={...item,...C.rollItem(C.itemMap[item.defId],10,()=>0,{rarity:'rare',iLvl:10,requiredLevel:10}),where:'guild',x:0,y:0};
 db.guildStashes.set('guild-a',{revision:1,items:[locked]});
 const a=open(db);try{
  await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();
  a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"]').click();a.d.querySelector('[data-item-action="to-bag"]').click();
  assert.match(a.d.querySelector('#hr-feedback').textContent,/Reach level 10.*Hero Stash/);assert.equal(a.messages.filter(m=>m.body?.action==='guildTransfer').length,0);
  a.d.querySelector('[data-item-action="to-stash"]').click();for(let i=0;i<6;i++)await pause();
  assert.equal((await read(db,'player-a')).state.items.find(i=>i.uid===item.uid)?.where,'stash');
  assert.equal((await read(db,'player-a')).state.items.find(i=>i.uid===item.uid)?.requiredLevel,10);
  assert.equal(db.guildStashes.get('guild-a').items.length,0);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('guild transfer previews immediately without saving unconfirmed ownership, then confirms without freezing navigation or refetching the snapshot',async()=>{
 const {db,item}=await transferFixture();let release;const gate=new Promise(r=>release=r),rpc=db.rpc;db.rpc=async(name,args)=>{if(name==='cb_rpg_guild_transfer')await gate;return rpc(name,args);};
 const a=open(db);try{
  await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();
  const reads=a.messages.filter(m=>m.body?.action==='guildStash').length;
  a.d.querySelector('#hr-bag [data-uid="quick-transfer-item"]').click();a.d.querySelector('[data-item-action="to-guild"]').click();
  assert.equal(a.d.querySelector('#hr-bag [data-uid="quick-transfer-item"]'),null);assert.ok(a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"].hr-transfer-pending'));
  assert.equal(a.d.querySelector('#hr-room').inert||false,false);assert.equal(a.d.querySelector('#hr-inventory-page').getAttribute('aria-busy'),'true');assert.equal(a.d.querySelector('#hr-explore').disabled,true);
  const persisted=JSON.parse(a.w.localStorage.getItem(a.w.RPGLive.key('assassin')));assert.equal(persisted.items.find(i=>i.uid===item.uid).where,'bag');assert.equal((await read(db,'player-a')).state.items.find(i=>i.uid===item.uid).where,'bag');
  a.d.querySelector('#hi-hero-room').click();assert.equal(a.w.RPGRoom.view(),'hero');a.d.querySelector('#hr-inventory-open').click();
  a.w.RPGRoom.persist();assert.equal(a.messages.filter(m=>m.body?.action==='save').length,0);
  release();await pause();await pause();await pause();assert.equal(a.d.querySelector('#hr-inventory-page').getAttribute('aria-busy'),'false');assert.equal(a.d.querySelector('#hr-explore').disabled,false);assert.equal(a.d.querySelectorAll('.hr-transfer-pending').length,0);
  assert.equal((await read(db,'player-a')).state.items.some(i=>i.uid===item.uid),false);assert.equal(db.guildStashes.get('guild-a').items.filter(i=>i.uid===item.uid).length,1);assert.equal(a.messages.filter(m=>m.body?.action==='guildStash').length,reads);assert.deepEqual(a.errors,[]);
 }finally{release();a.close();}
});

test('failed guild previews restore authoritative ownership, including a lost reply after the transfer committed',async()=>{
 for(const committed of [false,true]){
  const {db,item}=await transferFixture(),rpc=db.rpc;db.rpc=async(name,args)=>{if(name==='cb_rpg_guild_transfer'){if(committed)await rpc(name,args);return {error:{code:'NETWORK_ERROR',message:'Transfer connection lost'}};}return rpc(name,args);};
  const a=open(db);try{
   await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();a.d.querySelector('#hr-bag [data-uid="quick-transfer-item"]').click();a.d.querySelector('[data-item-action="to-guild"]').click();
   assert.ok(a.d.querySelector('.hr-transfer-pending'));await pause();await pause();await pause();
   const game=await read(db,'player-a'),shared=db.guildStashes.get('guild-a')?.items||[];
   assert.equal(game.state.items.filter(i=>i.uid===item.uid).length+shared.filter(i=>i.uid===item.uid).length,1);
   assert.equal(a.d.querySelectorAll('#hr-bag [data-uid="quick-transfer-item"]').length,committed?0:1);assert.equal(a.d.querySelectorAll('#hr-guild [data-uid="quick-transfer-item"]').length,committed?1:0);
   assert.equal(a.d.querySelectorAll('.hr-transfer-pending').length,0);assert.equal(a.d.querySelector('#hr-inventory-page').getAttribute('aria-busy'),'false');assert.deepEqual(a.errors,[]);
  }finally{a.close();}
 }
});

test('a delayed background guild snapshot neither queues the next transfer nor overwrites its newer result',async()=>{
 const {db}=await transferFixture();let hold=false,release;const gate=new Promise(r=>release=r);
 const a=open(db,{}, {beforeReply:async(message)=>{if(hold&&message.body?.action==='guildStash')await gate;}});try{
  await pause();await pause();a.d.querySelector('#hr-inventory-open').click();await pause();await pause();hold=true;
  a.d.querySelector('#hi-hero-room').click();a.d.querySelector('#hr-inventory-open').click();await pause();
  a.d.querySelector('#hr-bag [data-uid="quick-transfer-item"]').click();a.d.querySelector('[data-item-action="to-guild"]').click();await pause();await pause();await pause();
  assert.equal(db.guildReceipts.size,1);assert.equal(a.d.querySelector('#hr-inventory-page').getAttribute('aria-busy'),'false');assert.ok(a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"]'));
  hold=false;release();await pause();await pause();assert.ok(a.d.querySelector('#hr-guild [data-uid="quick-transfer-item"]'));assert.equal(a.d.querySelector('#hr-bag [data-uid="quick-transfer-item"]'),null);assert.deepEqual(a.errors,[]);
 }finally{release();a.close();}
});

test('local monster turns need no HTTP response and a finished journal survives a delayed settlement acknowledgement',async()=>{
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,P=(await import('../api/_rpg/src/progression.js')).default,db=database();
 await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Local Fighter',skill:'punch'});const row=()=>[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;C.gainXp(row().state,P.threshold(88));
 const gps=()=>({lat:11.26,lng:125,accuracy:5,time:Date.now()}),batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps:gps()},{roadPoints:async()=>[{lat:11.2602,lng:125}]});row().encounters[0].level=1;const enemy=row().encounters[0];let acknowledge;
 const a=open(db,{}, {offline:true,beforeReply:async(request)=>{if(request.body.action==='offlineFinish')await new Promise(resolve=>acknowledge=resolve);}});
 try{await pause();await pause();a.w.RPGBattle.connect(a.w.eval('HEROES.find(h=>h.id==="rogue")'),row().state);a.w.RPGWorld.position=gps;a.w.RPGWorld.monster=()=>enemy;await a.w.RPGBattle.encounter(enemy.id);await pause();a.d.querySelector('[data-attack]').click();await pause();await pause();assert.equal(a.w.RPGBattle.offlinePending(),true);assert.match(a.d.querySelector('#bt-sync-status').textContent,/Local battle/);
  let hits=0;a.w.RPGSkillFX={sequence:async(host,events,options)=>{for(const event of events){options.onPrepare?.(event);options.onAttack?.(event);options.onImpact(event);hits++;}},stop(){}};
  const count=a.messages.length;a.d.querySelector('[data-bt-skill="basic"]').click();assert.ok(hits>0,'impact starts in the click task without waiting for a server reply');await pause();await pause();
  assert.equal(a.messages.slice(count).filter(m=>m.type==='CB_RPG_API'&&m.body.action==='attack').length,0);assert.ok(acknowledge);assert.equal(a.w.RPGBattle.offlinePending(),true);assert.ok(a.w.RPGOfflineCombat.resume('rogue'));assert.match(a.d.querySelector('#bt-drops-list').textContent,/syncing rewards/);
  acknowledge();await pause();await pause();assert.equal(a.w.RPGBattle.offlinePending(),false);assert.equal(a.w.RPGOfflineCombat.resume('rogue'),null);assert.equal(row().awards.length,1);assert.match(a.d.querySelector('#bt-summary-title').textContent,/Victory/);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('encounter preview preserves the cached-GPS flow and makes no background location or validation request',async()=>{
 const db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Fresh Location',skill:'punch'});const gps={lat:11.26,lng:125,accuracy:5,time:Date.now()},batch=await gameRequest(db,'player-a','POST',{action:'spawn',gps},{roadPoints:async()=>[{lat:11.2602,lng:125}]}),a=open(db);
 try{await pause();await pause();a.w.RPGBattle.connect(a.w.eval('HEROES.find(h=>h.id==="rogue")'),(await read(db,'player-a')).state);let fixes=0;a.w.RPGWorld.position=()=>({...gps,lat:12,time:Date.now()-60000});a.w.RPGWorld.monster=()=>batch.encounters[0];Object.defineProperty(a.w.navigator,'geolocation',{value:{getCurrentPosition(success,error,options){fixes++;assert.equal(options.maximumAge,0);success({coords:{latitude:gps.lat,longitude:gps.lng,accuracy:5},timestamp:Date.now()});}},configurable:true});await a.w.RPGBattle.encounter(batch.encounters[0].id);await pause();await pause();
  const dialog=a.d.querySelector('.world-encounter-choice');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-encounter-status]').textContent,'');assert.equal(fixes,0);assert.equal(a.messages.some(m=>m.type==='CB_RPG_API'&&m.body.action==='select-encounter'),false);assert.deepEqual(a.errors,[]);
 }finally{a.close();}
});

test('inventory forge upgrades four Normal potions, updates stack counter, and shows curses in red',async()=>{
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Forge Preview',skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.items=[];const item={uid:'ui-normal-stack',defId:'health_potion',quantity:12,rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1,()=>0,{rarity:'common'})};C.place(doc.state,item,'stash',0,0);
 const a=open(db,{rng:()=>.65});try{await pause();await pause();assert.equal(a.d.querySelector('#hr-stash .hr-stack-count').textContent,'12');a.d.querySelector('#hr-inventory-open').click();a.d.querySelector('#hi-forge-open').click();assert.equal(a.d.querySelector('#rpg-forge').open,true);const recipe=a.d.querySelector('[data-recipe]');recipe.value='coconut';recipe.dispatchEvent(new a.w.Event('change',{bubbles:true}));a.d.querySelector('[data-forge]').click();await pause();await pause();await pause();const saved=await read(db,'player-a');assert.equal(saved.state.items.find(i=>i.defId==='health_potion').quantity,8);assert.equal(saved.state.items.filter(i=>i.defId==='coconut_potion').length,1);assert.equal(a.d.querySelector('#hr-stash .hr-stack-count').textContent,'8');assert.match(a.d.querySelector('.forge-result').textContent,/Coconut|merged|Merged|Merge/i);assert.ok(a.d.querySelector('.forge-result .hr-curse'));assert.equal(a.w.getComputedStyle(a.d.querySelector('.forge-result .hr-curse')).color,'rgb(255, 119, 125)');assert.deepEqual(a.errors,[]);}finally{a.close();}
});

test('retrying an unconfirmed forge reuses its receipt and never consumes the recipe twice',async()=>{
 const C=(await import('../api/_rpg/src/inventory-core.js')).default,db=database();await gameRequest(db,'player-a','POST',{action:'register',heroId:'rogue',name:'Retry Smith',skill:'punch'});const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.items=[];C.place(doc.state,{uid:'retry-potions',defId:'health_potion',quantity:10,rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1,()=>0,{rarity:'common'})},'stash',0,0);
 let lost=true;const a=open(db,{rng:()=>.9},{beforeReply(data){if(data.body?.action==='forge'&&lost){lost=false;throw Error('Unconfirmed forge reply');}}});try{await pause();await pause();a.d.querySelector('#hr-inventory-open').click();a.d.querySelector('#hi-forge-open').click();a.d.querySelector('[data-forge]').click();await pause();await pause();assert.match(a.d.querySelector('.forge-result').textContent,/Unconfirmed/);a.d.querySelector('[data-forge]').click();await pause();await pause();const saved=await read(db,'player-a');assert.equal(saved.state.items.find(i=>i.defId==='health_potion').quantity,8);assert.equal(saved.state.items.filter(i=>i.defId==='cola_potion').length,1);const attempts=a.messages.filter(m=>m.body?.action==='forge');assert.equal(attempts.length,2);assert.equal(attempts[0].body.requestId,attempts[1].body.requestId);assert.deepEqual(a.errors,[]);}finally{a.close();}
});
