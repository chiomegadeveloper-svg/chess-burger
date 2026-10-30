import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const origin='https://chessburger.test';
class Storage {
 constructor(){this.caches=new Map();this.fail=false;}
 async open(name){if(this.fail)throw Error('Storage unavailable');if(!this.caches.has(name))this.caches.set(name,new Cache(this));return this.caches.get(name);}
 async keys(){return [...this.caches.keys()];}
 async delete(name){return this.caches.delete(name);}
 async match(request){for(const cache of this.caches.values()){const r=await cache.match(request);if(r)return r;}}
}
class Cache {
 constructor(storage){this.rows=new Map();this.storage=storage;}
 key(request){return new URL(typeof request==='string'?request:request.url,origin).href;}
 async match(request){return this.rows.get(this.key(request))?.clone();}
 async put(request,response){if(this.storage.fail)throw Error('Quota exceeded');this.rows.set(this.key(request),response.clone());}
 async delete(request){return this.rows.delete(this.key(request));}
 async keys(){return [...this.rows.keys()].map(url=>new Request(url));}
}
const records=(count=4)=>Array.from({length:count},(_,i)=>({path:`/rpg/assets/idle/monster-${i}.webp`,bytes:10,revision:String(i).padStart(64,'0')}));
function worker({assets=records(),storage=new Storage(),fetcher}={}){
 const listeners={},calls=[];
 const manifest={version:'0.test',bytes:assets.reduce((n,a)=>n+a.bytes,0),assets};
 const self={location:{origin},addEventListener:(type,listener)=>listeners[type]=listener,clients:{claim:async()=>{}},skipWaiting(){}};
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8').replace('"__RPG_ASSET_MANIFEST__"',JSON.stringify(manifest)),{
  self,caches:storage,URL,Request,Response,Map,Promise,
  fetch:async(request,options)=>{const url=typeof request==='string'?request:request.url;calls.push(url);return fetcher?fetcher(url,options):new Response('game file');},
 });
 async function dispatch(type,data={}){
  const waits=[],event={...data,waitUntil:p=>waits.push(p),respondWith:p=>event.response=p};
  listeners[type](event);const response=event.response?await event.response:undefined;await Promise.all(waits);return response;
 }
 return {storage,calls,dispatch,request:(path,options)=>dispatch('fetch',{request:new Request(new URL(path,origin),options)}),message:(type,port,id='job')=>dispatch('message',{data:{type,id},ports:port?[port]:[]})};
}

test('repeat RPG file loads use the saved revision and account/API traffic is never intercepted',async()=>{
 const f=worker(),path=records()[0].path;
 assert.equal(await(await f.request(path)).text(),'game file');assert.equal(await(await f.request(path)).text(),'game file');
 assert.equal(f.calls.length,1);assert.match(f.calls[0],/rpg-revision=/);
 for(const path of ['/api/profile?feature=rpg','/api/battle','/auth/callback'])assert.equal(await f.request(path),undefined);
 assert.equal(await f.request(records()[1].path,{headers:{Authorization:'Bearer example'}}),undefined);
 assert.equal(await f.request(records()[1].path,{method:'POST'}),undefined);
 assert.equal(f.calls.length,1);
});

test('an update reuses identical files, removes obsolete revisions and fetches changed artwork',async()=>{
 const storage=new Storage(),assets=records(2),first=worker({storage,assets});
 for(const asset of assets)await first.request(asset.path);
 const changed=[assets[0],{...assets[1],revision:'f'.repeat(64)}],next=worker({storage,assets:changed});
 await next.dispatch('activate');await next.request(changed[0].path);await next.request(changed[1].path);
 assert.equal(next.calls.length,1);assert.match(next.calls[0],/rpg-revision=f{64}/);
 const keys=await(await storage.open('chess-burger-rpg-files-v1')).keys();assert.equal(keys.length,2);
 assert.ok(keys.every(r=>!r.url.endsWith(assets[1].revision)));
});

