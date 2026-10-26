import {createHash} from 'node:crypto';
import Boundary from './src/city-boundary.js';
import {distanceMeters} from './world.mjs';
// One deterministic city/day layout shared by all online adventurers, with no background jobs.
export function merchantPins(city){
 const points=(city.roads||[]).filter(p=>Boundary.contains(city,p)),seed=createHash('sha256').update(`${city.key}:${city.day}:merchants-v1`).digest();let n=seed.readUInt32LE();
 const rng=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
 for(let i=points.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[points[i],points[j]]=[points[j],points[i]];}
 const chosen=[];for(const spacing of [500,150,50,1])for(const p of points){if(chosen.length>=12)break;if(chosen.every(q=>distanceMeters(p,q)>=spacing))chosen.push(p);}
 return chosen.map((p,i)=>({id:`merchant:${city.key}:${city.day}:${i}`,name:'Dwarf’s Trading Post',lat:p.lat,lng:p.lng}));
}
