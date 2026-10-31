import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
import skills from '../api/_rpg/src/skill-catalog.js';
import {isolateSkillFrames} from '../scripts/rpg-skill-isolation.mjs';
test('whole effect islands crossing old tile boundaries survive extraction without neighboring sprites',()=>{
 const width=120,height=120,data=new Uint8Array(width*height*4);
 const fill=(x1,y1,x2,y2,color)=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)data.set([...color,255],(y*width+x)*4);};
 fill(5,5,24,14,[255,0,0]);fill(30,5,34,14,[0,0,255]);
 const frames=isolateSkillFrames(data,width,height),red=frames[0],blue=frames[1];
 assert.equal(red.width,20);assert.equal(red.pixels,200);assert.ok(red.right>=20,'the old first-cell boundary would cut the red trail');assert.equal(blue.pixels,50);
 for(let i=0;i<red.data.length;i+=4)if(red.data[i+3])assert.equal(red.data[i+2],0,'no neighboring blue art');
});
test('all 180 shipped skill frames have centered complete artwork and generous transparent margins',async()=>{
 for(const s of skills){
  const file=await fs.readFile(`public/rpg/assets/skills/frames/${s.id}.webp`),{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.ok(file.length<600000,s.id);assert.deepEqual([info.width,info.height],[3072,512]);
  for(let col=0;col<6;col++){
   let left=512,right=-1,top=512,bottom=-1,count=0;
   for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(data[(y*3072+col*512+x)*4+3]>=24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}
   assert.ok(count>20,`${s.id} frame ${col} is not blank`);assert.ok(left>=158&&right<=353&&top>=158&&bottom<=353,`${s.id} frame ${col} padding`);
   assert.ok(Math.abs((left+right)/2-255.5)<=1.5&&Math.abs((top+bottom)/2-255.5)<=1.5,`${s.id} frame ${col} visible art uses the center anchor`);
  }
 }
});
test('center-anchored impacts stay fully inside compact and wide battle frames in either direction',async()=>{
 const context={};vm.runInNewContext(await fs.readFile('public/rpg/vendor/skill-frame.js','utf8'),context);const F=context.RPGSkillFrames,geometry=JSON.parse(await fs.readFile('rpg/src/skill-fx/frame-geometry.json','utf8'));
 for(const [id,ink]of Object.entries(geometry))for(const [w,h]of [[990,660],[700,230],[600,120],[320,360]]){
  F.register(id,ink);const ground=h-Math.min(h*.4,Math.max(h,w*2/3)*.16),y=ground-200*Math.min(h*.85/232,w*.34/232)*.45/2;
  const scale=F.fitScale(id,w,h,true,{x:w*.1,y});
  for(const x of [w*.1,w*.9])assert.ok(x-ink.width*scale/2>=3.9&&x+ink.width*scale/2<=w-3.9&&y-ink.height*scale/2>=3.9&&y+ink.height*scale/2<=h-3.9,id+' visible impact fits');
 }
});
