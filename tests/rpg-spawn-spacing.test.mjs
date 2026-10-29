import test from 'node:test';
import assert from 'node:assert/strict';
import Layout from '../api/_rpg/src/encounter-layout.js';
import {distanceMeters} from '../api/_rpg/world.mjs';
import {walkingCandidates} from '../api/_rpg/roads.mjs';
const at={lat:11.26,lng:125};
const point=(m,angle)=>({lat:at.lat+Math.cos(angle)*m/111195,lng:at.lng+Math.sin(angle)*m/(111195*Math.cos(at.lat*Math.PI/180))});
test('reachable monsters scatter across road directions away from the hero and each other',()=>{
 const points=Array.from({length:8},(_,i)=>[15,30,80,140,185,260,400,650,790].map(m=>point(m,i*Math.PI/4))).flat();
 const make=seed=>Layout.create(at,10,[{id:'chaanack'}],1700000000000+seed,points);
 for(let seed=0;seed<100;seed++){
  const rows=make(seed),near=rows.filter(p=>distanceMeters(at,p)<=200);
  assert.equal(rows.length,16);assert.equal(near.length,6);
  assert.ok(near.every(p=>distanceMeters(at,p)>=60&&distanceMeters(at,p)<=191));
  for(let i=0;i<near.length;i++)for(let j=0;j<i;j++)assert.ok(distanceMeters(near[i],near[j])>=45);
  const sectors=new Set(near.map(p=>Math.floor((Math.atan2(p.lng-at.lng,p.lat-at.lat)+Math.PI)*4/Math.PI)%8));assert.ok(sectors.size>=4);
  assert.ok(rows.every(p=>points.some(q=>q.lat===p.lat&&q.lng===p.lng)));
 }
 assert.deepEqual(make(1),make(1));assert.notDeepEqual(make(1),make(2));
});
test('sparse single-road and duplicate candidates stay usable without overlapping monsters',()=>{
 const p=point(30,0),one=Layout.create(at,1,[{id:'windee'}],1700000000000,Array(20).fill(p));assert.equal(one.length,1);
 const points=[30,60,90,120,150,180,199,220,250,300,400,500,650].map(m=>point(m,0));
 const rows=Layout.create(at,1,[{id:'windee'}],1700000000000,points);
 assert.ok(rows.length>1);assert.equal(new Set(rows.map(p=>`${p.lat},${p.lng}`)).size,rows.length);
 const near=rows.filter(p=>distanceMeters(at,p)<=200);assert.ok(near.every(p=>distanceMeters(at,p)>=40));
 for(let i=0;i<near.length;i++)for(let j=0;j<i;j++)assert.ok(distanceMeters(near[i],near[j])>=25);
});
test('both road providers retain later nearby ways instead of stopping after early distant candidates',()=>{
 const ways=Array.from({length:100},(_,i)=>({tags:{highway:'residential'},geometry:[-500,500].map(x=>({lat:at.lat+(420+i*3)/111195,lon:at.lng+x/(111195*Math.cos(at.lat*Math.PI/180))}))}));
 ways.push({tags:{highway:'residential'},geometry:[-100,100].map(x=>({lat:at.lat-100/111195,lon:at.lng+x/(111195*Math.cos(at.lat*Math.PI/180))}))});
 for(const points of [Layout.roadPoints(ways,at),walkingCandidates(ways,at)]){assert.ok(points.length<=512);assert.ok(points.some(p=>distanceMeters(at,p)<200));assert.ok(points.some(p=>distanceMeters(at,p)>400));assert.ok(points.every(p=>distanceMeters(at,p)<=800));}
});
