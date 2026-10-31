(function(){
 'use strict';
 const el=id=>document.getElementById(id),world=el('rpg-world'),C=window.RPGInventory,images=window.RPG_ITEM_IMAGES;
 let battlePaused=false,nextOnlineAttempt=0,permissionStatus=null,freshRequest=null;
 let monsterRows=[],monsterRefreshAt=0,monsterRequest=false,lastMonsterAttempt=0,monsterTimer=null,rangeCircle=null,gpsTimer=null;
 let resumeFix=null,currentCity=null,cityPending=false,cityEpoch=0,merchantRows=[];
 let hero,state,map,tileLayer,mapLoadingTimer,basemapVersion=0,basemapPending=false,selfMarker,accuracyCircle,watch=null,timer=null,position=null,sharing=false,busy=false,follow=true,requestVersion=0,onlineVersion=0,apiQueue=Promise.resolve();
 const peerMarkers=new Map();let cameraFix=null,drawnFix=null,bagSignature='',skillsSignature='',lastEncounterSignature='',nextEncounterExpiry=0;
 const upright=(html,x,y)=>`<div class="world-pin-upright" style="--pin-x:${x}px;--pin-y:${y}px">${html}</div>`;
 const status=text=>{el('world-gps-status').textContent=text;};
 function ensureOnline(){if(!battlePaused&&!world.hidden&&!document.hidden&&navigator.onLine!==false&&!sharing&&position&&position.accuracy<=1000&&Date.now()-position.time<30000&&Date.now()>=nextOnlineAttempt)online();}
 function observePermission(){if(permissionStatus||!navigator.permissions?.query)return;navigator.permissions.query({name:'geolocation'}).then(permission=>{permissionStatus=permission;permission.onchange=()=>{if(permission.state==='granted'&&!world.hidden&&!battlePaused)refreshGPS();};}).catch(()=>{});}
 const safe=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function refresh(nextHero=hero,nextState=state){
  hero=nextHero;state=nextState;if(!hero||!state)return;
  el('world-hero').src=hero.img;el('world-hero').alt=`${hero.name}, ${hero.heroClass}`;el('world-name').textContent=state.name;el('world-class').textContent=`${hero.name.toUpperCase()} · ${String(hero.heroClass||'Adventurer').toUpperCase()}`;el('world-level').textContent=`LV ${state.level}`;el('world-wallet').textContent=`${state.cbg.toLocaleString()} CBG`;
  const xp=window.RPGProgression.progress(state.totalXp??window.RPGProgression.threshold(state.level));el('world-xp-label').textContent=state.level===88?'LEVEL 88 · MAX':`${xp.xp} / ${xp.nextXp} XP`;el('world-xp').max=xp.nextXp||1;el('world-xp').value=state.level===88?1:xp.xp;
  const totals=C.totals(state,hero.stats);el('world-hp').textContent=`${Math.max(0,Math.min(totals[0],state.currentHp??totals[0]))} / ${totals[0]}`;el('world-mp').textContent=`${Math.max(0,Math.min(totals[4],state.currentMp??totals[4]))} / ${totals[4]}`;
  for(const [key,index] of [['hp',0],['mp',4]]){const value=Math.max(0,Math.min(totals[index],state[key==='hp'?'currentHp':'currentMp']??totals[index]));el('world-'+key).parentElement.nextElementSibling.firstElementChild.style.width=(value/totals[index]*100)+'%';}
  const grid=C.gridFor(state,'bag'),bag=el('world-bag');bag.style.aspectRatio=`${grid.cols}/${grid.rows}`;bag.style.setProperty('--bag-ratio',grid.cols/grid.rows);el('world-bag-size').textContent=`${grid.cols} × ${grid.rows}`;let html='';
  for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)html+=`<i style="left:${x/grid.cols*100}%;top:${y/grid.rows*100}%;width:${100/grid.cols}%;height:${100/grid.rows}%"></i>`;
  for(const item of state.items.filter(i=>i.where==='bag')){const def=C.itemMap[item.defId],size=C.size(def,item.rotation),rarity=C.rarityMap[item.rarity];html+=`<span class="world-bag-item${item.rotation%2?' rotated':''}" data-item-uid="${safe(item.uid)}" role="img" aria-label="${safe(def.name)}, ${safe(rarity.name)}" title="${safe(def.name)} · ${safe(rarity.name)}${C.isConsumable(item)?' · Consumable · '+C.potions.describe(item):' · iLvl '+item.iLvl}" style="--rarity:${rarity.color};--angle:${item.rotation*90}deg;--cols:${size.w};--rows:${size.h};left:${item.x/grid.cols*100}%;top:${item.y/grid.rows*100}%;width:${size.w/grid.cols*100}%;height:${size.h/grid.rows*100}%"><img src="${images[def.sprite]}" alt="">${C.quantity(item)>1?`<b class="hr-stack-count">${C.quantity(item)}</b>`:''}</span>`;}
  if(html!==bagSignature){bag.innerHTML=html;bagSignature=html;}
  const attacks=state.active.map((id,index)=>{const spell=C.spellMap[id];return `<div class="world-spell" role="img" aria-label="${spell?safe(spell.name):`Empty attack slot ${index+1}`}" title="${spell?safe(spell.description):'Empty attack slot'}">${spell?`<img src="assets/skills/runes/${spell.id}.webp" alt="">`:`<span>${index+1}</span>`}</div>`;}).join('');
  if(attacks!==skillsSignature){el('world-attacks').innerHTML=attacks;skillsSignature=attacks;}
 }
 let recovering=false;setInterval(async()=>{if(recovering||!state||!position||world.hidden||document.hidden||battlePaused)return;recovering=true;const version=requestVersion;try{await queue(async()=>{const r=await fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'exploreRecover',gps:position})});const d=await r.json();if(r.ok&&d.game&&!world.hidden&&!battlePaused&&version===requestVersion){Object.assign(state,d.game);localStorage.setItem(window.RPGLive.key(state.heroId),JSON.stringify(state));refresh();window.RPGRoom.refresh?.();}});}catch{}finally{recovering=false;}},10000);
 function clearPeers(){for(const {marker,row} of peerMarkers.values()){marker?.remove();row.remove();}peerMarkers.clear();el('world-player-count').textContent='Nearby adventurers';}
 async function loadBasemap(){
  if(basemapPending)return;basemapPending=true;
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
  finally{if(version===basemapVersion)basemapPending=false;}
 }
 function initMap(){
  if(map){requestAnimationFrame(()=>map.invalidateSize());return;}
  if(!window.L){el('world-map-fallback').hidden=false;return;}
  try{
   map=L.map('world-map',{zoomControl:false,attributionControl:true,maxZoom:19,preferCanvas:true,fadeAnimation:false,inertia:false}).setView(position?[position.lat,position.lng]:[11.26,125.0],17);
   map.attributionControl?.addAttribution('<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>');
   // Warm only metadata until GPS arrives; avoid downloading tiles for the default city.
   void window.RPGBasemap.warm?.().catch(()=>{});map.on('dragstart',()=>{follow=false;cameraFix=null;});requestAnimationFrame(()=>map.invalidateSize());
   if(window.ResizeObserver){let resizeFrame=0;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(!world.hidden)map.invalidateSize({pan:false});});}).observe(el('world-map'));}
  }catch{el('world-map-fallback').hidden=false;}
 }
 function drawPosition(){if(!map||!position)return;const ll=[position.lat,position.lng];
  const moved=!drawnFix||drawnFix.lat!==position.lat||drawnFix.lng!==position.lng;
  if(!selfMarker){selfMarker=L.marker(ll,{icon:L.divIcon({className:'world-player-pin world-self-pin',html:upright(`<div class="world-self-avatar"><img src="${HERO_HEADS[hero.id]}" alt="${safe(hero.name)}"><b>YOU</b></div>`,28,64),iconSize:[56,66],iconAnchor:[28,64],tooltipAnchor:[0,-58]}),alt:`Your hero: ${hero.name}`,zIndexOffset:500}).addTo(map);const tooltip=document.createElement('span');tooltip.textContent=`You · ${hero.name}`;selfMarker.bindTooltip(tooltip);accuracyCircle=L.circle(ll,{radius:position.accuracy,color:'#65c9de',weight:1,fillColor:'#4dc6dd',fillOpacity:.08,interactive:false}).addTo(map);}
  else{if(moved){selfMarker.setLatLng(ll);accuracyCircle.setLatLng(ll);}if(drawnFix?.accuracy!==position.accuracy)accuracyCircle.setRadius(position.accuracy);}
  if(!rangeCircle)rangeCircle=L.circle(ll,{radius:200,color:'#d4b263',weight:1,dashArray:'6 6',fillOpacity:.015,interactive:false}).addTo(map);else if(moved)rangeCircle.setLatLng(ll);
  if(follow&&(!cameraFix||meters(cameraFix,position)>=5||map.getZoom()<16)){map.setView(ll,Math.max(map.getZoom(),16),{animate:false});cameraFix={...position};}
  drawnFix={...position};if(!tileLayer&&!basemapPending)void loadBasemap();
 }
 function queue(operation){const next=apiQueue.catch(()=>{}).then(operation);apiQueue=next;return next;}
 function forgetPresence(){return queue(()=>fetch('/api/world/presence',{method:'DELETE',credentials:'same-origin',keepalive:true}).catch(()=>{}));}
 function offline(message='You are offline. Your location is not being shared.'){
  const wasSharing=sharing;sharing=false;onlineVersion++;if(timer!==null)clearInterval(timer);timer=null;clearPeers();el('world-share').textContent='Go online';el('world-online-status').textContent=message;if(wasSharing)forgetPresence();
 }
 function pauseForBattle(){
  if(battlePaused)return;battlePaused=true;requestVersion++;monsterRequest=false;
  if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;clearInterval(gpsTimer);gpsTimer=null;clearInterval(monsterTimer);monsterTimer=null;offline();
 }
 function resumeAfterBattle(){if(!battlePaused)return;battlePaused=false;if(!world.hidden)startGPS();}
 function stopGPS(message='GPS is off. Your location is not being shared.'){
  battlePaused=false;nextOnlineAttempt=0;drawnFix=null;cameraFix=null;lastEncounterSignature='';
  clearInterval(gpsTimer);gpsTimer=null;requestVersion++;monsterRequest=false;lastMonsterAttempt=0;clearInterval(monsterTimer);monsterTimer=null;for(const pin of encounterPins.values())pin.remove();encounterPins.clear();if(rangeCircle){rangeCircle.remove();rangeCircle=null;}if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;position=null;showChests([]);showMerchants([]);offline();if(selfMarker){selfMarker.remove();selfMarker=null;accuracyCircle.remove();accuracyCircle=null;}
  el('world-gps').textContent='◎ Enable GPS';el('world-share').disabled=true;el('world-map-mode').textContent='PREVIEW AREA';el('world-position').textContent='Enable GPS to find your place in the realm.';status(message);
 }
 function gpsError(error){
  if(error.code===1)stopGPS('Location permission was denied. Allow location in your browser settings. GPS will restart automatically.');
  else{el('world-share').disabled=true;offline();status(error.code===3?'GPS timed out. Waiting for a fresh location…':'GPS signal unavailable. Waiting for a fresh location…');}
 }
 function startGPS(){
  if(battlePaused)return;
  if(watch!==null)return;
  if(!navigator.geolocation){status('This browser does not support GPS location.');return;}
  if(!window.isSecureContext){status('GPS needs a secure HTTPS connection. Open the published account to enable it.');return;}
  if(!monsterTimer)monsterTimer=setInterval(discoverMonsters,2000);
  const version=++requestVersion;
  function acceptFix(value){
   if(version!==requestVersion||world.hidden||battlePaused||document.hidden)return;
   const {latitude:lat,longitude:lng,accuracy}=value.coords,time=Number.isFinite(value.timestamp)?value.timestamp:Date.now();
   if(![lat,lng,accuracy].every(Number.isFinite)||Math.abs(lat)>85||Math.abs(lng)>180||accuracy<0||Date.now()-time>30000||time>Date.now()+5000)return;
   if(position&&(time<position.time||(accuracy>position.accuracy&&time-position.time<5000)))return;
   position={lat,lng,accuracy,time};checkCity();el('world-map-mode').textContent=accuracy<=50?'LIVE GPS':'GPS ESTIMATE';el('world-share').disabled=accuracy>1000;el('world-position').textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)} · accuracy ±${Math.round(accuracy)} m`;
   ensureOnline();status(accuracy>50?'Location found · refining GPS accuracy…':`Live GPS · accuracy ±${Math.round(accuracy)} m. ${sharing?'Sharing with nearby players.':'Connecting to nearby players…'}`);drawPosition();roadFallback();discoverMonsters();void window.RPGChests?.refresh();window.RPGChests?.updateRange();
  }
  let quickPending=false;
  function quickFix(){
   if(quickPending||!navigator.geolocation.getCurrentPosition)return;quickPending=true;
   try{navigator.geolocation.getCurrentPosition(value=>{quickPending=false;acceptFix(value);},error=>{quickPending=false;if(version===requestVersion&&error.code===1)gpsError(error);},{enableHighAccuracy:false,maximumAge:15000,timeout:5000});}catch{quickPending=false;}
  }
  status(position?'Refreshing GPS · showing your last known position…':'Finding your GPS location…');if(position){el('world-map-mode').textContent='UPDATING GPS';el('world-position').textContent=`Last known: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} · refreshing GPS…`;}el('world-gps').textContent='◎ Refresh GPS';follow=true;clearInterval(gpsTimer);
  gpsTimer=setInterval(()=>{if(world.hidden||document.hidden||battlePaused)return;drawPosition();encounters(monsterRows);if(!position||Date.now()-position.time>15000)quickFix();else ensureOnline();discoverMonsters();window.RPGChests?.updateRange();},5000);
  try{watch=navigator.geolocation.watchPosition(acceptFix,error=>{if(version===requestVersion&&!world.hidden)gpsError(error);},{enableHighAccuracy:true,maximumAge:10000,timeout:30000});quickFix();}catch{stopGPS('GPS could not start. Check location permissions and try again.');}

 }
 function refreshGPS(){
  if(battlePaused)return;
  if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;
  requestVersion++;monsterRequest=false;startGPS();
 }
 function freshPosition({force=false}={}){
  const valid=(p,age)=>p&&['lat','lng','accuracy','time'].every(k=>Number.isFinite(p[k]))&&Math.abs(p.lat)<=85&&Math.abs(p.lng)<=180&&p.accuracy>=0&&p.accuracy<=1000&&Date.now()-p.time<=age&&p.time<=Date.now()+5000;
  const cached=window.RPGWorld.position?.();if(!force&&valid(cached,15000))return Promise.resolve(cached);
  if(freshRequest)return freshRequest;
  if(!navigator.geolocation?.getCurrentPosition)return valid(cached,30000)?Promise.resolve(cached):Promise.reject(Error('Waiting for your device GPS. Check location permission.'));
  const version=requestVersion;
  freshRequest=new Promise((resolve,reject)=>{navigator.geolocation.getCurrentPosition(value=>{
   const next={lat:value.coords.latitude,lng:value.coords.longitude,accuracy:value.coords.accuracy,time:value.timestamp};
   if(!valid(next,30000)){reject(Error('Waiting for an accurate device location. Retrying automatically.'));return;}
   if(version===requestVersion&&!world.hidden&&!battlePaused){position=next;checkCity();drawPosition();encounters(monsterRows);window.RPGChests?.updateRange();}
   resolve(next);
  },()=>{const fallback=window.RPGWorld.position?.();if(valid(fallback,30000))resolve(fallback);else reject(Error('Waiting for your device GPS. Check location permission.'));},{enableHighAccuracy:true,maximumAge:0,timeout:6000});}).finally(()=>{freshRequest=null;});
  return freshRequest;
 }
 function showPeers(players){
  const valid=players.filter(p=>p&&typeof p.peerId==='string'&&['rogue','theft','assassin','mage','tank','archer','queen','crusader'].includes(p.heroId)&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.updatedAt>Date.now()-45000),ids=new Set(valid.map(p=>p.peerId));
  for(const [id,entry] of peerMarkers)if(!ids.has(id)){entry.marker?.remove();entry.row.remove();peerMarkers.delete(id);}
  el('world-player-count').textContent=`${valid.length} nearby adventurer${valid.length===1?'':'s'}`;
  el('world-online-status').textContent=valid.length?'Online players within 5 km. Updated every 8 seconds.':'You are online. No other adventurers are nearby yet.';
  for(const p of valid){const src=window.DamageSprites.sprite(p.heroId,100,'right'),key=`${p.heroId}:${p.name}:${p.level}:${Math.round(p.accuracy)}`;let entry=peerMarkers.get(p.peerId);
   if(!entry){const row=document.createElement('button');row.type='button';row.className='world-player';row.addEventListener('click',()=>window.RPGBattle.encounter(p.peerId,true));el('world-players').append(row);entry={row};peerMarkers.set(p.peerId,entry);}
   if(entry.key!==key){const img=document.createElement('img');img.src=src;img.alt='';const text=document.createElement('span');text.textContent=p.name;const small=document.createElement('small');small.textContent=`Level ${p.level} · GPS ±${Math.round(p.accuracy)} m · Tap to challenge`;text.append(small);entry.row.replaceChildren(img,text);entry.key=key;}
   const pinKey=`${p.heroId}:${p.name}:${p.level}`;if(entry.pinKey!==pinKey){entry.marker?.remove();entry.marker=null;entry.pinKey=pinKey;}
   if(map&&!entry.marker){const icon=L.divIcon({className:'world-player-pin',html:upright(`<img src="${src}" alt=""><span>${safe(p.name)}</span>`,24,48),iconSize:[48,60],iconAnchor:[24,48]});entry.marker=L.marker([p.lat,p.lng],{icon}).addTo(map);const popup=document.createElement('div');popup.textContent=`${p.name} · Level ${p.level}`;entry.marker.bindPopup(popup);entry.marker.on('click',()=>window.RPGBattle.encounter(p.peerId,true));}
   else if(entry.lat!==p.lat||entry.lng!==p.lng)entry.marker?.setLatLng([p.lat,p.lng]);entry.lat=p.lat;entry.lng=p.lng;
  }
 }
 async function sync(){
  if(busy||!sharing||!position||world.hidden)return;
  if(Date.now()-position.time>30000){offline('Refreshing your GPS automatically…');refreshGPS();return;}
  const version=onlineVersion,payload={heroId:hero.id,name:state.name,level:state.level,lat:position.lat,lng:position.lng,accuracy:position.accuracy};busy=true;
  try{
   await queue(async()=>{if(!sharing||version!==onlineVersion)return;const r=await fetch('/api/world/presence',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok){const error=new Error(r.status===401?'Sign in to this account to go online.':r.status===429?'Player sharing is busy. Retrying automatically.':'Player presence is unavailable. Please try again.');throw error;} });
   if(!sharing||version!==onlineVersion)return;const r=await fetch('/api/world/presence',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Unable to refresh nearby players.');const result=await r.json();if(sharing&&version===onlineVersion){showPeers(Array.isArray(result.players)?result.players:[]);status(`Live GPS · sharing with nearby players · accuracy ±${Math.round(position.accuracy)} m`);}
  }catch(error){if(sharing&&version===onlineVersion){nextOnlineAttempt=Date.now()+8000;offline((error.message||'Network unavailable.')+' Retrying automatically.');}}
  finally{busy=false;}
 }
 function online(){if(sharing){offline();status(position?'Live GPS · player sharing is off.':'GPS is off.');return;}if(!position||position.accuracy>1000||Date.now()-position.time>30000){status('Wait for a fresh, accurate GPS location before going online.');return;}sharing=true;onlineVersion++;el('world-share').textContent='Go offline';el('world-online-status').textContent='Connecting to nearby adventurers…';sync();timer=setInterval(sync,8000);}
 function open(nextHero,nextState){refresh(nextHero,nextState);if(resumeFix)position={...resumeFix};resumeFix=null;el('hr-room').hidden=true;world.hidden=false;document.querySelector('.app').hidden=true;initMap();drawPosition();encounters(monsterRows);el('world-exit').focus();observePermission();startGPS();ensureOnline();void discoverMonsters(true);void window.RPGChests?.refresh();window.RPGBattle?.connect(hero,state);clearInterval(monsterTimer);monsterTimer=setInterval(discoverMonsters,2000);}
 function leave(exit){const fix=position&&({...position});window.RPGBattle?.stop();stopGPS();resumeFix=exit?null:fix;world.hidden=true;el('hr-room').hidden=false;window.RPGRoom.refresh();if(!exit)window.RPGRoom.inventory();el(exit?'hr-back':'hi-hero-room').focus();if(exit){window.dispatchEvent(new CustomEvent('chessburger:rpg-exit'));if(window.parent!==window)window.parent.postMessage({type:'CHESS_BURGER_RPG_EXIT'},location.origin);}}
 el('world-gps').addEventListener('click',refreshGPS);el('world-share').addEventListener('click',online);el('world-exit').addEventListener('click',()=>leave(true));
 for(const id of ['world-equipment','world-bag-open'])el(id).addEventListener('click',()=>leave(false));
 el('world-book').addEventListener('click',()=>window.RPGRoom.utility('book'));el('world-shop').addEventListener('click',()=>window.RPGRoom.utility('shop'));
 el('world-center').addEventListener('click',()=>{if(!position){status('Enable GPS to center the map on your location.');return;}follow=true;cameraFix=null;drawPosition();});el('world-zoom-in').addEventListener('click',()=>map?.zoomIn());el('world-zoom-out').addEventListener('click',()=>map?.zoomOut());
 el('world-map-retry').addEventListener('click',()=>{if(!map){initMap();return;}el('world-map-fallback').hidden=true;loadBasemap();});
 document.addEventListener('visibilitychange',()=>{if(world.hidden)return;if(document.hidden){offline();status('GPS tracking remains enabled. Your browser may pause updates in the background.');}else refreshGPS();});window.addEventListener('pageshow',()=>{if(!world.hidden)refreshGPS();});window.addEventListener('pagehide',()=>{if(!world.hidden)stopGPS();});window.addEventListener('online',()=>{if(!world.hidden&&!battlePaused){nextOnlineAttempt=0;refreshGPS();}});window.addEventListener('offline',()=>{if(!world.hidden){offline('Network offline. Player sharing has stopped.');status('Network offline. GPS can continue on this device.');}});
 let rangeNotice=null,rangeDismissTimer=null,rangeHideTimer=null;
 function dismissRangeNotice(){if(!rangeNotice)return;clearTimeout(rangeDismissTimer);clearTimeout(rangeHideTimer);rangeNotice.classList.add('leaving');rangeHideTimer=setTimeout(()=>{rangeNotice.hidden=true;},350);}
 function outOfRange(distance,pvp=false,context='combat'){
  if(!rangeNotice){rangeNotice=document.createElement('section');rangeNotice.className='world-range-notice';rangeNotice.setAttribute('role','status');rangeNotice.setAttribute('aria-live','polite');rangeNotice.innerHTML='<button type="button" aria-label="Close distance message">×</button><span aria-hidden="true">◎</span><h2></h2><p></p><small></small>';rangeNotice.querySelector('button').onclick=dismissRangeNotice;document.body.append(rangeNotice);}
  clearTimeout(rangeDismissTimer);clearTimeout(rangeHideTimer);rangeNotice.classList.remove('leaving');rangeNotice.hidden=false;
  const merchant=context==='merchant';
  rangeNotice.querySelector('h2').textContent=merchant?'Merchant too far away':'Outside attack range';
  rangeNotice.querySelector('small').textContent=`${merchant?'Trading':'Attack'} range · 200 meters`;
  rangeNotice.querySelector('button').setAttribute('aria-label',`Close ${merchant?'trading':'attack'} range message`);
  rangeNotice.querySelector('p').textContent=`This ${merchant?'merchant':pvp?'player':'monster'} is too far away${Number.isFinite(distance)?` (about ${Math.ceil(distance)} m)`:''}. Move within 200 meters to ${merchant?'trade':'battle'}.`;
  rangeDismissTimer=setTimeout(dismissRangeNotice,10000);
 }
 const encounterPins=new Map();
 function meters(a,b){const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
 function roadFallback(){} // Encounter coordinates are always assigned by the server.
 function primeEncounters(cache){
  if(cityPending)return;
  if(!cache||cache.refreshAt<=Date.now())return;
  monsterRefreshAt=cache.refreshAt;encounters(cache.encounters||[]);
 }
 function syncEncounters(data){
  if(data.spawnStatus==='ready'){monsterRefreshAt=data.refreshAt||Date.now()+1800000;encounters(data.encounters||[]);if(data.message)el('world-monster-status').textContent=data.message;}
 }
 async function discoverMonsters(force=false){
  if(battlePaused||cityPending||world.hidden||document.hidden||!position||Date.now()-position.time>30000)return;
  const now=Date.now();encounters(monsterRows);
  if(monsterRequest||(!force&&now<monsterRefreshAt))return;
  if(now-lastMonsterAttempt<2000)return;
  lastMonsterAttempt=now;monsterRequest=true;const version=requestVersion,epoch=cityEpoch,fix={...position};
  el('world-monster-status').textContent='Loading fixed monster locations…';
  try{const data=await window.RPGBattle.spawn(fix);if(!data||version!==requestVersion||epoch!==cityEpoch||cityPending||world.hidden)return;monsterRefreshAt=data.refreshAt||now+5000;syncEncounters(data);if(!monsterRows.length)el('world-monster-status').textContent=data.message||'Loading roads and nearby monsters…';}
  catch(error){if(version===requestVersion&&epoch===cityEpoch){monsterRefreshAt=now+5000;if(!monsterRows.length)el('world-monster-status').textContent='Loading road encounters · retrying automatically. GPS remains on.';}}
  finally{if(version===requestVersion&&epoch===cityEpoch)monsterRequest=false;}
 }
 function encounters(rows){
  const signature=`${cityEpoch}:${position?.lat}:${position?.lng}:${state?.practiceAwards?.length||0}:`+rows.map(e=>`${e.id},${e.lat},${e.lng},${e.level},${e.monsterId},${e.name},${e.expires_at}`).join(';');
  if(map&&signature===lastEncounterSignature&&Date.now()<nextEncounterExpiry)return;
  lastEncounterSignature=signature;nextEncounterExpiry=Math.min(...rows.map(e=>e.expires_at),Infinity);
  monsterRows=(cityPending?[]:rows).filter(e=>(!currentCity||window.RPGCityBoundary.contains(currentCity,e))&&e.expires_at>Date.now()&&!state?.practiceAwards?.some(a=>a.id===`device-${e.id}`));
  const visible=position?monsterRows.filter(e=>meters(position,e)<=window.RPGEncounterLayout.SPAWN_RADIUS):[];
  if(!map)return;const ids=new Set(visible.map(e=>e.id));for(const [id,pin] of encounterPins)if(!ids.has(id)){pin.remove();encounterPins.delete(id);}
  for(const e of visible){
   const distance=meters(position,e),reachable=distance<=200,label=`${Math.ceil(distance)} m · ${reachable?'In reach':'Move closer'}`;
   let pin=encounterPins.get(e.id);
   if(!pin){const src=window.DamageSprites.sprite(e.monsterId,100,'left');const icon=L.divIcon({className:'world-monster-pin',html:upright(`<div class="world-monster-marker"><b class="world-monster-level">LVL ${Number(e.level)}</b><img src="${src}" alt=""><i class="world-monster-location" aria-hidden="true"></i><span>${safe(e.name)}</span><span class="world-monster-distance"></span></div>`,42,87),iconSize:[84,124],iconAnchor:[42,87]});pin=L.marker([e.lat,e.lng],{icon,alt:`${e.name}, LVL ${e.level}`}).addTo(map);pin.on('click',()=>window.RPGBattle.encounter(e.id));encounterPins.set(e.id,pin);}
   const node=pin.getElement?.();if(node){node.classList.toggle('world-in-range',reachable);const range=node.querySelector('.world-monster-distance');if(range)range.textContent=label;node.setAttribute('aria-label',`${e.name}, LVL ${e.level}, ${label}`);node.title=`${e.name} · ${label} · 200 m attack range`;}
  }
 }
 const merchantPins=new Map();
 function showMerchants(rows){merchantRows=rows;if(!map)return;const ids=new Set(rows.map(m=>m.id));for(const [id,pin] of merchantPins)if(!ids.has(id)){pin.remove();merchantPins.delete(id);}for(const merchant of rows){if(merchantPins.has(merchant.id))continue;const icon=L.divIcon({className:'world-merchant-pin',html:upright(`<div class="world-merchant-marker"><img src="assets/merchant/merchant-pin.webp" alt=""><span>Merchant</span></div>`,35,65),iconSize:[70,80],iconAnchor:[35,65]}),pin=L.marker([merchant.lat,merchant.lng],{icon,alt:merchant.name,zIndexOffset:900}).addTo(map);pin.on('click',()=>{if(cityPending||!position)return;if(meters(position,merchant)>200){outOfRange(meters(position,merchant),false,'merchant');return;}window.RPGMerchant?.open(state,merchant);});merchantPins.set(merchant.id,pin);}}
 function clearCity(){cityEpoch++;cityPending=true;monsterRequest=false;monsterRefreshAt=0;lastMonsterAttempt=0;encounters([]);showChests([]);showMerchants([]);window.RPGMerchant?.clear();window.RPGBattle?.clearCity?.();window.RPGChests?.clearCity();el('world-monster-status').textContent='Entering a new city · discovering local encounters…';}
 function checkCity(){const gps=window.RPGWorld.position();if(currentCity&&!cityPending&&gps&&!window.RPGCityBoundary.contains(currentCity,gps))clearCity();}
 function applyCity(city,merchants=[]){const gps=window.RPGWorld.position();if(!gps||!window.RPGCityBoundary.contains(city,gps))return false;const changed=cityPending||currentCity?.id!==city.id;if(changed){cityEpoch++;monsterRequest=false;monsterRefreshAt=0;lastMonsterAttempt=0;monsterRows=[];encounters([]);}currentCity=city;cityPending=false;showMerchants(merchants);if(changed)void discoverMonsters(true);return true;}
 function merchantArea(){if(currentCity&&!cityPending)chestArea(currentCity.bounds);else{status('Finding merchants in your current city…');void window.RPGChests?.refresh(true);}}
 const chestPins=new Map();
 function showChests(rows){if(!map)return;const ids=new Set(rows.map(c=>c.id));for(const [id,pin]of chestPins)if(!ids.has(id)){pin.remove();chestPins.delete(id);}for(const chest of rows){if(chestPins.get(chest.id)?.chestClaimed===!!chest.claimed)continue;if(chestPins.has(chest.id)){chestPins.get(chest.id).remove();chestPins.delete(chest.id);}const icon=L.divIcon({className:'world-chest-pin',html:upright(`<div class="world-chest-marker chest-${chest.kind}${chest.claimed?' chest-claimed':''}"><img src="assets/chests/${['golden','emerald','enchanted'].includes(chest.kind)?chest.kind:'golden'}.webp" alt=""><span>${safe(chest.name)}${chest.claimed?' · Claimed':''}</span></div>`,40,60),iconSize:[80,79],iconAnchor:[40,60]}),marker=L.marker([chest.lat,chest.lng],{icon,alt:chest.name,zIndexOffset:1000}).addTo(map);marker.chestClaimed=!!chest.claimed;marker.on('click',()=>window.RPGChests?.open(chest));chestPins.set(chest.id,marker);}}
 function chestArea(bounds){if(!map)return;follow=false;map.fitBounds([[bounds[0],bounds[2]],[bounds[1],bounds[3]]],{padding:[45,45],maxZoom:15});}
 el('world-battle-lab').addEventListener('click',()=>window.RPGBattle.openLab());
 window.RPGWorld={freshPosition,checkCity,applyCity,merchants:()=>merchantRows.slice(),merchantArea,showMerchants,city:()=>currentCity,cityPending:()=>cityPending,showChests,chestArea,version:()=>requestVersion,open,refresh,pauseForBattle,resumeAfterBattle,primeEncounters,outOfRange,stop:stopGPS,encounters,syncEncounters,offline,position:()=>position&&({...position}),monster:id=>monsterRows.find(e=>e.id===id),consume(id){encounters(monsterRows.filter(e=>e.id!==id));}};
})();
