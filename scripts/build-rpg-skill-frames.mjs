import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import skills from '../api/_rpg/src/skill-catalog.js';
import {isolateSkillFrames} from './rpg-skill-isolation.mjs';
const root=new URL('../public/rpg/assets/skills/',import.meta.url),geometry={};
await mkdir(new URL('frames/',root),{recursive:true});
for(const category of [...new Set(skills.map(s=>s.category))]){
 const {data,info}=await sharp(await readFile(new URL(`sources/${category}.png`,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const frames=isolateSkillFrames(data,info.width,info.height);
 for(const skill of skills.filter(s=>s.category===category)){
  const row=frames.slice(skill.animation.row*6,skill.animation.row*6+6);
  if(row.some(f=>!f))throw Error(`Missing isolated frame: ${skill.id}`);
  // One scale per animation preserves its growing impact; every visible frame is centered.
  const scale=192/Math.max(...row.flatMap(f=>[f.width,f.height]));
  const composites=[];let maxW=0,maxH=0;
  for(const [i,f] of row.entries()){
   const width=Math.max(1,Math.round(f.width*scale)),height=Math.max(1,Math.round(f.height*scale));
   const input=await sharp(f.data,{raw:{width:f.width,height:f.height,channels:4}}).resize(width,height).png().toBuffer();
   composites.push({input,left:i*512+Math.floor((512-width)/2),top:Math.floor((512-height)/2)});maxW=Math.max(maxW,width);maxH=Math.max(maxH,height);
  }
  await sharp({create:{width:3072,height:512,channels:4,background:'#00000000'}}).composite(composites).webp({quality:92,alphaQuality:100,effort:4}).toFile(new URL(`frames/${skill.id}.webp`,root).pathname);
  geometry[skill.id]={width:maxW,height:maxH};
 }
}
await writeFile(new URL('../rpg/src/skill-fx/frame-geometry.json',import.meta.url),JSON.stringify(geometry));
console.log('Packed 30 isolated skill animations: centered 512px tiles with at least 160px transparent margins.');
