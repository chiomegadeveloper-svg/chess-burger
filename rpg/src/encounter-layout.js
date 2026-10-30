(function(root){
 const SPAWN_RADIUS=800,ATTACK_RADIUS=200,SPAWN_VERSION=6,NEARBY_SHARE=.35;
 const distance=(a,b)=>{const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 12742000*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
 function rngFor(text){let seed=2166136261;for(const c of text)seed=Math.imul(seed^c.charCodeAt(0),16777619);return ()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
 function levels(level,rng=Math.random){level=Math.max(1,Math.min(88,Math.floor(level)||1));const min=Math.max(1,level-1),max=Math.min(88,level+30);return Array.from({length:16},()=>min+Math.floor(rng()*(max-min+1)));}
 function create(center,level,species,now=Date.now(),points=[]){
  if(!center||!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||Math.abs(center.lat)>90||Math.abs(center.lng)>180||!species?.length)throw Error('A valid GPS fix is required.');
  const batch=now,rng=rngFor(`${batch}:${center.lat.toFixed(4)}:${center.lng.toFixed(4)}`),mix=levels(level,rng);
  for(let i=mix.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[mix[i],mix[j]]=[mix[j],mix[i]];}
  const seen=new Set(),available=points.filter(p=>{if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||distance(center,p)>SPAWN_RADIUS)return false;const key=p.lat+','+p.lng;if(seen.has(key))return false;seen.add(key);return true;});
  for(let i=available.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  // Reserve about 35% within attack range, rounded to whole monsters. Use only real road points.
  const near=available.filter(p=>distance(center,p)<=ATTACK_RADIUS),far=available.filter(p=>distance(center,p)>ATTACK_RADIUS);
  const count=Math.min(mix.length,available.length),nearbyCount=Math.min(near.length,Math.max(Math.round(count*NEARBY_SHARE),count-far.length));
  const selected=[],sector=p=>Math.floor((Math.atan2((p.lng-center.lng)*Math.cos(center.lat*Math.PI/180),p.lat-center.lat)+Math.PI)*4/Math.PI)%8;
  function spread(pool,target,spacings){for(const gap of spacings)while(selected.length<target){let best=null,score=-Infinity;for(const p of pool){if(selected.includes(p))continue;const separation=selected.length?Math.min(...selected.map(q=>distance(p,q))):Infinity;if(separation<gap)continue;const used=selected.filter(q=>sector(q)===sector(p)).length,value=-used*1000+(Number.isFinite(separation)?separation:0);if(value>score){score=value;best=p;}}if(!best)break;selected.push(best);}}
  const ring=near.filter(p=>distance(center,p)>=40),preferred=ring.filter(p=>distance(center,p)>=60&&distance(center,p)<=190);
  spread(preferred,nearbyCount,[55,45,25]);spread(ring,nearbyCount,[25]);
  // A sparse map may have only one real coordinate. Never fabricate off-road pins.
  if(!ring.length&&!far.length)spread(near,nearbyCount,[25]);
  spread(far,count,[70,40,12]);
  if(selected.length<count)spread(ring,count,[25]);
  return selected.map((p,i)=>{const m=species[Math.floor(rng()*species.length)];return {...m,id:`guest-road-${batch}-${i}`,monsterId:m.id,level:mix[i],lat:p.lat,lng:p.lng,expires_at:now+1800000,training:true};});
 }
 function roadCollector(center){
  const buckets=Array.from({length:24},()=>[]);
  return {add(p){const d=distance(center,p);if(d<15||d>SPAWN_RADIUS)return;const angle=(Math.atan2((p.lng-center.lng)*Math.cos(center.lat*Math.PI/180),p.lat-center.lat)+Math.PI)*4/Math.PI,sector=Math.floor(angle)%8,radial=d<60?0:d<=ATTACK_RADIUS?1:2,bucket=buckets[radial*8+sector];if(bucket.length<64&&bucket.every(q=>distance(q,p)>=12))bucket.push(p);},finish(){const out=[];for(let i=0;i<64;i++)for(const radial of [1,2,0])for(let sector=0;sector<8;sector++){const p=buckets[radial*8+sector][i];if(p)out.push(p);if(out.length===512)return out;}return out;}};
 }
 function roadPoints(ways,center){
  const collector=roadCollector(center);
  for(const way of ways||[])for(let i=1;i<(way.geometry?.length||0);i++){
   const a=way.geometry[i-1],b=way.geometry[i];if(![a.lat,a.lon,b.lat,b.lon].every(Number.isFinite))continue;
   const start={lat:a.lat,lng:a.lon},end={lat:b.lat,lng:b.lon},steps=Math.min(500,Math.max(1,Math.ceil(distance(start,end)/18)));
   for(let j=0;j<=steps;j++){const f=j/steps;collector.add({lat:a.lat+(b.lat-a.lat)*f,lng:a.lon+(b.lon-a.lon)*f});}
  }
  return collector.finish();
 }
 const api={SPAWN_RADIUS,ATTACK_RADIUS,SPAWN_VERSION,NEARBY_SHARE,create,levels,roadPoints,roadCollector};root.RPGEncounterLayout=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
