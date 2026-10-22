import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import {fetchWalking} from './roads.mjs';
import Layout from './src/encounter-layout.js';
let source=null;const cache=new Map();
const request=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Map data unavailable.');return r;};
export async function vectorRoads(center){
 if(!source||source.until<Date.now()){const metadata=await (await request('https://tiles.openfreemap.org/planet')).json();const url=metadata.tiles?.find(s=>s.startsWith('https://tiles.openfreemap.org/'));if(!url)throw Error('Map source unavailable.');source={url,z:Math.min(14,metadata.maxzoom||14),until:Date.now()+3600000};}
 const z=source.z,n=2**z,r=Math.PI/180,latSpan=.006,lngSpan=.006/Math.cos(center.lat*r);
 const tile=(lat,lng)=>({x:Math.floor((lng+180)/360*n),y:Math.floor((1-Math.asinh(Math.tan(lat*r))/Math.PI)/2*n)}),a=tile(center.lat+latSpan,center.lng-lngSpan),b=tile(center.lat-latSpan,center.lng+lngSpan),coords=[];
 for(let x=a.x;x<=b.x;x++)for(let y=a.y;y<=b.y;y++)coords.push({x:((x%n)+n)%n,y,z});
 const results=await Promise.allSettled(coords.slice(0,9).map(async t=>{
  const key=`${z}/${t.x}/${t.y}`;let tile=cache.get(key);if(!tile){tile=new VectorTile(new PbfReader(new Uint8Array(await (await request(source.url.replace('{z}',z).replace('{x}',t.x).replace('{y}',t.y))).arrayBuffer())));cache.set(key,tile);if(cache.size>40)cache.delete(cache.keys().next().value);}
  const layer=tile.layers.transportation,ways=[];if(!layer)return ways;
  for(let i=0;i<layer.length;i++){const f=layer.feature(i),p=f.properties;if(f.type!==2||!['primary','secondary','tertiary','minor','service','track','path'].includes(p.class)||['private','no','permit','customers','military'].includes(p.access)||['no','private'].includes(p.foot)||p.brunnel==='tunnel')continue;
   for(const line of f.loadGeometry())ways.push({geometry:line.map(pt=>({lon:(t.x+pt.x/f.extent)/n*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*(t.y+pt.y/f.extent)/n)))/r}))});
  }return ways;
 }));
 const points=Layout.roadPoints(results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value),center);if(!points.length&&results.every(r=>r.status==='rejected'))throw Error('Nearby roads are unavailable.');return points;
}
export async function roadPoints(center){
 // Use the same vector source as the visible map first; retain the tagged-road provider as fallback.
 try{const points=await vectorRoads(center);if(points.length)return points;}catch{}
 return fetchWalking(center);
}
