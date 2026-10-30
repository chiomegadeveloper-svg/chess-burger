import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {extractRpgImages} from '../scripts/extract-rpg-images.mjs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

test('image extraction preserves original bytes, deduplicates files and removes obsolete generated assets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'rpg-images-')),url=pathToFileURL(root+'/');
 try{
  const bytes=Buffer.from('original image bytes'),data='data:image/webp;base64,'+bytes.toString('base64');
  const result=await extractRpgImages(`<img src="${data}"><script>const images=["${data}"];</script>`,url);
  const path=result.html.match(/assets\/embedded\/[a-f0-9]+\.webp/)[0];
  assert.equal(result.images,1);assert.equal(result.html.split(path).length-1,2);
  assert.deepEqual(await readFile(new URL(path,url)),bytes);
  await extractRpgImages('<main>Empty</main>',url);
  assert.deepEqual(await readdir(new URL('assets/embedded/',url)),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('opening HTML stays under 200KB compressed and every extracted reference preserves its source image',async()=>{
 const html=await readFile('public/rpg/index.html','utf8');
 assert.ok(Buffer.byteLength(html)<700000,'opening markup and logic must not embed the artwork catalogs');
 assert.ok(gzipSync(html).length<200000,'compressed opening page budget');
 assert.ok(!html.includes('data:image/'),'images should be fetched individually');
 const paths=[...new Set(html.match(/assets\/embedded\/[a-f0-9]+\.(?:webp|png|jpg|svg)/g))];
 assert.ok(paths.length>=100);
 const original=[];
 for(const path of ['rpg/src/hero-forge.html','rpg/src/hero-heads.json','rpg/src/item-images.js','rpg/src/babaylan-images.js']){
  const source=await readFile(path,'utf8');
  for(const match of source.matchAll(/data:image\/(?:webp|png|jpeg|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})/g))original.push(createHash('sha256').update(Buffer.from(match[1],'base64')).digest('hex'));
 }
 const hashes=new Set();
 for(const path of paths){const bytes=await readFile('public/rpg/'+path),hash=createHash('sha256').update(bytes).digest('hex');assert.ok(path.includes(hash));hashes.add(hash);}
 for(const hash of original)assert.ok(hashes.has(hash),'source artwork must remain byte-identical');
 const manifest=JSON.parse(await readFile('public/rpg/cache-manifest.json','utf8'));
 for(const path of paths)assert.ok(manifest.assets.some(a=>a.path==='/rpg/'+path),'on-demand images remain in the optional device pack');
});

test('a stalled iframe offers Retry after 30 seconds; retry and the account handshake release the loader',async()=>{
 const bundle=await build({entryPoints:['app/rpg-game.tsx'],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react-dom','react/jsx-runtime'],plugins:[{name:'fixture',setup(b){
  b.onResolve({filter:/^(\.\/supabase|\.\/rpg-orientation|lucide-react)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='./supabase'?'export const getSupabase=async()=>({auth:{getSession:async()=>({data:{session:{user:{id:"preview-user"}}}})}});':args.path==='lucide-react'?'export const ArrowLeft=()=>null,RotateCw=()=>null,Maximize2=()=>null;':'export const requestRpgLandscape=()=>{};'}));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://chessburger.test'}),timers=new Map(),keys=['window','document','location','screen','IS_REACT_ACT_ENVIRONMENT'];
 const previous=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]),set=globalThis.setTimeout,clear=globalThis.clearTimeout;
 let root,back=0;
 try{
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  globalThis.setTimeout=(fn,ms,...args)=>{if(ms!==30000)return set(fn,ms,...args);const id={};timers.set(id,fn);return id;};
  globalThis.clearTimeout=id=>{if(!timers.delete(id))clear(id);};
  root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(mod.exports.default,{onBack:()=>back++,onWalletChange(){}})));
  assert.equal(timers.size,1);assert.match(document.querySelector('iframe').src,/\/rpg\/index.html\?v=0\./);
  await act(async()=>document.querySelector('[role="status"] button').click());assert.equal(back,1);
  await act(async()=>[...timers.values()][0]());
  assert.match(document.querySelector('[role="alert"]').textContent,/taking too long/);assert.equal(document.querySelector('iframe'),null);
  await act(async()=>[...document.querySelectorAll('[role="alert"] button')].find(b=>b.textContent==='Retry').click());
  const frame=document.querySelector('iframe');assert.ok(frame);assert.equal(timers.size,1);
  await act(async()=>window.dispatchEvent(new window.MessageEvent('message',{source:frame.contentWindow,origin:location.origin,data:{type:'CB_RPG_READY'}})));
  assert.equal(document.querySelector('.rpg-live-loading'),null);assert.equal(timers.size,0);
 }finally{
  if(root)await act(async()=>root.unmount());
  globalThis.setTimeout=set;globalThis.clearTimeout=clear;dom.window.close();
  for(const [key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 }
});
