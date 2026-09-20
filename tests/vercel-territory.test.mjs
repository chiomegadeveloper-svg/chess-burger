import {test} from 'node:test';
import assert from 'node:assert/strict';
import {barangayKey,polygonContains} from '../api/arena.ts';

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
