(function(){
 'use strict';window.RPG_LIVE=true;
 const originalFetch=window.fetch.bind(window),requests=new Map();let account=null,queue=Promise.resolve(),started=false,saving=false,sequence=0;
 const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
 function request(method,body){
  const id=`rpg-${Date.now()}-${++sequence}`;return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{requests.delete(id);reject(Error('Connection timed out. Please retry.'));},45000);
   requests.set(id,{resolve,reject,timeout});parent.postMessage({type:'CB_RPG_API',id,method,body},location.origin);
  });
 }
 function rpc(method,body){const snapshot=clone(body);const pending=queue.catch(()=>{}).then(()=>request(method,snapshot));queue=pending;return pending;}
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;
  const data=event.data;if(data?.type==='CB_RPG_REPLY'){const task=requests.get(data.id);if(!task)return;clearTimeout(task.timeout);requests.delete(data.id);task.resolve({status:data.status,data:data.data});}
  if(data?.type==='CB_RPG_BOOT'&&!account){account=data.userId;if(started)initialize();}
 });
 async function api(body){const result=await rpc('POST',body);if(result.status>=400)throw Error(result.data.error||'Game save failed.');return result.data;}
 const key=id=>`chessburger_live_rpg_${account}_${id}`;
 function message(text){const node=document.getElementById('hr-feedback');if(node)node.textContent=text;}
 window.RPGLive={key,save(state){
  if(!account||!state)return;const copy=clone(state);saving=true;
  api({action:'save',state:copy}).then(data=>{localStorage.setItem(key(data.game.heroId),JSON.stringify(data.game));message('Hero saved to your Chess Burger account.');}).catch(error=>message(error.message+' Changes are not saved yet.')).finally(()=>saving=false);
 }};
 window.fetch=async function(input,options={}){
  const url=typeof input==='string'?new URL(input,location.href):new URL(input.url);
  if(url.origin===location.origin&&['/api/battle','/api/world/presence'].includes(url.pathname)){
   const body=options.body?JSON.parse(options.body):{};body.channel=url.pathname.includes('presence')?'presence':'battle';
   const result=await rpc(options.method||'GET',body);return new Response(JSON.stringify(result.data),{status:result.status,headers:{'Content-Type':'application/json'}});
  }return originalFetch(input,options);
 };
 async function exit(){message('Saving your hero…');try{await queue;}catch{}parent.postMessage({type:'CB_RPG_EXIT'},location.origin);}
 async function initialize(){
  const button=document.getElementById('saveBtn');button.disabled=true;
  try{const data=await api({action:'init'});if(data.game){localStorage.setItem(key(data.game.heroId),JSON.stringify(data.game));const hero=HEROES.find(h=>h.id===data.game.heroId);window.RPGRoom.open(hero,data.game.name);}else{document.getElementById('heroName').value='';document.getElementById('heroName').focus();}button.disabled=false;document.getElementById('live-loading').remove();}
  catch(error){const loading=document.getElementById('live-loading');loading.textContent=error.message;const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>{loading.textContent='Loading your hero…';initialize();};loading.append(retry);}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  started=true;document.documentElement.dataset.live='true';
  const loading=document.createElement('div');loading.id='live-loading';loading.textContent='Loading your hero…';document.body.append(loading);
  for(const id of ['hr-collect','hr-damage','hr-levelup','hr-test-cbg','world-battle-lab','bt-practice','hr-shop','world-shop','world-wallet']){const el=document.getElementById(id);if(el){el.hidden=true;el.setAttribute('aria-hidden','true');}}
  const header=document.querySelector('.topbar');const leave=document.createElement('button');leave.type='button';leave.className='live-exit';leave.textContent='← Exit RPG';leave.onclick=exit;header.append(leave);
  const pill=document.querySelector('.topbar .badge');if(pill)pill.remove();
  const block=document.createElement('label');block.className='live-starter';block.innerHTML='<span>CHOOSE YOUR SECOND ATTACK</span><select id="live-starter" required aria-label="Choose your second starting attack"><option value="">Choose one skill…</option></select><small>Basic Tackle is included. Your hero cannot be changed after confirmation.</small>';
  const choices=document.getElementById('choices');choices.before(block);
  for(const skill of window.RPG_ATTACK_SKILLS.filter(s=>s.id!=='basic')){const option=document.createElement('option');option.value=skill.id;option.textContent=`${skill.name} · ${skill.ap} AP / ${skill.mp} MP`;block.querySelector('select').append(option);}
  const dialog=document.createElement('dialog');dialog.className='live-confirm';dialog.innerHTML='<h2>Confirm your only hero</h2><p></p><div><button type="button" data-cancel>Go back</button><button type="button" data-confirm>Confirm & enter Hero Room</button></div><small role="status"></small>';document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  const save=document.getElementById('saveBtn');save.textContent='CONFIRM HERO →';
  save.addEventListener('click',event=>{
   event.preventDefault();event.stopImmediatePropagation();const name=document.getElementById('heroName').value.trim(),skill=block.querySelector('select');
   if(name.length<2||name.length>24){showToast('Enter a name of 2–24 characters.');return;}if(!skill.value){skill.focus();showToast('Choose your additional starting attack.');return;}
   dialog.querySelector('p').textContent=`${name} · ${selected.name} (${selected.heroClass}) · Basic Tackle + ${window.RPGInventory.spellMap[skill.value].name}. You cannot change this hero after entering the Hero Room.`;dialog.showModal();
  },true);
  dialog.querySelector('[data-confirm]').onclick=async()=>{
   const confirm=dialog.querySelector('[data-confirm]');confirm.disabled=true;dialog.querySelector('small').textContent='Saving your hero…';
   try{const data=await api({action:'register',heroId:selected.id,name:document.getElementById('heroName').value.trim(),skill:block.querySelector('select').value});localStorage.setItem(key(data.game.heroId),JSON.stringify(data.game));dialog.close();window.RPGRoom.open(HEROES.find(h=>h.id===data.game.heroId),data.game.name);}
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
