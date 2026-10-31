import * as PIXI from 'pixi.js-legacy';
import CtAnimatedSprite from '../../vendor/ctjs/PixiAnimatedSprite.ts';
import {textures} from './resources.mjs';
import geometry from './frame-geometry.json';

const ATTACK_SPEED_FACTOR=.35;
// Match the bottom-aligned 3:2 landscape and CSS --fighter-ground-bottom.
const groundY=(width,height)=>height-Math.min(height*.4,Math.max(height,width*2/3)*.16);
const sessions=new Map(),sheetPromises=new Map();let protectedSkills=new Set();
const skill=id=>window.RPG_ATTACK_SKILLS.find(s=>s.id===id);
const characterSheets=new Map(),characterReady=new Map();
async function characterFrames(id){
 const entry=window.RPG_CHARACTER_ATTACKS?.[id];if(!entry)return null;
 if(!characterSheets.has(id))characterSheets.set(id,new Promise((resolve,reject)=>{
  const image=new Image();image.onload=()=>{
   const base=PIXI.BaseTexture.from(image,{scaleMode:PIXI.SCALE_MODES.NEAREST});
   const result={entry,frames:Array.from({length:4},(_,col)=>new PIXI.Texture(base,new PIXI.Rectangle(col*512+140,140,232,232)))};characterReady.set(id,result);resolve(result);
  };image.onerror=()=>reject(Error('Character attack sheet could not load.'));image.src=entry.src;
 }).catch(error=>{characterSheets.delete(id);throw error;}));
 return characterSheets.get(id);
}
function character(app,data,x,facing){
 if(!data)return null;
 const actor=new PIXI.AnimatedSprite(data.frames);actor.anchor.set(.5,.5);actor.gotoAndStop(0);
 const scale=Math.min(app.screen.height*.85/232,app.screen.width*.34/232)*.45;
 actor.showPose=frame=>{actor.gotoAndStop(frame);const ratio=data.entry.idleHeight&&data.entry.frameHeights?.[frame]?data.entry.idleHeight/data.entry.frameHeights[frame]:1,sized=scale*ratio;actor.scale.set(sized*(data.entry.facing===facing?1:-1),sized);actor.position.set(app.screen.width*x,groundY(app.screen.width,app.screen.height)-100*sized);};actor.showPose(0);
 app.stage.addChild(actor);return actor;
}
function sheet(id){
 if(!sheetPromises.has(id))sheetPromises.set(id,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(PIXI.Texture.from(image));image.onerror=()=>reject(Error('Skill sheet could not load.'));image.src=`assets/skills/frames/${id}.webp`;}).catch(e=>{sheetPromises.delete(id);throw e;}));
 return sheetPromises.get(id);
}
async function frames(s){
 if(textures.has(s.id)){const cached=textures.get(s.id);textures.delete(s.id);textures.set(s.id,cached);return;}
 const base=await sheet(s.id);if(textures.has(s.id))return;
 const list=Array.from({length:s.animation.frames},(_,i)=>new PIXI.Texture(base.baseTexture,new PIXI.Rectangle(i*512,0,512,512)));
 window.RPGSkillFrames.register(s.id,geometry[s.id]);
 for(const frame of list)frame.defaultAnchor.set(.5,.5);
 textures.set(s.id,list);for(const [id,cached] of textures){if(textures.size<=10)break;if(id!==s.id&&!protectedSkills.has(id)){const base=cached[0]?.baseTexture;for(const frame of cached)frame.destroy(false);base?.destroy();textures.delete(id);sheetPromises.delete(id);}}
}
function stop(host){
 if(host.dataset)delete host.dataset.caster;
 const session=sessions.get(host);if(!session)return;
 session.cancelled=true;session.finish?.();session.resize?.disconnect();
 session.app?.destroy(true,{children:true,texture:false,baseTexture:false});sessions.delete(host);
 host.querySelectorAll('.rpg-skill-canvas,.rpg-skill-caption,.rpg-skill-fallback').forEach(n=>n.remove());
}
function stage(host){
 stop(host);
 const session={cancelled:false,app:null,finish:null,resize:null};sessions.set(host,session);
 const app=new PIXI.Application({width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight),backgroundAlpha:0,antialias:false,autoDensity:true,resolution:Math.min(window.devicePixelRatio||1,2),forceCanvas:!PIXI.utils.isWebGLSupported()});
 session.app=app;app.view.className='rpg-skill-canvas';app.view.setAttribute('aria-hidden','true');host.appendChild(app.view);
 if(typeof ResizeObserver!=='undefined'){session.resize=new ResizeObserver(()=>{if(!session.cancelled)app.renderer.resize(Math.max(1,host.clientWidth),Math.max(1,host.clientHeight));});session.resize.observe(host);}
 return session;
}
async function animate(host,s,options,session){
 if(session.cancelled)return;
 const {app}=session;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const fps=Math.max(18,s.animation.fps)*.5*ATTACK_SPEED_FACTOR;
 const sprite=new CtAnimatedSprite({baseClass:'AnimatedSprite',texture:s.id,anchorX:.5,anchorY:.5,loopAnimation:false,animationFPS:fps,playAnimationOnStart:false},{});
 sprite.anchor.set(.5,.5);
 const battle=['bt-stage','bt-fx-bar'].includes(host.id);
 const w=app.screen.width,h=app.screen.height;
 const source=options.reverse?.9:.1,target=options.reverse?.1:.9;
 const attackerData=characterReady.get(options.attackerId),defenderData=characterReady.get(options.defenderId);
 if(session.cancelled)return;
 const attacker=battle?character(app,attackerData,source,options.reverse?'left':'right'):null;
 const defender=battle&&!options.persistentFighters?character(app,defenderData,target,options.reverse?'right':'left'):null;
 if(attacker&&options.persistentFighters&&host.dataset)host.dataset.caster=options.reverse?'enemy':'hero';
 const impactY=groundY(w,h)-(defenderData?.entry.idleHeight||200)*Math.min(h*.85/232,w*.34/232)*.45/2;
 sprite.position.set(battle?w*source:w*.5,battle?impactY:h*.5);
 const scale=window.RPGSkillFrames.fitScale(s.id,w,h,battle,{x:battle?w*Math.min(source,target):w*.5,y:battle?impactY:h*.5});
 sprite.scale.set(scale*(options.reverse?-1:1),scale);
 app.stage.addChild(sprite);
 const caption=document.createElement('span');caption.className='rpg-skill-caption';caption.textContent=s.name;host.appendChild(caption);
 await new Promise(resolve=>{
  let done=false,hit=false,watchdog;const started=performance.now(),travelMs=3000/fps;
  const impact=()=>{
   if(hit||session.cancelled)return;hit=true;
   if(battle)sprite.x=app.screen.width*target;
   caption.textContent=s.name+(Number.isInteger(options.damage)?` · −${options.damage} HP`:'');
   app.renderer.render(app.stage);
   options.onImpact?.();
  };
  const frameChanged=()=>{
   if(session.cancelled)return;
   const frame=sprite.currentFrame;
   if(attacker)attacker.showPose(Math.min(3,Math.floor(frame*4/s.animation.frames)));
   if(frame>=3)impact();
  };
  sprite.onFrameChange=frameChanged;
  const finish=()=>{if(done)return;if(!session.cancelled)impact();done=true;clearTimeout(watchdog);app.ticker.remove(update);sprite.stop();attacker?.destroy();defender?.destroy();if(host.dataset)delete host.dataset.caster;if(battle||session.cancelled){sprite.destroy();caption.remove();}else{sprite.gotoAndStop(3);app.renderer.render(app.stage);}session.finish=null;resolve();};session.finish=finish;
  const update=()=>{if(session.cancelled){finish();return;}if(battle&&!reduced){const t=Math.min(1,(performance.now()-started)/travelMs);sprite.x=app.screen.width*(source+(target-source)*t);sprite.y=impactY;}};
  if(reduced){sprite.gotoAndStop(3);attacker?.showPose(2);impact();const timer=setTimeout(finish,450);session.finish=()=>{clearTimeout(timer);finish();};}
  else{sprite.onComplete=finish;app.ticker.add(update);sprite.gotoAndPlay(0);watchdog=setTimeout(finish,Math.max(1000,s.animation.frames/fps*1000+250));}
 });
}
async function waitForReply(event,session){
 if(!event.delayMs||session.cancelled)return;
 await new Promise(resolve=>{
  const finish=()=>{clearTimeout(timer);session.finish=null;resolve();};
  const timer=setTimeout(finish,Math.min(2000,Math.max(0,event.delayMs)));session.finish=finish;
 });
}
// Cold image requests must not hold the turn open for many seconds.
async function preload(events){await Promise.allSettled(events.flatMap(e=>{const s=skill(e.skill);return [s?frames(s):null,characterFrames(e.attackerId),characterFrames(e.defenderId)];}));}
async function fallback(host,event,session,options){
 const node=document.createElement('span');node.className='rpg-skill-fallback'+(event.reverse?' reverse':'');node.style.animationDuration=`${640/ATTACK_SPEED_FACTOR}ms`;const image=document.createElement('img');image.src=`assets/skills/runes/${event.skill}.webp`;image.alt='';node.appendChild(image);host.appendChild(node);
 await new Promise(resolve=>{let hit=false;const impact=()=>{if(!session.cancelled&&!hit){hit=true;options.onImpact?.(event);}};const hitTimer=setTimeout(impact,360/ATTACK_SPEED_FACTOR),endTimer=setTimeout(()=>{impact();finish();},640/ATTACK_SPEED_FACTOR);const finish=()=>{clearTimeout(hitTimer);clearTimeout(endTimer);node.remove();session.finish=null;resolve();};session.finish=finish;});
}
async function sequence(host,events,options={}){
 if(!host||!events.length)return;let session;
 try{
  session=stage(host);let timer;await Promise.race([preload(events),new Promise(resolve=>{timer=setTimeout(resolve,150);})]);clearTimeout(timer);
  for(const event of events){if(session.cancelled)break;
   if(event.kind==='curse'){options.onAction?.(event);continue;}
   if(['defend','recover'].includes(event.kind)){options.onPrepare?.(event);await waitForReply(event,session);if(session.cancelled)break;options.onAction?.(event);await waitForReply({delayMs:250},session);continue;}
   const s=skill(event.skill);if(!s)continue;options.onPrepare?.(event);await waitForReply(event,session);if(session.cancelled)break;options.onAttack?.(event);
   if(textures.has(s.id))await animate(host,s,{...event,onImpact:()=>options.onImpact?.(event)},session);else await fallback(host,event,session,options);
  }
  if(options.status&&!session.cancelled)options.status.textContent='Animation ready · ct.js';
 }catch(error){if(options.status)options.status.textContent='Animation could not load. Tap Replay to retry.';console.warn('Skill animation unavailable:',error.message);}
 finally{if(session&&!session.cancelled&&sessions.get(host)===session){if(['bt-stage','bt-fx-bar'].includes(host.id))stop(host);else session.app?.ticker.stop();}}
}
window.RPGSkillFX={warmEncounter:(ids,characters)=>preload([...ids.map(skill=>({skill})),...characters.map(attackerId=>({attackerId}))]),warm:ids=>{protectedSkills=new Set(ids);return Promise.allSettled(ids.map(id=>skill(id)).filter(Boolean).map(frames));},warmCharacters:ids=>Promise.allSettled(ids.map(characterFrames)),play:(host,id,options={})=>sequence(host,[{skill:id,reverse:!!options.reverse}],options),sequence,stop,engine:'ct.js 5.3.1 / PixiAnimatedSprite'};
