(function(){
 'use strict';window.RPG_LIVE=true;
 const originalFetch=window.fetch.bind(window),requests=new Map();let account=null,queue=Promise.resolve(),started=false,saving=false,sequence=0,generation=null;
 const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
 function request(method,body){
  body={...body,generation};
  const id=`rpg-${Date.now()}-${++sequence}`;return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{requests.delete(id);reject(Error('Connection timed out. Please retry.'));},45000);
   requests.set(id,{resolve,reject,timeout});parent.postMessage({type:'CB_RPG_API',id,method,body},location.origin);
  });
 }
 async function rpc(method,body){const snapshot=clone(body);if(snapshot.channel==='presence'||snapshot.action==='chests')return request(method,snapshot);if(!['save','init'].includes(snapshot.action)&&savePromise){await flushSave();if(pendingSave)throw Error('Your inventory is still saving. Reconnect before continuing.');}else if(!['save','init'].includes(snapshot.action)&&pendingSave){await flushSave();if(pendingSave)throw Error('Your inventory is still saving. Reconnect before continuing.');}const pending=queue.catch(()=>{}).then(()=>request(method,snapshot));queue=pending;return pending;}
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;
  const data=event.data;if(data?.type==='CB_RPG_REPLY'){const task=requests.get(data.id);if(!task)return;clearTimeout(task.timeout);requests.delete(data.id);if(data.data?.code==='hero_reset'){location.reload();return;}task.resolve({status:data.status,data:data.data});}
  if(data?.type==='CB_RPG_BOOT'&&!account){account=data.userId;if(started)initialize();}
 });
 async function api(body){const result=await rpc('POST',body);if(result.status>=400)throw Object.assign(Error(result.data.error||'Game save failed.'),{status:result.status});return result.data;}
 const key=id=>`chessburger_live_rpg_${account}_${id}`;
 function message(text){const node=document.getElementById('hr-feedback');if(node)node.textContent=text;}
 let pendingSave=null,savePromise=null,retryTimer=null,confirmedInventory=null;const inventoryKey=s=>JSON.stringify([s.items,s.grids,s.active,s.spellStorage,s.learned]);
 const pendingKey=()=>`chessburger_rpg_pending_${account}`;
 function saveStatus(text){const node=document.getElementById('rpg-autosave-status');if(node)node.textContent=text;}
 async function flushSave(){
  if(savePromise){await savePromise;return !pendingSave;}
  savePromise=(async()=>{saving=true;while(pendingSave){const copy=pendingSave;pendingSave=null;saveStatus('Saving…');try{const result=await rpc('POST',{action:'save',state:copy});if(result.status>=400)throw Object.assign(Error(result.data.error||'Save failed.'),{status:result.status});if(!pendingSave){confirmedInventory=inventoryKey(result.data.game);localStorage.setItem(key(result.data.game.heroId),JSON.stringify(result.data.game));localStorage.removeItem(pendingKey());saveStatus('Saved');}}catch(error){if(!pendingSave)pendingSave=copy;saveStatus('Save pending');message(error.message+' Your changes are kept on this device.');clearTimeout(retryTimer);if(!error.status||error.status>=500)retryTimer=setTimeout(()=>void flushSave(),5000);break;}}})().finally(()=>{saving=false;savePromise=null;});await savePromise;return !pendingSave;
 }
 window.RPGLive={key,flush:flushSave,save(state){if(!account||!state||!pendingSave&&!savePromise&&inventoryKey(state)===confirmedInventory)return;pendingSave=clone(state);try{localStorage.setItem(pendingKey(),JSON.stringify({generation,state:pendingSave}));}catch{}void flushSave();}};
 window.addEventListener('online',()=>void flushSave());
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(!document.getElementById('hr-room')?.hidden)window.RPGRoom.persist();void flushSave();}});
 window.addEventListener('pagehide',()=>{if(!document.getElementById('hr-room')?.hidden)window.RPGRoom.persist();void flushSave();});
 setInterval(()=>{if(account&&!document.hidden&&!document.getElementById('hr-room')?.hidden&&!document.getElementById('rpg-merchant')?.open)window.RPGRoom.persist();},20000);
 window.fetch=async function(input,options={}){
  const url=typeof input==='string'?new URL(input,location.href):new URL(input.url);
  if(url.origin===location.origin&&['/api/battle','/api/world/presence'].includes(url.pathname)){
   const body=options.body?JSON.parse(options.body):{};body.channel=url.pathname.includes('presence')?'presence':'battle';
   const result=await rpc(options.method||'GET',body);if(result.data?.game&&!pendingSave&&!savePromise)confirmedInventory=inventoryKey(result.data.game);return new Response(JSON.stringify(result.data),{status:result.status,headers:{'Content-Type':'application/json'}});
  }return originalFetch(input,options);
 };
 async function exit(){message('Saving your hero…');try{await flushSave();await queue;}catch{}parent.postMessage({type:'CB_RPG_EXIT'},location.origin);}
 async function initialize(){
  const button=document.getElementById('saveBtn');button.disabled=true;
  try{const data=await api({action:'init'});generation=data.generation||null;if(data.game){try{const saved=JSON.parse(localStorage.getItem(pendingKey())||'null');if(saved?.state&&(saved.generation||null)===generation&&(saved.state.inventoryRevision||0)===(data.game.inventoryRevision||0)){const restored=await api({action:'save',state:saved.state});data.game=restored.game;localStorage.removeItem(pendingKey());}}catch(error){if(!error.status||error.status>=500)throw error;localStorage.removeItem(pendingKey());message(error.message);}}window.RPGWorld.primeEncounters(data.spawnCache);if(data.game){localStorage.setItem(key(data.game.heroId),JSON.stringify(data.game));confirmedInventory=inventoryKey(data.game);const hero=HEROES.find(h=>h.id===data.game.heroId);window.RPGRoom.open(hero,data.game.name);}else{document.getElementById('heroName').value='';document.getElementById('heroName').focus();}button.disabled=false;document.getElementById('live-loading').remove();}
  catch(error){const loading=document.getElementById('live-loading');loading.textContent=error.message;const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>{loading.textContent='Loading your hero…';initialize();};loading.append(retry);}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  started=true;document.documentElement.dataset.live='true';const manualSave=document.getElementById('hr-save');manualSave.hidden=true;const badge=document.createElement('span');badge.id='rpg-autosave-status';badge.setAttribute('role','status');badge.textContent='Saved';manualSave.after(badge);
  const loading=document.createElement('div');loading.id='live-loading';loading.textContent='Loading your hero…';document.body.append(loading);
  for(const id of ['hr-collect','hr-damage','hr-levelup','hr-test-cbg','world-battle-lab','bt-practice','world-shop','world-wallet']){const el=document.getElementById(id);if(el){el.hidden=true;el.setAttribute('aria-hidden','true');}}
  const header=document.querySelector('.topbar');const leave=document.createElement('button');leave.type='button';leave.className='live-exit';leave.textContent='← Exit RPG';leave.onclick=exit;header.append(leave);
  const pill=document.querySelector('.topbar .badge');if(pill)pill.remove();
  const block=document.createElement('div');block.className='live-starter';
  const choices=document.getElementById('choices');choices.before(block);const skillChoice=window.RPGSkillPicker.create(block);
  const dialog=document.createElement('dialog');dialog.className='live-confirm';dialog.innerHTML='<h2>Confirm your only hero</h2><p></p><div><button type="button" data-cancel>Go back</button><button type="button" data-confirm>Confirm & enter Hero Room</button></div><small role="status"></small>';document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  const save=document.getElementById('saveBtn');save.textContent='CONFIRM HERO →';
  save.addEventListener('click',event=>{
   event.preventDefault();event.stopImmediatePropagation();const name=document.getElementById('heroName').value.trim(),skill=skillChoice;
   if(name.length<2||name.length>24){showToast('Enter a name of 2–24 characters.');return;}if(!skill.value){skill.focus();showToast('Choose your additional starting attack.');return;}
   dialog.querySelector('p').textContent=`${name} · ${selected.name} (${selected.heroClass}) · Basic Tackle + ${window.RPGInventory.spellMap[skill.value].name}. You cannot change this hero after entering the Hero Room.`;dialog.showModal();
  },true);
  dialog.querySelector('[data-confirm]').onclick=async()=>{
   const confirm=dialog.querySelector('[data-confirm]');confirm.disabled=true;dialog.querySelector('small').textContent='Saving your hero…';
   try{const data=await api({action:'register',heroId:selected.id,name:document.getElementById('heroName').value.trim(),skill:skillChoice.value});generation=data.generation||null;localStorage.setItem(key(data.game.heroId),JSON.stringify(data.game));dialog.close();confirmedInventory=inventoryKey(data.game);window.RPGRoom.open(HEROES.find(h=>h.id===data.game.heroId),data.game.name);}
   catch(error){dialog.querySelector('small').textContent=error.message;}finally{confirm.disabled=false;}
  };
  document.getElementById('hr-back').addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();window.RPGRoom.persist();exit();},true);
  window.addEventListener('chessburger:rpg-exit',exit);
  // Remove development copy even from hidden dialogs; no test controls are reachable in the live UI.
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;node.nodeValue=node.nodeValue.replace(/\bLOCAL SANDBOX\b|\bRPG SANDBOX\b|\bSANDBOX\b/g,'ADVENTURE').replace(/Saved on this device only · No live changes/g,'One hero per account · choose carefully');}
  if(account)initialize();parent.postMessage({type:'CB_RPG_READY'},location.origin);
 });
})();
