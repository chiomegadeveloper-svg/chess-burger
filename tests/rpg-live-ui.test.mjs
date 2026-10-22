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
