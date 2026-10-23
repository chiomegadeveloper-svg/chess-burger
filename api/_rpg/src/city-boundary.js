(function(root){
 const inside=(p,b)=>!!b&&p.lat>=b[0]&&p.lat<=b[1]&&p.lng>=b[2]&&p.lng<=b[3];
 function inRing(point,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [x,y]=ring[i],[xj,yj]=ring[j];if((y>point.lat)!==(yj>point.lat)&&point.lng<(xj-x)*(point.lat-y)/(yj-y)+x)hit=!hit;}return hit;}
 function inBoundary(point,geometry){if(!geometry)return true;const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polygons.some(rings=>inRing(point,rings[0])&&!rings.slice(1).some(hole=>inRing(point,hole)));}
 const api={inside,inBoundary,contains:(city,p)=>!!p&&inside(p,city?.bounds)&&inBoundary(p,city.geometry)};root.RPGCityBoundary=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
