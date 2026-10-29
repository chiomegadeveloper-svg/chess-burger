// Health atlases are four columns by six rows, cropped to a 232px battle window.
(function(){
 'use strict';
 const rows=[100,80,60,40,20,0],loop=[0,1,2,3,2,1],active=new Map();
 let timer=null;
 function stage(hp,maxHp){
  const value=Number(hp);if(!Number.isFinite(value)||value<=0)return 0;
  const max=Number(maxHp),percent=max>0?Math.max(1,Math.min(100,Math.ceil(value/max*100))):100;
  return percent>80?100:percent>60?80:percent>40?60:percent>20?40:20;
 }
 function paint(entry){
  const column=entry.row===5?Math.min(entry.step,3):loop[entry.step%loop.length];
  entry.image.style.setProperty('--health-x',`${-(column*512+140)/232*100}%`);
  entry.image.style.setProperty('--health-y',`${-(entry.row*512+140)/232*100}%`);
 }
 function pause(){if(timer!==null){clearInterval(timer);timer=null;}}
 const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 function start(){if(timer===null&&active.size&&!document.hidden&&!reduced())timer=setInterval(tick,160);}
 function tick(){
  if(document.hidden){pause();return;}
  for(const [frame,entry] of active){
   if(frame.isConnected===false){active.delete(frame);continue;}
   if(entry.row===5&&entry.step>=3)continue;
   entry.step++;paint(entry);
  }
  if(!active.size)pause();
 }
 function apply(frame,image,actor,facing){
  const id=actor?.heroId??actor?.id,meta=window.RPG_CHARACTER_HEALTH?.[id];
  if(!meta?.src){active.delete(frame);frame.classList.remove('is-health');delete frame.dataset.health;if(!active.size)pause();return false;}
  const health=stage(actor.hp,actor.maxHp),row=rows.indexOf(health);
  let entry=active.get(frame);
  if(!entry||entry.image!==image||entry.id!==id||entry.row!==row){entry={image,id,row,step:row===5&&reduced()?3:0};active.set(frame,entry);}
  if(image.getAttribute('src')!==meta.src)image.src=meta.src;
  frame.classList.add('is-health');frame.dataset.health=String(health);
  image.alt=`${actor.name||id} · ${actor.hp} health`;
  paint(entry);start();return true;
 }
 function stop(){active.clear();pause();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else start();});
 function warm(ids){for(const id of new Set(ids)){const src=window.RPG_CHARACTER_HEALTH?.[id]?.src;if(src){const image=new window.Image();image.decoding='async';image.src=src;}}}
 window.RPGCharacterHealth={stage,apply,stop,warm};
})();
