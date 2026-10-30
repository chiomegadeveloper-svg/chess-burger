import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('rpg/src/map-basemap.js','utf8');
function fixture(fetcher){
 let metadata=0,parents=0;const layers=[];
 const feature={type:2,properties:{class:'minor'},geometry:[[{x:0,y:0},{x:4096,y:4096}]]};
 const tile={layers:{transportation:{extent:4096,features:[feature]},water:{extent:4096,features:[]},building:{features:Array(100).fill(feature)}}};
 const L={canvas:{tile(){const canvas={style:{}};return {getContainer:()=>canvas,_ctx:{scale(x,y){canvas.ratio=[x,y];}}};}},vectorGrid:{protobuf(url,options){const layer={options,_getVectorTilePromise:async()=>{parents++;return structuredClone(tile);},fire(){}};layers.push(layer);return layer;}}};
 const ctx={window:{devicePixelRatio:3},AbortSignal,fetch:async()=>{metadata++;return fetcher?fetcher(metadata):{ok:true,json:async()=>({maxzoom:14,tiles:['https://example.test/{z}/{x}/{y}']})};}};
 vm.runInNewContext(source,ctx);return {api:ctx.window.RPGBasemap,L,layers,metadata:()=>metadata,parents:()=>parents};
}
test('concurrent map creation shares metadata; sibling zoom tiles share one decoded parent and discard hidden layers',async()=>{
 const f=fixture(),[a]=await Promise.all([f.api.create(f.L),f.api.create(f.L)]);assert.equal(f.metadata(),1);
 const children=await Promise.all(Array.from({length:16},(_,i)=>a._getVectorTilePromise({x:i%4,y:Math.floor(i/4),z:16})));
 assert.equal(f.parents(),1);assert.ok(children.every(t=>Object.keys(t.layers).every(k=>['water','transportation'].includes(k))));
 assert.equal(a.options.updateWhenIdle,true);assert.equal(a.options.updateWhenZooming,false);
 const renderer=a.options.rendererFactory({}, {x:256,y:256},{}),canvas=renderer.getContainer();
 assert.equal(canvas.width,512);assert.equal(canvas.height,512);assert.equal(canvas.style.width,'256px');assert.deepEqual(canvas.ratio,[2,2]);
 const high=await a._getVectorTilePromise({x:0,y:0,z:19});assert.equal(f.parents(),1);assert.ok(high.layers.transportation.features[0].geometry[0][1].x>4096,'high zoom reprojects vector coordinates instead of enlarging bitmap tiles');
});
test('metadata failures are retryable instead of poisoning the shared cache',async()=>{
 const f=fixture(n=>n===1?Promise.reject(Error('offline')):{ok:true,json:async()=>({maxzoom:14,tiles:['https://example.test/{z}/{x}/{y}']})});
 await assert.rejects(f.api.warm(),/offline/);await f.api.create(f.L);assert.equal(f.metadata(),2);
});
