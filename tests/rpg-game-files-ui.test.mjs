import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const pause=()=>new Promise(r=>setTimeout(r,10));
async function screen(supported=true,complete=false){
 const dom=new JSDOM('<div class="hr-live-meta"><span>Saved</span></div>',{url:'https://chessburger.test/rpg/index.html',runScripts:'outside-only'}),w=dom.window,messages=[];
 Object.defineProperty(w,'isSecureContext',{value:true});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const worker={postMessage(data,ports){messages.push(data);if(ports){const port=ports[0];if(data.type==='RPG_FILES_STATUS')queueMicrotask(()=>port.postMessage({type:'status',files:complete?4:1,totalFiles:4,bytes:complete?4194304:1048576,totalBytes:4194304}));else worker.port=port;}}};
 if(supported)Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>({update:async()=>{},active:worker}),ready:Promise.resolve({active:worker})}});
 w.MessageChannel=class{constructor(){const a={onmessage:null,close(){a.closed=true;}},b={postMessage(data){if(!a.closed)queueMicrotask(()=>a.onmessage?.({data}));},close(){}};this.port1=a;this.port2=b;}};
 w.eval(fs.readFileSync('public/rpg/game-files.js','utf8'));await pause();
 return {dom,w,d:w.document,messages,worker,close:()=>dom.window.close()};
}
test('download is optional, shows saved size and progress, and completes with an accessible icon button',async()=>{
 const f=await screen();try{
  const button=f.d.querySelector('.rpg-files-button');assert.match(button.getAttribute('aria-label'),/Download game files/);assert.ok(button.querySelector('svg'));assert.equal(f.messages.length,0);
  button.click();await pause();assert.match(f.d.querySelector('[data-size]').textContent,/1.0 MB of 4.0 MB/);
  const start=f.d.querySelector('[data-download]');assert.equal(start.disabled,false);start.click();assert.equal(start.disabled,true);
  f.worker.port.postMessage({type:'progress',files:2,totalFiles:4,bytes:2097152,totalBytes:4194304});await pause();assert.equal(f.d.querySelector('progress').value,2097152);
  f.worker.port.postMessage({type:'complete',files:4,totalFiles:4,bytes:4194304,totalBytes:4194304});await pause();
  assert.equal(start.textContent,'Saved');assert.equal(start.disabled,true);assert.match(f.d.querySelector('[data-status]').textContent,/saved/);
 }finally{f.close();}
});
test('closing a download pauses the worker and returns focus to the Hero Room button',async()=>{
 const f=await screen();try{
  f.d.querySelector('.rpg-files-button').click();await pause();f.d.querySelector('[data-download]').click();
  f.d.querySelector('[data-close]').click();assert.equal(f.d.querySelector('dialog').open,false);
  assert.equal(f.messages.at(-1).type,'RPG_FILES_CANCEL');assert.equal(f.d.activeElement,f.d.querySelector('.rpg-files-button'));
 }finally{f.close();}
});
test('reopening a complete pack shows Saved without offering to download nonexistent remaining files',async()=>{
 const f=await screen(true,true);try{
  f.d.querySelector('.rpg-files-button').click();await pause();
  assert.equal(f.d.querySelector('[data-download]').textContent,'Saved');assert.equal(f.d.querySelector('[data-download]').disabled,true);
  assert.equal(f.d.querySelector('[data-status]').textContent,'All game files are saved on this device.');
 }finally{f.close();}
});
test('unsupported storage and download failures explain the limit without blocking online play',async()=>{
 const unsupported=await screen(false);try{
  unsupported.d.querySelector('.rpg-files-button').click();await pause();
  assert.match(unsupported.d.querySelector('[data-status]').textContent,/still play online/);assert.equal(unsupported.d.querySelector('[data-download]').disabled,true);
 }finally{unsupported.close();}
 const f=await screen();try{
  f.d.querySelector('.rpg-files-button').click();await pause();f.d.querySelector('[data-download]').click();
  f.worker.port.postMessage({type:'error',error:'Device storage is full. You can still play online.'});await pause();
  assert.equal(f.d.querySelector('[data-download]').textContent,'Retry');assert.equal(f.d.querySelector('[data-download]').disabled,false);
  assert.match(f.d.querySelector('[data-status]').textContent,/storage is full/);
 }finally{f.close();}
});
