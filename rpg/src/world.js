(function(){
 'use strict';
 const el=id=>document.getElementById(id),world=el('rpg-world'),C=window.RPGInventory,images=window.RPG_ITEM_IMAGES;
 let monsterRows=[],monsterRefreshAt=0,monsterRequest=false,lastMonsterAttempt=0,monsterTimer=null,rangeCircle=null,gpsTimer=null;
 let hero,state,map,tileLayer,mapLoadingTimer,basemapVersion=0,selfMarker,accuracyCircle,peerMarkers=[],watch=null,timer=null,position=null,sharing=false,busy=false,follow=true,requestVersion=0,onlineVersion=0,apiQueue=Promise.resolve();
 const status=text=>{el('world-gps-status').textContent=text;};
 const safe=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function refresh(nextHero=hero,nextState=state){
  hero=nextHero;state=nextState;if(!hero||!state)return;
  el('world-hero').src=hero.img;el('world-hero').alt=`${hero.name}, ${hero.heroClass}`;el('world-name').textContent=state.name;el('world-class').textContent=`${hero.name.toUpperCase()} · ${hero.heroClass.toUpperCase()}`;el('world-level').textContent=`LV ${state.level}`;el('world-wallet').textContent=`${state.cbg.toLocaleString()} CBG`;
  const xp=window.RPGProgression.progress(state.totalXp??window.RPGProgression.threshold(state.level));el('world-xp-label').textContent=state.level===88?'LEVEL 88 · MAX':`${xp.xp} / ${xp.nextXp} XP`;el('world-xp').max=xp.nextXp||1;el('world-xp').value=state.level===88?1:xp.xp;
  const totals=C.totals(state,hero.stats);el('world-hp').textContent=`${totals[0]} / ${totals[0]}`;el('world-mp').textContent=`${totals[4]} / ${totals[4]}`;
  const grid=C.gridFor(state,'bag'),bag=el('world-bag');bag.style.aspectRatio=`${grid.cols}/${grid.rows}`;el('world-bag-size').textContent=`${grid.cols} × ${grid.rows}`;let html='';
  for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)html+=`<i style="left:${x/grid.cols*100}%;top:${y/grid.rows*100}%;width:${100/grid.cols}%;height:${100/grid.rows}%"></i>`;
  for(const item of state.items.filter(i=>i.where==='bag')){const def=C.itemMap[item.defId],size=C.size(def,item.rotation),rarity=C.rarityMap[item.rarity];html+=`<span class="world-bag-item" role="img" aria-label="${safe(def.name)}, ${safe(rarity.name)}" title="${safe(def.name)} · ${safe(rarity.name)} · iLvl ${item.iLvl}" style="--rarity:${rarity.color};--angle:${item.rotation*90}deg;left:${item.x/grid.cols*100}%;top:${item.y/grid.rows*100}%;width:${size.w/grid.cols*100}%;height:${size.h/grid.rows*100}%"><img src="${images[def.sprite]}" alt=""></span>`;}
  bag.innerHTML=html;
  el('world-attacks').innerHTML=state.active.map((id,index)=>{const spell=C.spellMap[id];return `<div class="world-spell" role="img" aria-label="${spell?safe(spell.name):`Empty attack slot ${index+1}`}" title="${spell?safe(spell.description):'Empty attack slot'}">${spell?`<img src="assets/skills/icons/${spell.id}.webp" alt="">`:`<span>${index+1}</span>`}</div>`;}).join('');
 }
 function clearPeers(){for(const marker of peerMarkers)marker.remove();peerMarkers=[];el('world-players').replaceChildren();el('world-player-count').textContent='Nearby adventurers';}
 async function loadBasemap(){
  const version=++basemapVersion;clearTimeout(mapLoadingTimer);
  if(tileLayer){tileLayer.remove();tileLayer=null;}
  mapLoadingTimer=setTimeout(()=>{if(version===basemapVersion)el('world-map-fallback').hidden=false;},15000);
  try{
   const layer=await window.RPGBasemap.create(L);if(version!==basemapVersion)return;
   tileLayer=layer;
   layer.on('tileload',()=>{if(version===basemapVersion&&!layer.rpgLoadFailed){clearTimeout(mapLoadingTimer);el('world-map-fallback').hidden=true;roadFallback();}});
   layer.on('tileerror',()=>{if(version===basemapVersion)el('world-map-fallback').hidden=false;});
   layer.addTo(map);
  }catch(error){if(version===basemapVersion){clearTimeout(mapLoadingTimer);el('world-map-fallback').hidden=false;}console.warn('RPG basemap unavailable:',error);}
 }
 function initMap(){
  if(map){requestAnimationFrame(()=>map.invalidateSize());return;}
  if(!window.L){el('world-map-fallback').hidden=false;return;}
  try{
   map=L.map('world-map',{zoomControl:false,attributionControl:true,maxZoom:19}).setView([11.26,125.0],13);
   map.attributionControl?.addAttribution('<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>');
   loadBasemap();map.on('dragstart',()=>{follow=false;});requestAnimationFrame(()=>map.invalidateSize());
  }catch{el('world-map-fallback').hidden=false;}
 }
 function drawPosition(){if(!map||!position)return;const ll=[position.lat,position.lng];
  if(!selfMarker){selfMarker=L.marker(ll,{icon:L.divIcon({className:'world-player-pin world-self-pin',html:`<div class="world-self-avatar"><img src="${HERO_HEADS[hero.id]}" alt="${safe(hero.name)}"><b>YOU</b></div>`,iconSize:[56,66],iconAnchor:[28,64],tooltipAnchor:[0,-58]}),alt:`Your hero: ${hero.name}`,zIndexOffset:500}).addTo(map);const tooltip=document.createElement('span');tooltip.textContent=`You · ${hero.name}`;selfMarker.bindTooltip(tooltip);accuracyCircle=L.circle(ll,{radius:position.accuracy,color:'#65c9de',weight:1,fillColor:'#4dc6dd',fillOpacity:.08}).addTo(map);}
  else{selfMarker.setLatLng(ll);accuracyCircle.setLatLng(ll).setRadius(position.accuracy);}
  if(!rangeCircle)rangeCircle=L.circle(ll,{radius:200,color:'#d4b263',weight:1,dashArray:'6 6',fillOpacity:.015,interactive:false}).addTo(map);else rangeCircle.setLatLng(ll);
  if(follow)map.setView(ll,Math.max(map.getZoom(),16),{animate:false});
 }
 function queue(operation){const next=apiQueue.catch(()=>{}).then(operation);apiQueue=next;return next;}
 function forgetPresence(){return queue(()=>fetch('/api/world/presence',{method:'DELETE',credentials:'same-origin',keepalive:true}).catch(()=>{}));}
 function offline(message='You are offline. Your location is not being shared.'){
  const wasSharing=sharing;sharing=false;onlineVersion++;if(timer!==null)clearInterval(timer);timer=null;clearPeers();el('world-share').textContent='Go online';el('world-online-status').textContent=message;if(wasSharing)forgetPresence();
 }
 function stopGPS(message='GPS is off. Your location is not being shared.'){
  clearInterval(gpsTimer);gpsTimer=null;requestVersion++;monsterRequest=false;lastMonsterAttempt=0;clearInterval(monsterTimer);monsterTimer=null;for(const pin of encounterPins.values())pin.remove();encounterPins.clear();if(rangeCircle){rangeCircle.remove();rangeCircle=null;}if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;position=null;offline();if(selfMarker){selfMarker.remove();selfMarker=null;accuracyCircle.remove();accuracyCircle=null;}
  el('world-gps').textContent='◎ Enable GPS';el('world-share').disabled=true;el('world-map-mode').textContent='PREVIEW AREA';el('world-position').textContent='Enable GPS to find your place in the realm.';status(message);
 }
 function gpsError(error){
  if(error.code===1)stopGPS('Location permission was denied. Allow location in your browser settings, then enable GPS again.');
  else{position=null;el('world-share').disabled=true;offline();status(error.code===3?'GPS timed out. Waiting for a fresh location…':'GPS signal unavailable. Waiting for a fresh location…');if(selfMarker){selfMarker.remove();selfMarker=null;accuracyCircle?.remove();accuracyCircle=null;}for(const pin of encounterPins.values())pin.remove();encounterPins.clear();if(rangeCircle){rangeCircle.remove();rangeCircle=null;}}
 }
 function startGPS(){
  if(watch!==null)return;
  if(!navigator.geolocation){status('This browser does not support GPS location.');return;}
  if(!window.isSecureContext){status('GPS needs a secure HTTPS connection. Open the published account to enable it.');return;}
  if(!monsterTimer)monsterTimer=setInterval(discoverMonsters,2000);
  const version=++requestVersion;status('Finding your GPS location…');el('world-gps').textContent='◎ Refresh GPS';follow=true;clearInterval(gpsTimer);gpsTimer=setInterval(()=>{if(!world.hidden&&!document.hidden&&(!position||Date.now()-position.time>20000))refreshGPS();},10000);
  try{watch=navigator.geolocation.watchPosition(value=>{
   if(version!==requestVersion||world.hidden)return;const {latitude:lat,longitude:lng,accuracy}=value.coords;if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(accuracy)||(Number.isFinite(value.timestamp)&&Date.now()-value.timestamp>30000))return;
   position={lat,lng,accuracy,time:Date.now()};el('world-map-mode').textContent='LIVE GPS';el('world-share').disabled=accuracy>1000;el('world-position').textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)} · accuracy ±${Math.round(accuracy)} m`;
   status(accuracy>1000?'GPS accuracy is low. Move to an open area before going online.':`Live GPS · accuracy ±${Math.round(accuracy)} m. ${sharing?'Sharing with nearby players.':'Monster discovery uses this GPS fix. Player sharing is off.'}`);drawPosition();roadFallback();discoverMonsters();
  },error=>{if(version===requestVersion&&!world.hidden)gpsError(error);},{enableHighAccuracy:true,maximumAge:10000,timeout:20000});}catch{stopGPS('GPS could not start. Check location permissions and try again.');}
 }
 function refreshGPS(){
  if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;
  requestVersion++;monsterRequest=false;startGPS();
 }
 function showPeers(players){
  clearPeers();const valid=players.filter(p=>p&&['rogue','theft','assassin','mage','tank','archer','queen','crusader'].includes(p.heroId)&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.updatedAt>Date.now()-45000);
  el('world-player-count').textContent=`${valid.length} nearby adventurer${valid.length===1?'':'s'}`;
  el('world-online-status').textContent=valid.length?'Online players within 5 km. Updated every 8 seconds.':'You are online. No other adventurers are nearby yet.';
  for(const p of valid){const src=window.DamageSprites.sprite(p.heroId,100,'right'),row=document.createElement('button');row.type='button';row.className='world-player';row.addEventListener('click',()=>window.RPGBattle.encounter(p.peerId,true));const img=document.createElement('img');img.src=src;img.alt='';const text=document.createElement('span');text.textContent=p.name;const small=document.createElement('small');small.textContent=`Level ${p.level} · GPS ±${Math.round(p.accuracy)} m · Tap to challenge`;text.append(small);row.append(img,text);el('world-players').append(row);
   if(map){const icon=L.divIcon({className:'world-player-pin',html:`<img src="${src}" alt=""><span>${safe(p.name)}</span>`,iconSize:[48,60],iconAnchor:[24,48]});const marker=L.marker([p.lat,p.lng],{icon}).addTo(map);const popup=document.createElement('div');popup.textContent=`${p.name} · Level ${p.level}`;marker.bindPopup(popup);marker.on('click',()=>window.RPGBattle.encounter(p.peerId,true));peerMarkers.push(marker);}
  }
 }
 async function sync(){
  if(busy||!sharing||!position||world.hidden)return;
  if(Date.now()-position.time>30000){offline('GPS is stale. Get a fresh location, then go online again.');return;}
  const version=onlineVersion,payload={heroId:hero.id,name:state.name,level:state.level,lat:position.lat,lng:position.lng,accuracy:position.accuracy};busy=true;
  try{
   await queue(async()=>{if(!sharing||version!==onlineVersion)return;const r=await fetch('/api/world/presence',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok){const error=new Error(r.status===401?'Sign in to this account to go online.':r.status===429?'Please wait a moment, then go online again.':'Player presence is unavailable. Please try again.');throw error;} });
   if(!sharing||version!==onlineVersion)return;const r=await fetch('/api/world/presence',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Unable to refresh nearby players.');const result=await r.json();if(sharing&&version===onlineVersion){showPeers(Array.isArray(result.players)?result.players:[]);status(`Live GPS · sharing with nearby players · accuracy ±${Math.round(position.accuracy)} m`);}
  }catch(error){if(sharing&&version===onlineVersion)offline(error.message||'Network unavailable. Go online again when connected.');}
  finally{busy=false;}
 }
 function online(){if(sharing){offline();status(position?'Live GPS · player sharing is off.':'GPS is off.');return;}if(!position||position.accuracy>1000||Date.now()-position.time>30000){status('Wait for a fresh, accurate GPS location before going online.');return;}sharing=true;onlineVersion++;el('world-share').textContent='Go offline';el('world-online-status').textContent='Connecting to nearby adventurers…';sync();timer=setInterval(sync,8000);}
 function open(nextHero,nextState){refresh(nextHero,nextState);el('hr-room').hidden=true;world.hidden=false;document.querySelector('.app').hidden=true;initMap();el('world-exit').focus();startGPS();window.RPGBattle?.connect(hero,state);clearInterval(monsterTimer);monsterTimer=setInterval(discoverMonsters,2000);}
 function leave(exit){window.RPGBattle?.stop();stopGPS();world.hidden=true;el('hr-room').hidden=false;window.RPGRoom.refresh();el('hr-explore').focus();if(exit){window.dispatchEvent(new CustomEvent('chessburger:rpg-exit'));if(window.parent!==window)window.parent.postMessage({type:'CHESS_BURGER_RPG_EXIT'},location.origin);}}
 el('world-gps').addEventListener('click',refreshGPS);el('world-share').addEventListener('click',online);el('world-exit').addEventListener('click',()=>leave(true));
 for(const id of ['world-equipment','world-bag-open'])el(id).addEventListener('click',()=>leave(false));
 el('world-book').addEventListener('click',()=>window.RPGRoom.utility('book'));el('world-shop').addEventListener('click',()=>window.RPGRoom.utility('shop'));
 el('world-center').addEventListener('click',()=>{if(!position){status('Enable GPS to center the map on your location.');return;}follow=true;drawPosition();});el('world-zoom-in').addEventListener('click',()=>map?.zoomIn());el('world-zoom-out').addEventListener('click',()=>map?.zoomOut());
 el('world-map-retry').addEventListener('click',()=>{if(!map){initMap();return;}el('world-map-fallback').hidden=true;loadBasemap();});
 document.addEventListener('visibilitychange',()=>{if(world.hidden)return;if(document.hidden){offline();status('GPS tracking remains enabled. Your browser may pause updates in the background.');}else refreshGPS();});window.addEventListener('pageshow',()=>{if(!world.hidden)refreshGPS();});window.addEventListener('pagehide',()=>{if(!world.hidden)stopGPS();});window.addEventListener('offline',()=>{if(!world.hidden){offline('Network offline. Player sharing has stopped.');status('Network offline. GPS can continue on this device.');}});
 let rangeNotice=null,rangeDismissTimer=null,rangeHideTimer=null;
 function dismissRangeNotice(){if(!rangeNotice)return;clearTimeout(rangeDismissTimer);clearTimeout(rangeHideTimer);rangeNotice.classList.add('leaving');rangeHideTimer=setTimeout(()=>{rangeNotice.hidden=true;},350);}
 function outOfRange(distance,pvp=false){
  if(!rangeNotice){rangeNotice=document.createElement('section');rangeNotice.className='world-range-notice';rangeNotice.setAttribute('role','status');rangeNotice.setAttribute('aria-live','polite');rangeNotice.innerHTML='<button type="button" aria-label="Close attack range message">×</button><span aria-hidden="true">◎</span><h2>Outside attack range</h2><p></p><small>Attack range · 200 meters</small>';rangeNotice.querySelector('button').onclick=dismissRangeNotice;document.body.append(rangeNotice);}
  clearTimeout(rangeDismissTimer);clearTimeout(rangeHideTimer);rangeNotice.classList.remove('leaving');rangeNotice.hidden=false;
  rangeNotice.querySelector('p').textContent=`This ${pvp?'player':'monster'} is too far away${Number.isFinite(distance)?` (about ${Math.ceil(distance)} m)`:''}. Move within 200 meters to battle.`;
  rangeDismissTimer=setTimeout(dismissRangeNotice,10000);
 }
 const encounterPins=new Map();
 function meters(a,b){const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
 function roadFallback(){} // Encounter coordinates are always assigned by the server.
 function primeEncounters(cache){
  if(!cache||cache.refreshAt<=Date.now())return;
  monsterRefreshAt=cache.refreshAt;encounters(cache.encounters||[]);
 }
 function syncEncounters(data){
  if(data.spawnStatus==='ready'){monsterRefreshAt=data.refreshAt||Date.now()+1800000;encounters(data.encounters||[]);if(data.message)el('world-monster-status').textContent=data.message;}
 }
 async function discoverMonsters(force=false){
  if(world.hidden||!position||Date.now()-position.time>30000)return;
  const now=Date.now();encounters(monsterRows);
  if(monsterRequest||(!force&&now<monsterRefreshAt))return;
  if(now-lastMonsterAttempt<2000)return;
  lastMonsterAttempt=now;monsterRequest=true;const version=requestVersion,fix={...position};
  el('world-monster-status').textContent='Loading fixed monster locations…';
  try{const data=await window.RPGBattle.spawn(fix);if(!data||version!==requestVersion||world.hidden)return;monsterRefreshAt=data.refreshAt||now+5000;syncEncounters(data);if(!monsterRows.length)el('world-monster-status').textContent=data.message||'Loading roads and nearby monsters…';}
  catch(error){if(version===requestVersion){monsterRefreshAt=now+5000;if(!monsterRows.length)el('world-monster-status').textContent='Loading road encounters · retrying automatically. GPS remains on.';}}
  finally{if(version===requestVersion)monsterRequest=false;}
 }
 function encounters(rows){
  monsterRows=rows.filter(e=>e.expires_at>Date.now()&&!state?.practiceAwards?.some(a=>a.id===`device-${e.id}`));
  const visible=position?monsterRows.filter(e=>meters(position,e)<=600):[];
  if(!map)return;const ids=new Set(visible.map(e=>e.id));for(const [id,pin] of encounterPins)if(!ids.has(id)){pin.remove();encounterPins.delete(id);}
  for(const e of visible){if(encounterPins.has(e.id))continue;const src=window.DamageSprites.sprite(e.monsterId,100,'left');const icon=L.divIcon({className:'world-monster-pin',html:`<div class="world-monster-marker"><b class="world-monster-level">LVL ${Number(e.level)}</b><img src="${src}" alt=""><span>${safe(e.name)}</span></div>`,iconSize:[84,108],iconAnchor:[42,87]});const pin=L.marker([e.lat,e.lng],{icon,alt:`${e.name}, LVL ${e.level}`}).addTo(map);pin.on('click',()=>window.RPGBattle.encounter(e.id));encounterPins.set(e.id,pin);}
 }
 el('world-battle-lab').addEventListener('click',()=>window.RPGBattle.openLab());
 window.RPGWorld={open,refresh,primeEncounters,outOfRange,stop:stopGPS,encounters,syncEncounters,offline,position:()=>position&&({...position}),monster:id=>monsterRows.find(e=>e.id===id),consume(id){encounters(monsterRows.filter(e=>e.id!==id));}};
})();