test('cache budgets evict old files and unavailable storage never prevents an online asset load',async()=>{
 const assets=records(2).map(a=>({...a,bytes:50*1024*1024})),f=worker({assets});
 for(const asset of assets)assert.equal((await f.request(asset.path)).status,200);
 const keys=await(await f.storage.open('chess-burger-rpg-files-v1')).keys();assert.equal(keys.length,1);assert.ok(keys[0].url.includes('monster-1'));
 const storage=new Storage();storage.fail=true;const blocked=worker({storage});
 assert.equal(await(await blocked.request(records()[0].path)).text(),'game file');
 assert.equal(await(await blocked.request(records()[0].path)).text(),'game file');assert.equal(blocked.calls.length,2);
 const noStore=worker({fetcher:async()=>new Response('private',{headers:{'Cache-Control':'no-store'}})});
 await noStore.request(records()[0].path);await noStore.request(records()[0].path);assert.equal(noStore.calls.length,2);
});

test('the optional download uses two connections, reports progress and resumes saved files',async()=>{
 let active=0,max=0;const f=worker({fetcher:async()=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,5));active--;return new Response('file');}});
 await f.request(records()[0].path);const messages=[];
 await f.message('RPG_FILES_DOWNLOAD',{postMessage:m=>messages.push(m),close(){}});
 assert.equal(messages.at(-1).type,'complete');assert.equal(messages.at(-1).files,4);assert.equal(messages.at(-1).bytes,40);
 assert.ok(max<=2);assert.equal(f.calls.length,4);
 await f.message('RPG_FILES_DOWNLOAD',{postMessage(){},close(){}});assert.equal(f.calls.length,4,'repeat downloads reuse the pack');
});

test('closing a download pauses future requests and a later download resumes the remaining files',async()=>{
 const f=worker({assets:records(8)}),messages=[];
 await f.message('RPG_FILES_DOWNLOAD',{postMessage(m){messages.push(m);if(m.type==='progress'&&m.files>=2)void f.message('RPG_FILES_CANCEL');},close(){}});
 assert.equal(messages.at(-1).type,'cancelled');assert.ok(messages.at(-1).files<8);
 await f.message('RPG_FILES_DOWNLOAD',{postMessage:m=>messages.push(m),close(){}});
 assert.equal(messages.at(-1).type,'complete');assert.equal(messages.at(-1).files,8);assert.equal(f.calls.length,8);
});

test('map tiles reuse a bounded cache while source metadata refreshes and can fall back offline',async()=>{
 let offline=false;const f=worker({fetcher:async()=>{if(offline)throw Error('offline');return new Response('map');}});
 const metadata='https://tiles.openfreemap.org/planet',tile=n=>`https://tiles.openfreemap.org/planet/release/14/${n}/1.pbf`;
 await f.request(metadata);await f.request(metadata);assert.equal(f.calls.length,2);
 offline=true;assert.equal(await(await f.request(metadata)).text(),'map');offline=false;
 await f.request(tile(1));await f.request(tile(1));assert.equal(f.calls.filter(u=>u===tile(1)).length,1);
 for(let n=2;n<=50;n++)await f.request(tile(n));
 assert.equal((await(await f.storage.open('chess-burger-rpg-map-v1')).keys()).length,48);
 assert.equal(await f.request('https://unrelated.test/14/1/1.pbf'),undefined);
});

test('the downloadable manifest matches actual files and includes the engine, game page and health artwork',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/rpg/cache-manifest.json','utf8'));
 assert.ok(manifest.bytes<80*1024*1024);assert.ok(manifest.assets.some(a=>a.path==='/rpg/index.html'));
 assert.ok(manifest.assets.some(a=>a.path==='/rpg/vendor/ctjs-skill-fx.js'));
 assert.ok(manifest.assets.some(a=>a.path.startsWith('/rpg/assets/health/')));
 for(const asset of manifest.assets){const data=fs.readFileSync('public'+asset.path);assert.equal(data.length,asset.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),asset.revision);}
});
