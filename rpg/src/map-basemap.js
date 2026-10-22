// A vector basemap: roads and water are redrawn at the visible zoom, never enlarged as bitmaps.
(function(){
 'use strict';
 const roadClasses=new Set(['motorway','trunk','primary','secondary','tertiary','minor','service','track','path']);
 function styles(){
  const visible={
   water:{fill:true,fillColor:'#0b1e2c',fillOpacity:1,stroke:false},
   transportation(properties,zoom){
    if(!roadClasses.has(properties.class))return [];
    const major=['motorway','trunk','primary'].includes(properties.class),medium=['secondary','tertiary'].includes(properties.class);
    const scale=Math.pow(1.2,Math.max(0,Math.min(19,zoom)-12));
    return {color:'#a9bbb4',weight:(major?1.5:medium?1:.6)*scale,opacity:1,fill:false,lineCap:'round',lineJoin:'round'};
   }
  };
  return new Proxy(visible,{get:(target,key)=>Object.hasOwn(target,key)?target[key]:[]});
 }
 function retile(tile,coords,parent,factor){
  const layers={};
  for(const name of ['water','transportation']){
   const source=tile.layers[name];if(!source)continue;
   const extent=source.extent||4096,offsetX=(coords.x-parent.x*factor)*extent,offsetY=(coords.y-parent.y*factor)*extent;
   const padding=extent/256*12,minX=(offsetX-padding)/factor,maxX=(offsetX+extent+padding)/factor,minY=(offsetY-padding)/factor,maxY=(offsetY+extent+padding)/factor;
   const features=[];
   for(const feature of source.features){
    if(name==='transportation'&&(!roadClasses.has(feature.properties.class)||feature.type!==2))continue;
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const ring of feature.geometry)for(const p of ring){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
    if(right<minX||left>maxX||bottom<minY||top>maxY)continue;
    features.push({type:feature.type,id:feature.id,properties:feature.properties,geometry:feature.geometry.map(ring=>ring.map(p=>({x:p.x*factor-offsetX,y:p.y*factor-offsetY})))});
   }
   layers[name]={extent,features};
  }
  return {layers};
 }
 async function create(L){
  if(!L.vectorGrid?.protobuf||!L.svg?.tile)throw Error('Map renderer unavailable.');
  const response=await fetch('https://tiles.openfreemap.org/planet',{credentials:'omit'});
  if(!response.ok)throw Error('Map data unavailable.');
  const metadata=await response.json(),url=metadata.tiles?.find(url=>typeof url==='string'&&url.startsWith('https://'));
  if(!url)throw Error('Map source unavailable.');
  const sourceZoom=Number.isFinite(metadata.maxzoom)?Math.max(0,Math.min(19,Math.floor(metadata.maxzoom))):14;
  const layer=L.vectorGrid.protobuf(url,{rendererFactory:L.svg.tile,vectorTileLayerStyles:styles(),interactive:false,maxNativeZoom:19,maxZoom:19,fetchOptions:{credentials:'omit'},keepBuffer:1});
  const getTile=layer._getVectorTilePromise.bind(layer),cache=new Map(),roadTiles=new Map();
  layer.rpgRoads=()=>[...roadTiles.values()].flat();
  layer._getVectorTilePromise=async coords=>{
   const z=Math.min(coords.z,sourceZoom),factor=2**(coords.z-z),parent={x:Math.floor(coords.x/factor),y:Math.floor(coords.y/factor),z},key=`${z}/${parent.x}/${parent.y}`;
   try{
    let pending=cache.get(key);
    if(!pending){pending=getTile(parent).then(tile=>{if(Array.isArray(tile.layers))throw Error('Map tile unavailable.');return tile;});cache.set(key,pending);if(cache.size>24)cache.delete(cache.keys().next().value);}
    else{cache.delete(key);cache.set(key,pending);}
    const tile=await pending;
    if(!roadTiles.has(key)){
     const source=tile.layers.transportation,extent=source?.extent||4096,n=2**parent.z,ways=[];
     for(const f of source?.features||[]){const t=f.properties||{};if(f.type!==2||!['primary','secondary','tertiary','minor','service','track','path'].includes(t.class)||['private','no','customers','permit','military'].includes(t.access)||['no','private'].includes(t.foot)||t.brunnel==='tunnel')continue;
      for(const ring of f.geometry||[])ways.push({tags:{highway:'residential'},geometry:ring.map(p=>({lon:((parent.x+p.x/extent)/n)*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*(parent.y+p.y/extent)/n)))*180/Math.PI}))});
     }
     roadTiles.set(key,ways);if(roadTiles.size>24)roadTiles.delete(roadTiles.keys().next().value);
    }
    return retile(tile,coords,parent,factor);
   }catch(error){cache.delete(key);layer.rpgLoadFailed=true;layer.fire('tileerror',{error,coords});return {layers:{}};}
  };
  return layer;
 }
 window.RPGBasemap={create,styles};
})();
