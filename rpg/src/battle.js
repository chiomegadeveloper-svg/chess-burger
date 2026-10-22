(function(){
 'use strict';
 const el=id=>document.getElementById(id),root=el('rpg-battle'),R=window.RPGBattleRules,C=window.RPGInventory;
 let seenBattle='',seenEvent=0,shownHp=[],lastImpact=0,presenting=false,presentationToken=0;
 let pendingProgress=null,refreshing=false,encounterDialog=null,previewTarget=null;
 let attackQueue=[],enemyThinking=false,enemyCasting=null;
 let hero,state,battle=null,local=false,busy=false,pollTimer=null,clockTimer=null,dismissed=false,selected=null,chess=null,chessKey='',engine=null,engineReady=null,engineResolve=null,engineTimer=null,aiThinking=false,engineBroken=false,puzzleData=null,lastLog='';
 const notice=(s,important=false)=>{el('bt-notice').textContent=s;root.classList.toggle('bt-has-notice',important&&!!s);};
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uci=m=>({from:m.slice(0,2),to:m.slice(2,4),promotion:m[4]||'q'}),moveId=m=>m.from+m.to+(m.promotion||'');
 const loadout=()=>({heroId:hero.id,name:state.name,level:state.level,stats:C.totals(state,hero.stats),bonuses:C.bagBonus(state).map((n,i)=>n+C.spellBonus(state)[i]),active:state.active.slice()});
 async function api(input,signal){const r=await fetch('/api/battle',{signal,method:input?'POST':'GET',credentials:'same-origin',cache:'no-store',...(input?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})});let data;try{data=await r.json();}catch{throw Error('Battle service unavailable. Try again.');}if(!r.ok)throw Object.assign(Error(data.error||'Battle request failed.'),{code:data.code,distance:data.distance});if(data.defeatedEncounterId)window.RPGWorld.consume(data.defeatedEncounterId);if(data.progression&&data.progression.heroId===hero?.id)pendingProgress=data.progression;return data;}
 function show(){if(encounterDialog?.open){encounterDialog.close();previewTarget=null;}dismissed=false;root.hidden=false;el('rpg-world').inert=true;el('bt-close').focus();}
 function stopEngine(){engine?.terminate();engine=null;engineReady=null;clearTimeout(engineTimer);engineResolve?.reject(Error('Engine stopped.'));engineResolve=null;aiThinking=false;}
 function close(){cancelPresentation();root.hidden=true;el('bt-rules').hidden=true;el('rpg-world').inert=false;dismissed=true;el('world-battle-lab')?.focus();if(pendingHarvest)showHarvest();else if(battle?.status==='finished')openReport(battle);}
 function vitals(a){return [['Health','hp','maxHp','#7bc89f'],['Mana','mp','maxMp','#58c8dd'],['Attack points','ap','maxAp','#f29b65']].map(([label,key,max,color])=>`<div class="bt-vital"><span>${label.toUpperCase()} <b>${a[key]} / ${a[max]}</b></span><div><i style="--vital-color:${color};width:${Math.max(0,a[key]/a[max]*100)}%"></i></div></div>`).join('');}
 function sprite(a,facing){return window.DamageSprites.sprite(a.heroId,a.hp===0?0:a.hp/a.maxHp*100,facing);}
 const harvestModal=el('bt-harvest-modal');let pendingHarvest=null;
 function showHarvest(){
  if(!pendingHarvest||presenting||!harvestModal.hidden)return;
  const r=pendingHarvest;harvestModal.dataset.success=String(r.success);
  el('bt-harvest-title').textContent=r.success?'Harvest successful':'Harvest unsuccessful';
  el('bt-harvest-reason').textContent=r.reason;
  el('bt-harvest-gain').textContent=r.success?`+${r.amount} ${r.resource.toUpperCase()}${r.amount<20?' · resource cap reached':''}`:`No ${r.resource.toUpperCase()} gained`;
  root.inert=true;el('rpg-world').inert=true;harvestModal.hidden=false;el('bt-harvest-done').focus();
 }
 function dismissHarvest(){pendingHarvest=null;harvestModal.hidden=true;root.inert=false;el('rpg-world').inert=!root.hidden;draw();if(reportModal.hidden)el(root.hidden?'world-battle-lab':'bt-defend').focus();}
 el('bt-harvest-done').addEventListener('click',dismissHarvest);
 harvestModal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dismissHarvest();}else if(e.key==='Tab'){e.preventDefault();el('bt-harvest-done').focus();}});
 const reportModal=el('bt-report-modal');
 let reported=new Set(),lastReport=null;
 try{reported=new Set(JSON.parse(sessionStorage.getItem('chessburger_rpg_report_seen_v1')||'[]'));}catch{}
 const duration=ms=>ms===null?'Duration unavailable':`${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`;
 function openReport(ended,force=false){
  if(!ended||ended.status!=='finished'||(!force&&reported.has(ended.id)))return;
  const summary=R.battleSummary(ended,ended.me??0);if(!summary)return;
  lastReport=ended;reported.add(ended.id);try{sessionStorage.setItem('chessburger_rpg_report_seen_v1',JSON.stringify([...reported].slice(-50)));}catch{}
  const [you,enemy]=summary.actors;
  const before=state.level;let earned=0;
  if(local&&ended.winner===(ended.me??0)&&ended.endReason==='knockout'){state.practiceAwards=state.practiceAwards||[];const receipt=state.practiceAwards.find(r=>r.id===ended.id);earned=receipt?.xp??Math.min(1218290-(state.totalXp||0),window.RPGProgression.victoryXp(you.level,enemy.level));if(!receipt){C.gainXp(state,earned);state.practiceAwards.push({id:ended.id,xp:earned});state.practiceAwards=state.practiceAwards.slice(-50);}}
  else if(pendingProgress?.heroId===hero.id){earned=pendingProgress.battleId===ended.id?pendingProgress.awarded||0:0;C.applyProgress(state,pendingProgress.totalXp);pendingProgress=null;}
  window.RPGRoom.persist?.();window.RPGWorld.refresh?.();
  el('bt-summary-xp').textContent=`${local?'Device practice · ':''}+${earned} XP${state.level>before?` · LEVEL UP ${before} → ${state.level} · attributes restored for your next battle`:''}${state.level===88?' · MAX LEVEL':''}`;

  reportModal.dataset.outcome=summary.winner?'victory':'defeat';
  el('bt-summary-title').textContent=summary.winner?'Victory':'Defeat';
  const reason=summary.reason==='forfeit'?(summary.winner?'Your opponent forfeited.':'You forfeited this encounter.'):summary.reason==='timeout'?(summary.winner?'Your opponent ran out of time.':'You ran out of time.'):summary.reason==='knockout'?(summary.winner?`You defeated ${enemy.name}.`:`${enemy.name} won this encounter.`):'This encounter has ended.';
  el('bt-summary-reason').textContent=reason;
  for(const [id,actor,facing] of [['hero',you,'right'],['enemy',enemy,'left']]){el('bt-summary-'+id).src=sprite(actor,facing);el('bt-summary-'+id).alt=actor.name;}
  for(const [id,actor] of [['bt-summary-health',you],['bt-summary-enemy-health',enemy]]){el(id).max=actor.maxHp;el(id).value=actor.hp;}
  el('bt-summary-name').textContent=you.name;el('bt-summary-opponent').textContent=enemy.name;
  el('bt-summary-hp').textContent=`Level ${you.level} · ${you.hp} / ${you.maxHp} HP`;el('bt-summary-enemy-hp').textContent=`Level ${enemy.level} · ${enemy.hp} / ${enemy.maxHp} HP`;
  el('bt-summary-mode').textContent=ended.kind==='pvp'?'Player duel':enemy.heroId&&R.MONSTERS.find(m=>m.id===enemy.heroId)?.boss?'Boss encounter':'Monster encounter';
  el('bt-summary-rounds').textContent=`${summary.rounds} round${summary.rounds===1?'':'s'}`;el('bt-summary-duration').textContent=duration(summary.durationMs);
  el('bt-summary-partial').hidden=summary.complete;
  const rows=[['Damage dealt','damage'],['Damage taken','damageTaken'],['Attacks used','attacks'],['AP spent','apSpent'],['Mana spent','mpSpent'],['AP gained','apGained'],['Mana gained','mpGained'],['Defended turns','defends']];
  el('bt-summary-highlights').innerHTML=[['Damage dealt',you.stats?.damage],['Damage taken',you.stats?.damageTaken],['Attacks',you.stats?.attacks]].map(([label,value])=>`<div><b>${value??'—'}</b><span>${label}</span></div>`).join('');
  reportModal.querySelectorAll('details').forEach(d=>d.open=false);
  el('bt-summary-totals').innerHTML=rows.map(([label,key])=>`<tr><th scope="row">${label}</th><td>${you.stats?.[key]??'—'}</td><td>${enemy.stats?.[key]??'—'}</td></tr>`).join('');
  el('bt-summary-skills').innerHTML=[you,enemy].map((actor,i)=>`<section><h3>${i===0?'Your skills':'Opponent skills'}</h3>${actor.skills.length?actor.skills.map(s=>`<div><img src="assets/skills/icons/${s.id}.webp" alt=""><span>${esc(s.name)}</span><small>${s.uses}×</small><b>${s.damage} damage</b></div>`).join(''):'<p>No recorded attacks.</p>'}</section>`).join('');
  el('bt-report-review').hidden=root.hidden||!battle;
  root.inert=true;el('rpg-world').inert=true;reportModal.hidden=false;el('bt-report-map').focus();
 }
 function dismissReport(toMap=false){
  reportModal.hidden=true;root.inert=false;
  if(toMap||root.hidden){close();}else{el('rpg-world').inert=true;el('bt-review-report').focus();}
 }
 el('bt-report-map').addEventListener('click',()=>dismissReport(true));
 el('bt-report-review').addEventListener('click',()=>dismissReport());
 el('bt-report-close').addEventListener('click',()=>dismissReport());
 el('bt-review-report').addEventListener('click',()=>openReport(battle||lastReport,true));
 reportModal.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();dismissReport();}
  if(e.key==='Tab'){const nodes=[...reportModal.querySelectorAll('button,summary')].filter(n=>!n.hidden&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
 // The server owns combat; this queue only controls when damage becomes visible.
 function cancelPresentation(){
  presentationToken++;attackQueue=[];presenting=false;enemyThinking=false;enemyCasting=null;
  window.RPGSkillFX?.stop(el('bt-stage'));
  shownHp=battle?.actors.map(a=>a.hp)||[];seenBattle=battle?.id||'';seenEvent=battle?.eventSeq||0;lastImpact=seenEvent;
 }
 function observeHits(){
  if(!battle){if(seenBattle||presenting)cancelPresentation();return false;}
  if(seenBattle!==battle.id){cancelPresentation();return false;}
  const events=(battle.events||[]).filter(e=>e.id>seenEvent);
  if(events.length){
   if(root.hidden||document.hidden||events[0].id!==seenEvent+1){cancelPresentation();return false;}
   seenEvent=events.at(-1).id;attackQueue.push(...events);
   if(!presenting){presenting=true;return true;}
  }else if(!presenting)shownHp=battle.actors.map(a=>a.hp);
  return false;
 }
 function revealImpact(event,token){
  if(token!==presentationToken||event.id<=lastImpact||!battle)return;
  lastImpact=event.id;const target=event.target??(1-event.side);
  shownHp[target]=Number.isFinite(event.hpAfter)?event.hpAfter:Math.max(0,shownHp[target]-event.damage);
  draw();
  const me=battle.me??0,node=el(target===me?'bt-hero-art':'bt-enemy-art').parentElement;
  node.classList.remove('bt-impact-reaction');void node.offsetWidth;node.classList.add('bt-impact-reaction');
 }
 async function playHits(){
  const token=++presentationToken;
  try{
   while(attackQueue.length&&token===presentationToken){
    const events=attackQueue.splice(0),me=battle.me??0;
    if(window.RPGSkillFX?.sequence)await window.RPGSkillFX.sequence(el('bt-stage'),events.map(e=>({...e,reverse:e.side!==me,delayMs:battle.kind!=='pvp'&&e.side!==me?1000+Math.floor(Math.random()*2001):0})),{onPrepare:e=>{if(token!==presentationToken)return;enemyThinking=e.delayMs>0;enemyCasting=null;draw();},onAttack:e=>{if(token!==presentationToken)return;enemyThinking=false;enemyCasting=e.side!==me?e.skill:null;draw();},onImpact:e=>revealImpact(e,token)});
    // Missing/failed effects must still reconcile health and release the controls.
    if(token!==presentationToken)return;
    for(const event of events)revealImpact(event,token);
   }
  }catch(error){attackQueue=[];lastImpact=seenEvent;console.warn('Battle presentation interrupted:',error.message);}
  finally{if(token===presentationToken){presenting=false;enemyThinking=false;enemyCasting=null;shownHp=battle?.actors.map(a=>a.hp)||[];draw();}}
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&presenting){cancelPresentation();draw();}});
 function draw(){
  const startHits=observeHits();
  root.classList.toggle('bt-playing',!!battle);
  const ownChallenge=!!battle?.challenge&&battle.challenge.side===(battle.me??0);
  root.classList.toggle('bt-chess-mode',ownChallenge);
  const tools=el('bt-global-tools'),toolHome=battle?el('bt-turn-tools'):root.querySelector('.bt-header');if(tools.parentElement!==toolHome)toolHome.appendChild(tools);
  const runHome=ownChallenge?el('bt-own-actions'):root.querySelector('.bt-actions');if(el('bt-run').parentElement!==runHome)runHome.prepend(el('bt-run'));
  const abandonHome=ownChallenge?el('bt-own-actions'):el('bt-challenge').querySelector('header');if(el('bt-abandon').parentElement!==abandonHome)abandonHome.prepend(el('bt-abandon'));
  el('bt-lobby').hidden=!!battle;el('bt-fight').hidden=!battle;if(!battle){el('bt-title').textContent='Battle Lab';el('bt-clock').textContent='';return;}
  const me=battle.me??0,a={...battle.actors[me],hp:shownHp[me]??battle.actors[me].hp},enemy={...battle.actors[1-me],hp:shownHp[1-me]??battle.actors[1-me].hp},pending=battle.status==='pending',active=battle.status==='active',mine=battle.turn===me&&active,challenge=!!battle.challenge;
  el('bt-title').textContent=battle.kind==='pvp'?'Adventurer duel':enemy.boss?'Boss encounter':'Monster encounter';
  el('bt-own-name').textContent=a.name;el('bt-own-level').textContent=`Level ${a.level} · ${(HEROES.find(h=>h.id===a.heroId)?.heroClass||hero.heroClass)}`;el('bt-head').src=HERO_HEADS[a.heroId]||HERO_HEADS[hero.id];el('bt-own-vitals').innerHTML=vitals(a);
  el('bt-enemy-name').textContent=enemy.name;el('bt-enemy-level').textContent=`Level ${enemy.level} · ${battle.kind==='pvp'?'Adventurer':enemy.boss?'Boss':'Monster'}`;el('bt-enemy-vitals').innerHTML=vitals(enemy);
  el('bt-hero-art').src=sprite(a,'right');el('bt-hero-art').alt=`${a.name} · ${a.hp} health`;el('bt-enemy-art').src=sprite(enemy,'left');el('bt-enemy-art').alt=`${enemy.name} · ${enemy.hp} health`;el('bt-enemy-kind').textContent=enemy.name.toUpperCase();
  el('bt-enemy-stats').innerHTML=['Health','Attack','Magic','Armor','Mana','Wisdom'].map((name,i)=>`<div>${name}<b>${enemy.stats[i]}</b></div>`).join('');el('bt-bag').innerHTML=el('world-bag').innerHTML;el('bt-bag').style.aspectRatio=el('world-bag').style.aspectRatio;
  el('bt-round').textContent=`ROUND ${battle.round}`;el('bt-turn-label').textContent=presenting?(enemyThinking?`${enemy.name} is choosing a skill…`:'Attacking…'):pending?'Challenge pending':active?(mine?'Your turn':`${enemy.name}’s turn`):battle.status==='cancelled'?'Challenge closed':'Battle complete';el('bt-mode').textContent=local?'DEVICE PRACTICE':battle.training?'ONLINE PRACTICE':battle.kind==='pvp'?'GPS · PVP':'GPS · TRAINING';
  el('bt-stage').hidden=ownChallenge;el('bt-challenge').hidden=!ownChallenge;el('bt-pending').hidden=!pending;
  el('bt-pending-title').textContent=me===1?`${enemy.name} challenges you.`:`Waiting for ${enemy.name}…`;el('bt-accept').hidden=me!==1;el('bt-accept').disabled=busy;el('bt-decline').disabled=busy;
  el('bt-skills').innerHTML=Array.from({length:4},(_,i)=>a.active[i]||null).map(id=>{
   const s=R.SKILLS[id];if(!s)return '<button disabled type="button" aria-label="Empty skill slot"><strong>Empty slot</strong><small>Equip in Hero Room</small></button>';
   const cd=Math.max(0,(a.ready[id]||0)-a.turns),reason=!active?(pending?'Challenge pending':'Battle ended'):!mine?'Wait for your turn':!a.active.includes(id)?'Not equipped':cd?`Cooldown · ${cd} turn${cd===1?'':'s'}`:a.ap<s.ap?'Need more AP':a.mp<s.mp?'Need more mana':!mine?'Wait for your turn':challenge?'Harvest in progress':'Ready';
   return `<button type="button" data-bt-skill="${id}" title="${s.name} · ${s.ap} AP · ${s.mp} MP · ${s.cooldown} turn cooldown" ${busy||presenting||!R.usable(battle,me,id)?'disabled':''}><img src="assets/skills/icons/${id}.webp" alt=""><strong>${s.name}</strong><small>${s.ap} AP / ${s.mp} MP</small><em>${reason}</em></button>`;
  }).join('');
  el('bt-enemy-skills').innerHTML=Array.from({length:4},(_,i)=>enemy.active[i]||null).map(id=>{
   const s=R.SKILLS[id];if(!s)return '<div class="bt-enemy-skill bt-empty-skill"><span>Empty slot</span></div>';
   const cd=Math.max(0,(enemy.ready[id]||0)-enemy.turns),casting=enemyCasting===id,reason=casting?'Attacking':enemyThinking?'Choosing…':cd?`Cooldown · ${cd}`:enemy.ap<s.ap?'Need AP':enemy.mp<s.mp?'Need mana':'Ready';
   return `<div class="bt-enemy-skill ${casting?'bt-casting':''}" title="${s.name} · ${s.ap} AP · ${s.mp} MP · ${s.cooldown} turn cooldown"><img src="assets/skills/icons/${id}.webp" alt=""><strong>${s.name}</strong><small>${s.ap} AP / ${s.mp} MP</small><em>${reason}</em></div>`;
  }).join('');
  for(const id of ['bt-ap','bt-mp','bt-defend'])el(id).disabled=busy||presenting||!mine||challenge;
  el('bt-ap').disabled ||=a.ap>=a.maxAp;el('bt-mp').disabled ||=a.mp>=a.maxMp;el('bt-run').disabled=busy||presenting||!['active','pending'].includes(battle.status);el('bt-abandon').disabled=busy||presenting;
  el('bt-result').textContent=presenting||active||pending?'':battle.status==='cancelled'?'Challenge closed':battle.winner===me?'Victory!':'Defeat · try again';
  const log=battle.log.join('|');if(!presenting&&log!==lastLog){el('bt-log').innerHTML=battle.log.map(s=>`<p>${esc(s)}</p>`).join('');el('bt-log').scrollTop=el('bt-log').scrollHeight;lastLog=log;}
  if(ownChallenge)challengeView();else{chessKey='';chess=null;selected=null;stopEngine();}
  el('bt-review-report').hidden=presenting||battle.status!=='finished';
  tick();
  if(startHits)void playHits();
  showHarvest();
  if(battle.status==='finished'&&!presenting&&!pendingHarvest)openReport(battle);
 }
 function tick(){if(!battle||!['pending','active'].includes(battle.status)){el('bt-clock').textContent='';return;}const seconds=Math.max(0,Math.ceil((battle.deadline-Date.now())/1000));el('bt-clock').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} left`;if(local&&R.timeout(battle)){notice('Time expired.');draw();}}
 async function refresh(){if(!hero||local||busy||refreshing||el('rpg-world').hidden)return;refreshing=true;const requestedBattle=battle?.id;try{const data=await api();if(local||battle?.id!==requestedBattle||(data.battle?.id===battle?.id&&data.battle?.version<battle?.version))return;if(data.spawnStatus)window.RPGWorld.syncEncounters?.(data);if(pendingProgress&&!data.battle){C.applyProgress(state,pendingProgress.totalXp);pendingProgress=null;window.RPGRoom.persist?.();window.RPGWorld.refresh?.();}if(data.battle&&(['active','pending','finished'].includes(data.battle.status)||battle?.id===data.battle.id)){const changed=!battle||data.battle.version!==battle.version||data.battle.id!==battle.id;battle=data.battle;if(changed)draw();if(['pending','active'].includes(battle.status)&&!dismissed)show();}else if(!data.battle&&battle){battle=null;draw();}}catch(e){if(!root.hidden&&!local)notice(battle?e.message:'Your login expired. Reopen RPG after signing in.',true);}finally{refreshing=false;}}
 function connect(h,s){hero=h;state=s;local=false;dismissed=false;if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(refresh,3000);if(!clockTimer)clockTimer=setInterval(tick,1000);api({action:'progress',heroId:hero.id}).then(()=>{if(!local&&pendingProgress&&!battle){C.applyProgress(state,pendingProgress.totalXp);pendingProgress=null;window.RPGRoom.persist?.();window.RPGWorld.refresh?.();}}).catch(()=>{});refresh();}
 function openLab(){show();if(battle&&['pending','active'].includes(battle.status)){draw();return;}battle=null;local=false;notice('Choose a monster or boss to test your current hero.');draw();}
 function closeEncounter(){previewTarget=null;encounterDialog?.close();}
 function previewEncounter(target,enemy){
  if(!hero||!state)return;
  if(!encounterDialog){
   encounterDialog=document.createElement('dialog');encounterDialog.className='world-encounter-choice';encounterDialog.setAttribute('aria-labelledby','encounter-choice-title');
   encounterDialog.innerHTML='<header><span>WILD ENCOUNTER</span><h2 id="encounter-choice-title">Choose your next move</h2></header><div class="encounter-versus"><figure><div class="encounter-portrait hero"><img data-hero alt=""></div><figcaption><strong data-hero-name></strong><small data-hero-level></small></figcaption></figure><b class="encounter-vs" aria-label="versus">VS</b><figure><div class="encounter-portrait monster"><img data-monster alt=""></div><figcaption><strong data-monster-name></strong><small data-monster-level></small></figcaption></figure></div><footer><button type="button" data-run>RUN</button><button type="button" data-attack>ATTACK</button></footer>';
   document.body.append(encounterDialog);encounterDialog.querySelector('[data-run]').onclick=closeEncounter;encounterDialog.addEventListener('cancel',()=>{previewTarget=null;});
   encounterDialog.querySelector('[data-attack]').onclick=()=>{const target=previewTarget;closeEncounter();if(target)void startEncounter(target);};
  }
  previewTarget=target;
  const heroImage=encounterDialog.querySelector('[data-hero]');heroImage.src=window.DamageSprites.sprite(hero.id,100,'right');heroImage.alt=state.name;
  const monsterImage=encounterDialog.querySelector('[data-monster]');monsterImage.src=window.DamageSprites.sprite(enemy.monsterId,100,'left');monsterImage.alt=enemy.name;
  encounterDialog.querySelector('[data-hero-name]').textContent=state.name;encounterDialog.querySelector('[data-hero-level]').textContent=`LVL ${state.level}`;
  encounterDialog.querySelector('[data-monster-name]').textContent=enemy.name;encounterDialog.querySelector('[data-monster-level]').textContent=`LVL ${enemy.level}`;
  if(!encounterDialog.open)encounterDialog.showModal();encounterDialog.querySelector('[data-run]').focus();
 }
 async function encounter(target,pvp=false){
  if(busy)return;if(pvp)return startEncounter(target,true);
  if(battle&&['active','pending'].includes(battle.status)){show();notice('Finish your current battle first.',true);return;}
  const enemy=window.RPGWorld.monster(target),gps=window.RPGWorld.position?.();if(!enemy||enemy.expires_at<=Date.now())return;
  if(gps){const r=Math.PI/180,x=Math.sin((enemy.lat-gps.lat)*r/2)**2+Math.cos(gps.lat*r)*Math.cos(enemy.lat*r)*Math.sin((enemy.lng-gps.lng)*r/2)**2,distance=6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));if(distance>200){window.RPGWorld.outOfRange(distance);return;}}
  previewEncounter(target,enemy);
 }
 async function startEncounter(target,pvp=false){if(busy)return;const gps=window.RPGWorld.position?.();const pin=!pvp&&window.RPGWorld.monster(target);if(pin&&gps){const r=Math.PI/180,x=Math.sin((pin.lat-gps.lat)*r/2)**2+Math.cos(gps.lat*r)*Math.cos(pin.lat*r)*Math.sin((pin.lng-gps.lng)*r/2)**2,distance=6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));if(distance>200){window.RPGWorld.outOfRange(distance);return;}}if(target.startsWith('guest-')){
  const enemy=window.RPGWorld.monster(target);if(!enemy||!gps||Date.now()-gps.time>30000||gps.accuracy>100){notice('Wait for fresh GPS accuracy within ±100 m.',true);show();return;}
  const r=Math.PI/180,x=Math.sin((enemy.lat-gps.lat)*r/2)**2+Math.cos(gps.lat*r)*Math.cos(enemy.lat*r)*Math.sin((enemy.lng-gps.lng)*r/2)**2;if(6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))>200){notice('Move within 200 meters on a safe public route to start this encounter.',true);show();return;}
  if(battle&&['active','pending'].includes(battle.status)){show();notice('Finish your current battle first.',true);return;}
  local=true;pendingProgress=null;battle=R.createBattle(R.profile(loadout()),R.monster(enemy.monsterId,enemy.level),'monster');battle.id=`device-${target}`;battle.me=0;lastLog='';window.RPGWorld.consume(target);show();notice('Device practice · sign in to earn saved online XP.');draw();return;
 }local=false;show();notice('Checking GPS proximity…');busy=true;try{const data=await api({action:pvp?'challenge':'encounter',target,gps,profile:loadout()});battle=data.battle;lastLog='';notice(pvp?'Challenge sent. Waiting for the other player.':'Nearby encounter started.');}catch(e){if(e.code==='out_of_range'){close();window.RPGWorld.outOfRange(e.distance,pvp);}else notice(e.message,true);}finally{busy=false;draw();}}
 async function spawn(gps=window.RPGWorld.position?.()){
  if(!hero||!gps)throw Error('Enable GPS to find nearby monsters.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{return await api({action:'spawn',gps,heroId:hero.id,level:state.level},controller.signal);}finally{clearTimeout(timeout);}
 }
 async function practice(){if(battle&&['active','pending'].includes(battle.status)){notice('Finish or forfeit your current encounter first.');return;}stopEngine();local=true;pendingProgress=null;window.RPGWorld.offline?.();const a=R.profile(loadout());if(!a.active.length){notice('Equip an attack skill in Hero Room first.');return;}battle=R.createBattle(a,R.monster(el('bt-monster-select').value,a.level),'monster');battle.id='device-'+Date.now();battle.me=0;lastLog='';notice('Device practice · online presence paused. Resources reset each encounter.');draw();}
 async function pool(){if(!puzzleData){const r=await fetch('/rpg/battle-practice-puzzles.json');if(!r.ok)throw Error('Puzzles could not load. Check your connection and retry.');puzzleData=await r.json();}return puzzleData;}
 function history(){try{return JSON.parse(localStorage.getItem('chessburger_rpg_puzzle_history_v1')||'[]');}catch{return [];}}
 async function localAction(input){
  const b=battle,a=b.actors[0];if(R.timeout(b))throw Error('Time expired.');if(input.action==='leave'){R.endBattle(b,1,'forfeit');R.note(b,`${a.name} left the encounter.`);return;}
  if(b.status!=='active'||b.turn!==0)throw Error('This battle has ended.');
  if(input.action==='harvest'){
   if(b.challenge)throw Error('Finish the current harvest first.');
   if(input.resource==='ap'){const elo=b.actors[1].boss?1480+Math.floor(Math.random()*621):750+Math.floor(Math.random()*731);b.challenge={kind:'ap',side:0,elo,fen:new Chess().fen(),moves:[]};}
   else{const seen=new Set(history()),data=await pool(),eligible=data.filter(p=>p.pool===(b.actors[1].boss?'hard':'regular')&&!seen.has(p.id));const p=eligible[Math.floor(Math.random()*eligible.length)],game=new Chess(p.fen);game.move(uci(p.moves[0]));b.challenge={kind:'mp',side:0,puzzleId:p.id,pool:p.pool,rating:p.rating,fen:game.fen(),moves:[],step:1,puzzle:p};}
   R.note(b,`${a.name} chose ${input.resource.toUpperCase()} harvest. No other action this turn.`);b.deadline=Date.now()+1800000;
  }else if(input.action==='puzzleMove'){
   const c=b.challenge,p=c.puzzle,game=new Chess(c.fen);game.move(uci(input.move));
   if(input.move!==p.moves[c.step]&&!game.isCheckmate()){R.harvestResult(b,0,'mp',false,'Puzzle missed');R.note(b,'Puzzle missed. No mana gained.');R.finishTurn(b);}
   else{c.moves.push(input.move);c.step++;if(c.step>=p.moves.length||game.isCheckmate()){R.harvestResult(b,0,'mp',true,'Puzzle solved perfectly');R.note(b,'Puzzle solved perfectly · +20 MP (up to cap).');try{localStorage.setItem('chessburger_rpg_puzzle_history_v1',JSON.stringify([...history().filter(id=>id!==p.id),p.id].slice(-1000)));}catch{notice('Mana awarded, but puzzle history could not save on this device.');}R.finishTurn(b);}else{const reply=p.moves[c.step++];game.move(uci(reply));c.moves.push(reply);c.fen=game.fen();}}
  }else if(input.action==='chessSave'){b.challenge.moves=input.moves.slice();
  }else if(input.action==='chessFinish'){
   const game=new Chess();input.moves.forEach(m=>game.move(uci(m)));if(!game.isGameOver())throw Error('Finish the chess game first.');if(game.isCheckmate()&&game.turn()==='b'){R.harvestResult(b,0,'ap',true,'Chess victory');R.note(b,'Chess victory · +20 AP (up to cap).');}else{R.harvestResult(b,0,'ap',false,game.isCheckmate()?'Chess game lost':'Chess game drawn');R.note(b,'Chess lost or drawn. No AP gained.');}R.finishTurn(b);
  }else if(input.action==='abandon'){R.harvestResult(b,0,b.challenge.kind,false,'Harvest abandoned');R.note(b,'Challenge abandoned. No resource gained.');R.finishTurn(b);}
  else if(input.action==='attack'){R.attack(b,0,input.skill);R.finishTurn(b);}
  else if(input.action==='defend'){R.defend(b,0);R.finishTurn(b);}else throw Error('Unknown action.');b.version++;
 }
 async function action(input){if(busy||presenting||pendingHarvest||!battle)return;const priorHarvest=battle.harvestResult?.id;busy=true;draw();try{if(local)await localAction(input);else{const data=await api({...input,version:battle.version,...(input.action==='accept'?{profile:loadout()}:{} )});battle=input.action==='leave'?(data.report||data.battle):data.battle;}if(input.action==='leave'){const ended=battle;stopEngine();close();battle=null;dismissed=true;if(ended?.status==='finished')openReport(ended);}}catch(e){notice(e.message,true);if(!local){try{const d=await api();battle=d.battle;}catch{}}}finally{if(battle?.harvestResult&&battle.harvestResult.id!==priorHarvest&&battle.harvestResult.side===(battle.me??0))pendingHarvest={...battle.harvestResult};busy=false;draw();}}
 const pieceNames={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
 function board(){if(!chess)return;const color=battle.challenge.kind==='ap'?'w':chess.turn(),flip=color==='b',ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?'hgfedcba':'abcdefgh',legal=selected?chess.moves({square:selected,verbose:true}).map(m=>m.to):[];let html='';
  for(const rank of ranks)for(const file of files){
   const square=file+rank,piece=chess.get(square),dark=(file.charCodeAt(0)-97+rank)%2===0;
   const name=piece?`${piece.color==='w'?'white':'black'} ${pieceNames[piece.type]}`:'empty';
   html+=`<button type="button" data-bt-square="${square}" class="${dark?'dark ':''}${piece?'has-piece ':''}${selected===square?'selected ':''}${legal.includes(square)?'legal':''}" aria-label="${square} ${name}" aria-pressed="${selected===square}">${piece?`<img class="bt-chess-piece" src="assets/chess/cburnett/${piece.color}${piece.type.toUpperCase()}.svg" alt="" draggable="false">`:''}${file===files[0]?`<small class="bt-rank" aria-hidden="true">${rank}</small>`:''}${rank===ranks.at(-1)?`<small class="bt-file" aria-hidden="true">${file}</small>`:''}</button>`;
  }
  el('bt-board').setAttribute('aria-label',`Chessboard, ${flip?'black':'white'} side at bottom`);
  root.querySelector('.bt-board-footer').hidden=!chess.moves({verbose:true}).some(move=>move.promotion);
  el('bt-board').innerHTML=html;
 }
 function challengeView(){const c=battle.challenge,key=battle.id+'|'+c.kind+'|'+(c.puzzleId||c.elo);if(chessKey!==key){stopEngine();chessKey=key;selected=null;engineBroken=false;chess=new Chess(c.fen);if(c.kind==='ap'&&c.moves?.length){chess=new Chess();c.moves.forEach(m=>chess.move(uci(m)));}}
  else if(c.kind==='mp'&&chess.fen()!==c.fen){chess=new Chess(c.fen);selected=null;}
  el('bt-challenge-kind').textContent='';el('bt-challenge-title').textContent=c.kind==='ap'?'Chess · +20 AP':'Puzzle · +20 mana';el('bt-turn-label').textContent=el('bt-challenge-title').textContent;
  el('bt-engine-note').textContent=c.kind==='ap'?'Stockfish.js · White is yours. Win by checkmate for +20 AP. Draws and losses give no AP. Targets below 1320 use reduced skill plus extra mistakes; ratings are approximate.':'Lichess CC0 puzzle. Tap a piece, then a highlighted destination. One wrong legal move ends the harvest.';
  if(c.kind==='ap'){el('bt-chess-status').textContent=engineBroken?'AI failed to load. Abandon this turn and retry when connected.':aiThinking?'AI is thinking…':chess.turn()==='w'?`White to move${chess.isCheck()?' · check':''}`:'Black to move';el('bt-moves').textContent=chess.history().slice(-12).join(' ');}else{el('bt-chess-status').textContent=`${chess.turn()==='w'?'White':'Black'} to move${chess.isCheck()?' · check':''}`;el('bt-moves').textContent=`Puzzle ${c.puzzleId}`;}
  board();if(c.kind==='ap'&&chess.turn()==='b'&&!aiThinking&&!chess.isGameOver()&&!engineBroken)computerMove();
 }
 async function getEngine(){if(engineReady)return engineReady;engineReady=new Promise((resolve,reject)=>{
  try{engine=new Worker('/rpg/vendor/stockfish/stockfish-19-lite-single.js');}catch(e){reject(e);return;}
  const timeout=setTimeout(()=>reject(Error('AI did not load in time.')),15000);
  engine.onerror=()=>{clearTimeout(timeout);reject(Error('AI could not load.'));engineResolve?.reject(Error('AI failed.'));};
  engine.onmessage=event=>{const line=String(event.data);if(line==='uciok'){engine.postMessage('setoption name Hash value 16');engine.postMessage('isready');}if(line==='readyok'){clearTimeout(timeout);resolve(engine);}if(line.startsWith('bestmove ')&&engineResolve){const pending=engineResolve;engineResolve=null;clearTimeout(engineTimer);pending.resolve(line.split(' ')[1]);}};engine.postMessage('uci');
 });return engineReady;}
 async function computerMove(){aiThinking=true;el('bt-chess-status').textContent='AI is thinking…';const key=chessKey,game=chess;try{
  const c=battle.challenge,w=await getEngine();if(chessKey!==key)return;
  let move;const mistakes=c.elo<1320?Math.max(0,(1320-c.elo)/900):0;
  if(Math.random()<mistakes){const legal=game.moves({verbose:true});move=moveId(legal[Math.floor(Math.random()*legal.length)]);}
  else{w.postMessage(`setoption name UCI_LimitStrength value ${c.elo>=1320?'true':'false'}`);if(c.elo>=1320)w.postMessage(`setoption name UCI_Elo value ${c.elo}`);else w.postMessage('setoption name Skill Level value 0');w.postMessage('position fen '+game.fen());move=await new Promise((resolve,reject)=>{engineResolve={resolve,reject};engineTimer=setTimeout(()=>{engineResolve=null;reject(Error('AI search timed out.'));},10000);w.postMessage('go movetime 400');});}
  if(chessKey!==key)return;game.move(uci(move));aiThinking=false;if(game.isGameOver()){board();await action({action:'chessFinish',moves:game.history({verbose:true}).map(moveId)});}else await action({action:'chessSave',moves:game.history({verbose:true}).map(moveId)});
 }catch(e){if(chessKey===key){engineBroken=true;aiThinking=false;notice(e.message,true);challengeView();}}}
 async function squareClick(square){if(!chess||busy||aiThinking||engineBroken||!battle?.challenge)return;const c=battle.challenge;if(c.kind==='ap'&&chess.turn()!=='w')return;const piece=chess.get(square);
  if(piece?.color===chess.turn()){selected=square;board();return;}if(!selected)return;const available=chess.moves({square:selected,verbose:true}).filter(m=>m.to===square);if(!available.length){selected=null;board();return;}
  const promotion=available.some(m=>m.promotion)?el('bt-promotion').value:undefined,input=selected+square+(promotion||'');selected=null;
  if(c.kind==='mp')await action({action:'puzzleMove',move:input});else{chess.move(uci(input));if(chess.isGameOver()){board();await action({action:'chessFinish',moves:chess.history({verbose:true}).map(moveId)});}else{board();challengeView();}}
 }
 el('bt-monster-select').innerHTML=R.MONSTERS.map(m=>`<option value="${m.id}">${m.name}${m.boss?' · BOSS':''}</option>`).join('');const preview=()=>{el('bt-lobby-art').src=window.DamageSprites.sprite(el('bt-monster-select').value,100,'left');};el('bt-monster-select').addEventListener('change',preview);preview();
 el('bt-practice').addEventListener('click',practice);el('bt-close').addEventListener('click',close);el('bt-skills').addEventListener('click',e=>{const button=e.target.closest('[data-bt-skill]');if(button&&!button.disabled)action({action:'attack',skill:button.dataset.btSkill});});
 el('bt-ap').addEventListener('click',()=>action({action:'harvest',resource:'ap'}));el('bt-mp').addEventListener('click',()=>action({action:'harvest',resource:'mp'}));el('bt-defend').addEventListener('click',()=>action({action:'defend'}));el('bt-run').addEventListener('click',()=>action({action:'leave'}));el('bt-abandon').addEventListener('click',()=>action({action:'abandon'}));el('bt-accept').addEventListener('click',()=>action({action:'accept'}));el('bt-decline').addEventListener('click',()=>action({action:'decline'}));
 el('bt-board').addEventListener('click',e=>{const b=e.target.closest('[data-bt-square]');if(b)squareClick(b.dataset.btSquare);});el('bt-rules-toggle').addEventListener('click',()=>{el('bt-rules').hidden=false;el('bt-rules-done').focus();});el('bt-rules-done').addEventListener('click',()=>{el('bt-rules').hidden=true;el('bt-rules-toggle').focus();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!el('bt-rules').hidden){el('bt-rules').hidden=true;el('bt-rules-toggle').focus();}else close();}if(e.key==='Tab'){const scope=el('bt-rules').hidden?root:el('bt-rules');const nodes=[...scope.querySelectorAll('button:not([disabled]),select')].filter(n=>n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 window.RPGBattle={connect,openLab,encounter,spawn,stop(){closeEncounter();clearInterval(pollTimer);pollTimer=null;stopEngine();close();}};
})();
