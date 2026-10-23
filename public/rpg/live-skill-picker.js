(function(){
 'use strict';
 window.RPGSkillPicker={create(block){
  const skills=window.RPG_ATTACK_SKILLS,byId=Object.fromEntries(skills.map(s=>[s.id,s]));
  block.innerHTML='<span>CHOOSE YOUR SECOND ATTACK</span><button type="button" class="live-skill-open" aria-haspopup="dialog"><span>Choose attack</span><b aria-hidden="true">＋</b></button><input type="hidden" id="live-starter" value=""><small>Basic Tackle is included. Your hero cannot be changed after confirmation.</small>';
  const value=block.querySelector('input'),open=block.querySelector('button'),dialog=document.createElement('dialog');
  dialog.className='live-skill-picker';dialog.setAttribute('aria-labelledby','live-skill-heading');
  dialog.innerHTML='<header><div><small>YOUR STARTING LOADOUT</small><h2 id="live-skill-heading">Choose an attack</h2></div><button type="button" data-close aria-label="Close attack picker">×</button></header><div class="live-skill-grid" role="group" aria-label="Attack skills"></div><div class="live-skill-details" role="status" aria-live="polite"><p>Hover, focus, or tap an icon to inspect its costs and damage.</p></div><footer><small>Basic Tackle is already equipped.</small><button type="button" data-use disabled>Use skill</button></footer>';
  document.body.append(dialog);const grid=dialog.querySelector('.live-skill-grid'),details=dialog.querySelector('.live-skill-details'),use=dialog.querySelector('[data-use]');let candidate='';
  function inspect(skill){
   const attack=4+skill.bonus[skill.magic?2:1],damage=Math.max(1,Math.round(attack*skill.scale+2-4*.15));
   details.innerHTML='<dl><div><dt>AP</dt><dd></dd></div><div><dt>MP</dt><dd></dd></div><div><dt>Attack damage</dt><dd></dd></div></dl><small></small>';
   [...details.querySelectorAll('dd')].forEach((el,i)=>el.textContent=[skill.ap,skill.mp,damage][i]);
   details.querySelector('small').textContent=skill.id==='basic'?'Basic Tackle · already included':'Level 1 estimate vs. 4 armor. Defense and equipment affect damage.';
  }
  function mark(id){candidate=id;for(const button of grid.children)button.setAttribute('aria-pressed',String(button.dataset.skill===id));use.disabled=!id;}
  for(const skill of skills){
   const button=document.createElement('button');button.type='button';button.dataset.skill=skill.id;button.className='live-skill-icon';button.setAttribute('aria-label',skill.name);button.setAttribute('aria-pressed','false');button.setAttribute('aria-describedby','live-skill-metrics');
   const image=document.createElement('img');image.src=`assets/skills/runes/${skill.id}.webp`;image.alt='';image.width=56;image.height=56;button.append(image);
   if(skill.id==='basic'){button.setAttribute('aria-disabled','true');button.classList.add('included');}
   button.addEventListener('mouseenter',()=>inspect(skill));button.addEventListener('focus',()=>inspect(skill));
   button.addEventListener('click',()=>{inspect(skill);if(skill.id!=='basic')mark(skill.id);});grid.append(button);
  }
  details.id='live-skill-metrics';
  const close=()=>{dialog.close();open.focus();};dialog.querySelector('[data-close]').onclick=close;
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  open.onclick=()=>{mark(value.value);dialog.showModal();if(candidate)inspect(byId[candidate]);};
  use.onclick=()=>{if(!candidate||candidate==='basic')return;value.value=candidate;open.replaceChildren();const image=document.createElement('img');image.src=`assets/skills/runes/${candidate}.webp`;image.alt=byId[candidate].name;open.append(image);const text=document.createElement('span');text.textContent='Change attack';open.append(text);open.setAttribute('aria-label',`Change starting attack: ${byId[candidate].name}`);value.dispatchEvent(new Event('change',{bubbles:true}));close();};
  return {get value(){return value.value;},focus(){open.focus();}};
 }};
})();
