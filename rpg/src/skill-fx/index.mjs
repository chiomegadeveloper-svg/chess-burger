import * as PIXI from 'pixi.js-legacy';
import CtAnimatedSprite from '../../vendor/ctjs/PixiAnimatedSprite.ts';
import {textures} from './resources.mjs';

const sessions=new Map(),sheetPromises=new Map();
const skill=id=>window.RPG_ATTACK_SKILLS.find(s=>s.id===id);
function sheet(group){
 if(!sheetPromises.has(group))sheetPromises.set(group,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(PIXI.Texture.from(image));image.onerror=()=>reject(Error('Skill sheet could not load.'));image.src=`/assets/skills/sheets/${group}.webp`;}).catch(e=>{sheetPromises.delete(group);throw e;}));
 return sheetPromises.get(group);
}
async function frames(s){
 if(textures.has(s.id))return;
 const base=await sheet(s.category);
 const list=Array.from({length:s.animation.frames},(_,i)=>new PIXI.Texture(base.baseTexture,new PIXI.Rectangle(i*256,s.animation.row*256,256,256)));
 for(const frame of list)frame.defaultAnchor.set(.5,.5);
 textures.set(s.id,list);
}
function stop(host){
 const session=sessions.get(host);if(!session)return;
 session.cancelled=true;session.finish?.();session.resize?.disconnect();
 session.app?.destroy(true,{children:true,texture:false,baseTexture:false});sessions.delete(host);
 host.querySelectorAll('.rpg-skill-canvas,.rpg-skill-caption').forEach(n=>n.remove());
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
 await frames(s);if(session.cancelled)return;
 const {app}=session;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const sprite=new CtAnimatedSprite({baseClass:'AnimatedSprite',texture:s.id,anchorX:.5,anchorY:.5,loopAnimation:false,animationFPS:s.animation.fps,playAnimationOnStart:false},{});
 const battle=host.id==='bt-stage';
 const w=app.screen.width,h=app.screen.height;
 const source=options.reverse?.78:.22,target=options.reverse?.22:.78;
 sprite.position.set(battle?w*source:w*.5,h*.48);
 const extent=battle?Math.min(w*.48,h*1.2):Math.min(w,h)*1.55;
 sprite.scale.set(extent/256*(options.reverse?-1:1),extent/256);
 app.stage.addChild(sprite);
 const caption=document.createElement('span');caption.className='rpg-skill-caption';caption.textContent=s.name;host.appendChild(caption);
 await new Promise(resolve=>{
  let done=false,hit=false;
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
   if(battle&&!reduced)sprite.x=app.screen.width*(source+(target-source)*Math.min(1,frame/3));
   if(frame>=3)impact();
  };
  sprite.onFrameChange=frameChanged;
  const finish=()=>{if(done)return;if(!session.cancelled)impact();done=true;app.ticker.remove(update);sprite.stop();if(battle||session.cancelled){sprite.destroy();caption.remove();}else{sprite.gotoAndStop(3);app.renderer.render(app.stage);}session.finish=null;resolve();};session.finish=finish;
  const update=()=>{if(session.cancelled){finish();return;}if(battle&&!reduced){const t=Math.min(1,sprite.currentFrame/3);sprite.x=app.screen.width*(source+(target-source)*t);sprite.y=app.screen.height*.48;}};
  if(reduced){sprite.gotoAndStop(3);impact();const timer=setTimeout(finish,450);session.finish=()=>{clearTimeout(timer);finish();};}
  else{sprite.onComplete=finish;app.ticker.add(update);sprite.gotoAndPlay(0);}
 });
}
async function waitForReply(event,session){
 if(!event.delayMs||session.cancelled)return;
 await new Promise(resolve=>{
  const finish=()=>{clearTimeout(timer);session.finish=null;resolve();};
  const timer=setTimeout(finish,Math.min(3000,Math.max(1000,event.delayMs)));session.finish=finish;
 });
}
async function sequence(host,events,options={}){
 if(!host||!events.length)return;
 let session;
 try{session=stage(host);for(const event of events){const s=skill(event.skill);if(s&&!session.cancelled){options.onPrepare?.(event);await waitForReply(event,session);if(session.cancelled)break;options.onAttack?.(event);await animate(host,s,{...event,onImpact:()=>options.onImpact?.(event)},session);}}if(options.status&&!session.cancelled)options.status.textContent='Animation ready · ct.js';}
 catch(error){if(options.status)options.status.textContent='Animation could not load. Tap Replay to retry.';console.warn('Skill animation unavailable:',error.message);}
 finally{if(session&&!session.cancelled&&sessions.get(host)===session){if(host.id==='bt-stage')stop(host);else session.app?.ticker.stop();}}
}
window.RPGSkillFX={play:(host,id,options={})=>sequence(host,[{skill:id,reverse:!!options.reverse}],options),sequence,stop,engine:'ct.js 5.3.1 / PixiAnimatedSprite'};
