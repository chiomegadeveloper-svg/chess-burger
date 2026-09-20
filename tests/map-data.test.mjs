import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNearby,mapCoordinates,kingdomBoundary,validBoundary} from '../app/map-data.ts';

const legacy={id:'kingdom-1',user_id:'owner-1',lat:11.244,lng:125.003,kingdom_name:'Omega Kingdom',is_owner:true,display_name:'Player'};
test('current API territory rows supply valid Leaflet center and polygon',()=>{
 const data=normalizeNearby({players:[],territories:[legacy]});
 assert.equal(data.territoriesComplete,true);
 const zone=data.territories[0];
 assert.equal(zone.centroid_lat,11.244);assert.equal(zone.centroid_lng,125.003);
 assert.equal(zone.barangay,'Omega Kingdom');assert.equal(zone.is_owner,true);
 assert.equal(zone.kingdom_name,'Omega Kingdom');
 assert.equal(validBoundary(zone.boundary),true);
 // These undefined coordinates caused Leaflet to unmount the entire app.
 assert.equal(Number.isNaN(Number(zone.centroid_lat)),false);
 assert.equal(Number.isNaN(Number(zone.centroid_lng)),false);
});
test('an unnamed legacy territory is labelled clearly without pre-filling a fake name',()=>{
 const zone=normalizeNearby({territories:[{...legacy,kingdom_name:null}]}).territories[0];
 assert.equal(zone.kingdom_name,'');
 assert.equal(zone.barangay,'Unnamed kingdom');
});
test('zero-defense kingdoms remain visible as abandoned and expose slot totals',()=>{
 const data=normalizeNearby({owned_count:2,slot_limit:3,territories:[{...legacy,user_id:null,abandoned:true,defense_points:0,in_range:true}]});
 assert.equal(data.territories.length,1);assert.equal(data.territories[0].abandoned,true);
 assert.equal(data.territories[0].in_range,true);assert.equal(data.ownedCount,2);assert.equal(data.slotLimit,3);
});
test('existing valid polygons and territory metadata are preserved',()=>{
 const boundary=kingdomBoundary(11.244,125.003);
 const row={...legacy,lat:undefined,lng:undefined,centroid_lat:11.244,centroid_lng:125.003,boundary,defense_points:15,online:true,cbr:157};
 const zone=normalizeNearby({territories:[row]}).territories[0];
 assert.equal(zone.boundary,boundary);assert.equal(zone.defense_points,15);assert.equal(zone.cbr,157);
 assert.equal(zone.online,true);
});
test('malformed or missing arrays never reach the rendering loop',()=>{
 for(const data of [{},{players:null,territories:null},{players:{},territories:'bad'}]){
  const normalized=normalizeNearby(data);
  assert.deepEqual(normalized.players,[]);assert.deepEqual(normalized.territories,[]);
  assert.equal(normalized.territoriesComplete,false);
 }
 assert.throws(()=>normalizeNearby(null),/invalid response/);
});
test('bad records are ignored and incomplete territory data blocks new claims',()=>{
 const data=normalizeNearby({players:[null,{user_id:'bad',lat:null,lng:undefined}],territories:[null,{...legacy,lat:undefined},{...legacy,lat:100},legacy]});
 assert.equal(data.territories.length,1);assert.equal(data.players.length,0);
 assert.equal(data.territoriesComplete,false);
});
test('numeric strings and partial player identity cannot crash slice or toFixed',()=>{
 const {players,territories}=normalizeNearby({players:[{user_id:'p',lat:'11.24',lng:'125.00',display_name:null}],territories:[{...legacy,lat:'11.244',lng:'125.003'}]});
 assert.equal(players[0].lat.toFixed(2),'11.24');assert.equal(players[0].display_name.slice(0,1),'P');
 assert.equal(territories[0].centroid_lat,11.244);
});
test('invalid GeoJSON gets a valid display square without changing the input record',()=>{
 for(const boundary of [undefined,null,{},'bad',{type:'Polygon',coordinates:[]},{type:'Polygon',coordinates:[[[null,null]]]}]){
  const row={...legacy,boundary};const normalized=normalizeNearby({territories:[row]});
  assert.equal(validBoundary(normalized.territories[0].boundary),true);
  assert.equal(row.boundary,boundary);
 }
});
test('the fallback square has an area of approximately 2 km²',()=>{
 const {coordinates:[ring]}=kingdomBoundary(11.244,125.003);
 const width=(ring[1][0]-ring[0][0])*111320*Math.cos(11.244*Math.PI/180);
 const height=(ring[2][1]-ring[1][1])*111320;
 assert.ok(Math.abs(width*height-2_000_000)<1);
 assert.deepEqual(ring[0],ring.at(-1));
});
test('coordinate validation rejects missing, non-numeric and out-of-range GPS',()=>{
 for(const [lat,lng] of [[undefined,undefined],[null,null],['',''],[NaN,125],[Infinity,125],[91,125],[11,181],[true,false]])assert.equal(mapCoordinates(lat,lng),null);
 assert.deepEqual(mapCoordinates(0,0),{lat:0,lng:0});
 assert.deepEqual(mapCoordinates('11.244','125.003'),{lat:11.244,lng:125.003});
});
