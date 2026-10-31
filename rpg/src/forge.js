(function(){
 'use strict';
 const C=window.RPGInventory,room=window.RPGRoom,images=window.RPG_ITEM_IMAGES;
 const recipes={cola:{name:'2 Normal → Cola',normal:2,cola:0},coconut:{name:'4 Normal → Coconut',normal:4,cola:0},'mixed-coconut':{name:'2 Normal + 1 Cola → Coconut',normal:2,cola:1},tuba:{name:'10 Normal → Tuba Wine',normal:10,cola:0}};
 const families={hp:C.potions.health,mp:C.potions.mana,ap:C.potions.attack},safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let mode='potion',family='hp',recipe='cola',selected=[],pending=null,busy=false,dropPending=null,walletBalance=null;
 const dialog=document.createElement('dialog');dialog.id='rpg-forge';dialog.className='rpg-forge';dialog.innerHTML='<header><div><small>HERO INVENTORY</small><h2>Merge &amp; Forge</h2></div><button type="button" data-close aria-label="Close merge and forge">×</button></header><nav><button type="button" data-mode="potion">Potions</button><button type="button" data-mode="gear">Equipment</button></nav><div data-options></div><div class="forge-items" data-items></div><p class="forge-note" data-note></p><div class="forge-result" data-result role="status" aria-live="polite"></div><footer><button type="button" data-close>Cancel</button><button type="button" data-forge>Merge</button></footer>';
 document.body.append(dialog);
 const q=s=>dialog.querySelector(s),snapshot=()=>room.snapshot(),eligible=()=>snapshot().items.filter(i=>['bag','stash'].includes(i.where));
 function inventoryRevision(){const state=snapshot();try{return JSON.parse(localStorage.getItem(window.RPGLive.key(state.heroId)))?.inventoryRevision??state.inventoryRevision??0;}catch{return state.inventoryRevision||0;}}
 function open(uid){if(busy)return;const item=eligible().find(i=>i.uid===uid);mode=item&&!C.isConsumable(item)?'gear':'potion';if(item&&C.isConsumable(item))family=C.potions.get(item).restore.resource;selected=item&&mode==='gear'?[uid]:[];pending=null;walletBalance=null;q('[data-result]').textContent='';render();dialog.showModal();void refreshWallet();}
 async function refreshWallet(){try{const r=await fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'forgeWallet'})}),d=await r.json();if(!r.ok)throw Error(d.error);walletBalance=d.cbg;room.accept({...snapshot(),cbg:d.cbg});if(dialog.open)render();}catch(error){if(dialog.open)q('[data-result]').textContent=error.message;}}
 const requestId=()=>{if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));return 'forge-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');};
 const button=document.createElement('button');button.id='hi-forge-open';button.type='button';button.className='hr-btn';button.innerHTML='⚒ <span>Merge</span>';button.title='Stack and upgrade potions · forge weapons and armor';button.onclick=()=>open();
 document.getElementById('hi-hero-room').parentElement.insertBefore(button,document.getElementById('hi-explore'));
 function render(){
  for(const node of dialog.querySelectorAll('[data-mode]')){node.setAttribute('aria-pressed',String(node.dataset.mode===mode));node.disabled=busy;}
  q('[data-options]').innerHTML=mode==='potion'?'<label>Resource <select data-family>'+Object.entries(C.potions.resources).map(([id,v])=>`<option value="${id}" ${id===family?'selected':''}>${v.name}</option>`).join('')+'</select></label><label>Recipe <select data-recipe>'+Object.entries(recipes).map(([id,v])=>`<option value="${id}" ${id===recipe?'selected':''}>${v.name}</option>`).join('')+'</select></label>':'';
  const items=eligible().filter(i=>mode==='gear'?!C.isConsumable(i):families[family].slice(0,2).some(d=>d.id===i.defId));
  q('[data-items]').innerHTML=items.length?items.map(i=>`<button type="button" data-ingredient="${safe(i.uid)}" aria-pressed="${mode==='gear'&&selected.includes(i.uid)}" title="${safe(C.itemMap[i.defId].name+' · '+C.quantity(i)+' owned · '+(C.isConsumable(i)?C.potions.describe(i):'iLvl '+i.iLvl))}" ${busy?'disabled':''}><img src="${images[C.itemMap[i.defId].sprite]}" alt="${safe(C.itemMap[i.defId].name)}"><b>${C.quantity(i)}</b>${mode==='gear'&&selected.includes(i.uid)?'<span>✓</span>':''}</button>`).join(''):'<p>No eligible ingredients in your bag or stash.</p>';
  const counts={normal:0,cola:0};if(mode==='potion')for(const item of items)counts[item.defId===families[family][0].id?'normal':'cola']+=C.quantity(item);
  const req=recipes[recipe],ready=mode==='gear'?selected.length>=2:counts.normal>=req.normal&&counts.cola>=req.cola;
  const fee=C.forgeCost(mode==='gear'?selected.length:req.normal+req.cola);
  q('[data-note]').textContent=(mode==='gear'?'38% success · Failed attempts keep all ingredients.':`${counts.normal} Normal · ${counts.cola} Cola available.`)+` ${fee} CBG per attempt.`+(walletBalance===null?'':` Balance: ${walletBalance} CBG.`);
  q('[data-forge]').disabled=busy||!ready||walletBalance!==null&&walletBalance<fee;q('[data-forge]').textContent=busy?'Merging…':`${mode==='gear'?'Forge':'Merge potions'} · ${fee} CBG`;
  for(const node of dialog.querySelectorAll('select,[data-close]'))node.disabled=busy;
 }
 dialog.addEventListener('click',event=>{const close=event.target.closest('[data-close]');if(close&&!busy){dialog.close();return;}const tab=event.target.closest('[data-mode]');if(tab&&!busy){mode=tab.dataset.mode;selected=[];pending=null;q('[data-result]').textContent='';render();return;}const item=event.target.closest('[data-ingredient]');if(item&&mode==='gear'&&!busy){const id=item.dataset.ingredient;if(selected.includes(id))selected=selected.filter(x=>x!==id);else selected.push(id);pending=null;render();}if(event.target.closest('[data-forge]'))void submit();});
 dialog.addEventListener('change',event=>{if(event.target.matches('[data-family]'))family=event.target.value;if(event.target.matches('[data-recipe]'))recipe=event.target.value;pending=null;q('[data-result]').textContent='';render();});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 async function submit(){
  if(busy)return;busy=true;render();
  try{
   if(!pending&&await window.RPGLive.flush?.()===false)throw Error('Your inventory is still saving. Reconnect and retry.');
   if(!pending){let uids=selected.slice();if(mode==='potion'){uids=[];const req=recipes[recipe];for(const [id,amount]of[[families[family][0].id,req.normal],[families[family][1].id,req.cola]]){let left=amount;for(const item of eligible().filter(i=>i.defId===id)){if(left<=0)break;uids.push(item.uid);left-=C.quantity(item);}if(left>0)throw Error('Not enough ingredients for this recipe.');}}
    pending={action:'forge',recipe:mode==='gear'?'gear':recipe,uids,requestId:requestId(),inventoryRevision:inventoryRevision()};}
   const response=await fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)}),data=await response.json();
   if(!response.ok){if(response.status<500)pending=null;throw Error(data.error||'Merge unavailable. Your ingredients were not changed.');}
   room.accept(data.game);walletBalance=data.game.cbg;if(data.forge?.fee)parent.postMessage({type:'CB_RPG_WALLET_CHANGED'},location.origin);pending=null;selected=[];const result=data.forge,output=result.item;
   q('[data-result]').innerHTML=`${output?`<img src="${images[C.itemMap[output.defId].sprite]}" alt="${safe(C.itemMap[output.defId].name)}">`:''}<div><strong>${safe(result.message|| (result.success?'Merge complete':'Forge failed · ingredients kept'))}</strong>${output?`<p>${safe(C.forgeText(output).split(' · Curse:')[0])}</p>${(output.forged?.curses||[]).map(c=>`<p class="hr-curse">Curse: ${safe(C.curseNames[c.id])} ${c.value}%</p>`).join('')}`:''}</div>`;
  }catch(error){q('[data-result]').textContent=error.message;}finally{busy=false;render();}
 }
 function effect(uids,success,output,message=''){
  const nodes=[...document.querySelectorAll('#hr-room .hr-item')].filter(n=>uids.includes(n.dataset.uid));
  for(const node of nodes){const name=success?'hr-merge-success':'hr-merge-failed';node.classList.add(name);setTimeout(()=>node.classList.remove(name),850);}
  const anchor=nodes.at(-1);if(!anchor)return;
  const rect=anchor.getBoundingClientRect(),spark=document.createElement('div');spark.className='hr-merge-spark'+(success?'':' failed');spark.setAttribute('role','status');spark.setAttribute('aria-label',message||(success?'Items combined':'Items kept'));spark.title=message;
  if(output){const img=document.createElement('img');img.src=images[C.itemMap[output.defId].sprite];img.alt='';spark.append(img);}else{spark.textContent=success?'✦':'×';spark.setAttribute('aria-hidden','true');}
  Object.assign(spark.style,{left:(rect.left+rect.width/2)+'px',top:(rect.top+rect.height/2)+'px'});document.body.append(spark);setTimeout(()=>spark.remove(),850);
 }
 async function drop(sourceUids,targetUid){
  if(busy)return;const uids=[...new Set([...(Array.isArray(sourceUids)?sourceUids:[sourceUids]).filter(id=>id!==targetUid),targetUid])];
  const state=snapshot();if(!C.mergePlan(...uids.map(id=>state.items.find(i=>i.uid===id))))return;
  if(dropPending&&JSON.stringify(dropPending.uids)!==JSON.stringify(uids)){effect(uids,false,null,'Retry the previous drop to finish syncing.');return;}
  const root=document.getElementById('hr-room');busy=true;root.inert=true;root.classList.add('hr-merge-busy');
  try{
   if(!dropPending){if(await window.RPGLive.flush?.()===false)throw Error('Your inventory is still saving. Reconnect and retry.');dropPending={action:'forge',recipe:'auto',uids,requestId:requestId(),inventoryRevision:inventoryRevision()};}
   const response=await fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dropPending)}),data=await response.json();
   if(!response.ok){if(response.status<500)dropPending=null;throw Error(data.error||'Unable to combine items.');}
   room.accept(data.game);walletBalance=data.game.cbg;if(data.forge?.fee)parent.postMessage({type:'CB_RPG_WALLET_CHANGED'},location.origin);dropPending=null;const result=data.forge;effect(result.success?[result.item.uid]:uids,result.success,result.success?result.item:null,(result.message||'')+(result.fee?` ${result.fee} CBG charged.`:''));
  }catch(error){effect(uids,false,null,error.message);}finally{busy=false;root.inert=false;root.classList.remove('hr-merge-busy');}
 }
 window.RPGForge={open,drop,plan:C.mergePlan,busy:()=>busy};
})();
