import Layout from './src/encounter-layout.js';
import {distanceMeters} from './world.mjs';
export function walkingCandidates(elements,center){
 const points=[];
 for(const way of elements||[]){const t=way.tags||{};if(!['footway','pedestrian','path','living_street','residential','unclassified','service'].includes(t.highway)||['no','private','customers','permit','military'].includes(t.access)||['no','private','use_sidepath'].includes(t.foot)||t.footway==='crossing'||t.crossing||t.tunnel==='yes'||t.area==='yes'||t.bridge==='yes'||t.construction||t.proposed)continue;
  const geometry=way.geometry||[];for(let i=1;i<geometry.length;i++){
   const a=geometry[i-1],b=geometry[i];if(![a.lat,a.lon,b.lat,b.lon].every(Number.isFinite))continue;
   const start={lat:a.lat,lng:a.lon},end={lat:b.lat,lng:b.lon},length=distanceMeters(start,end),steps=Math.min(80,Math.max(1,Math.ceil(length/15)));
   for(let n=0;n<=steps;n++){const f=n/steps,p={lat:start.lat+(end.lat-start.lat)*f,lng:start.lng+(end.lng-start.lng)*f};const d=distanceMeters(center,p);if(d>=15&&d<=Layout.SPAWN_RADIUS&&points.every(q=>distanceMeters(p,q)>=12))points.push(p);if(points.length>=512)return points;}
  }
 }return points;
}
const roadCache=new Map();
export async function fetchWalking(center,fetcher=fetch){
 const lat=Math.round(center.lat*100)/100,lng=Math.round(center.lng*100)/100,latSpan=Layout.SPAWN_RADIUS/111195+.006,span=latSpan/Math.max(.08,Math.cos(lat*Math.PI/180)),key=`${Layout.SPAWN_RADIUS}:${lat}:${lng}`;
 const cached=fetcher===fetch&&roadCache.get(key);if(cached&&cached.until>Date.now())return walkingCandidates(cached.elements,center);
 const query=`[out:json][timeout:4];way[highway~"^(footway|pedestrian|path|living_street|residential|unclassified|service)$"](${lat-latSpan},${lng-span},${lat+latSpan},${lng+span});out tags geom;`;
 for(const host of ['https://overpass-api.de','https://overpass.kumi.systems']){
  try{const response=await fetcher(`${host}/api/interpreter`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(4500)});
   if(!response.ok)continue;const data=await response.json();if(data.remark||!Array.isArray(data.elements))continue;
   if(fetcher===fetch){if(roadCache.size>=16)roadCache.delete(roadCache.keys().next().value);roadCache.set(key,{until:Date.now()+300000,elements:data.elements});}
   return walkingCandidates(data.elements,center);
  }catch{}
 }
 throw Error('Road map data is temporarily unavailable.');
}

