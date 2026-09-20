import {test} from 'node:test';
import assert from 'node:assert/strict';
import {barangayKey,isTwoSquareKilometreSquare,kingdomRangePolygon,polygonContains} from '../api/arena.ts';

test('barangay keys are stable across case, spacing, and accents',()=>{
 assert.equal(barangayKey('Brgy. San José','Tacloban City'),'tacloban-city:brgy-san-jose');
 assert.equal(barangayKey('  BRGY San Jose  ','Tacloban City'),'tacloban-city:brgy-san-jose');
});

test('polygon containment accepts points inside and rejects points outside',()=>{
 const boundary={type:'Polygon',coordinates:[[[125,11],[126,11],[126,12],[125,12],[125,11]]]};
 assert.equal(polygonContains(boundary,11.5,125.5),true);
 assert.equal(polygonContains(boundary,10.5,125.5),false);
});

test('polygon holes are excluded from a barangay boundary',()=>{
 const boundary={type:'Polygon',coordinates:[
  [[125,11],[126,11],[126,12],[125,12],[125,11]],
  [[125.4,11.4],[125.6,11.4],[125.6,11.6],[125.4,11.6],[125.4,11.4]],
 ]};
 assert.equal(polygonContains(boundary,11.2,125.2),true);
 assert.equal(polygonContains(boundary,11.5,125.5),false);
});

test('multipolygon containment supports separated barangay islands',()=>{
 const boundary={type:'MultiPolygon',coordinates:[
  [[[125,11],[125.2,11],[125.2,11.2],[125,11.2],[125,11]]],
  [[[126,12],[126.2,12],[126.2,12.2],[126,12.2],[126,12]]],
 ]};
 assert.equal(polygonContains(boundary,12.1,126.1),true);
 assert.equal(polygonContains(boundary,11.6,125.6),false);
});


test('kingdom ranges are closed 2 km² GPS square polygons',()=>{
 const range=kingdomRangePolygon(11.244,125.003);
 assert.equal(range.type,'Polygon');
 assert.equal(range.coordinates[0].length,5);
 assert.equal(polygonContains(range,11.244,125.003),true);
 const ring=range.coordinates[0];
 const northSouth=Math.abs(ring[0][1]-ring[3][1])*111_320;
 const eastWest=Math.abs(ring[0][0]-ring[1][0])*111_320*Math.cos(11.244*Math.PI/180);
 assert.ok(Math.abs(northSouth-Math.sqrt(2_000_000))<2);
 assert.ok(Math.abs(eastWest-Math.sqrt(2_000_000))<2);
 assert.equal(isTwoSquareKilometreSquare(range,11.244),true);
 assert.equal(isTwoSquareKilometreSquare(kingdomRangePolygon(11.244,125.003,Math.PI*2_000**2),11.244),false);
 // Roughly 800 m north: outside a square whose half-side is 707 m.
 assert.equal(polygonContains(range,11.2512,125.003),false);
});
