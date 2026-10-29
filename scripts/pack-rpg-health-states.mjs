// Pack transparent 4-column x 6-row health animations without per-frame scale jitter.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
export const HEALTH_ROWS=[100,80,60,40,20,0];
const heroes=['rogue','theft','assassin','mage','tank','archer','queen','crusader'];
const ids=[...heroes,'chaanack','erpack','donkuber','windee','kalaagg','pektu','mhakiduk','odeksa','buhokba','muraduk','punsuck','conchita','jengot','draguu','baluu','kassag'];
const root=fileURLToPath(new URL('../',import.meta.url));
export function rowGeometry(bounds,standing,health){
 const left=Math.min(...bounds.map(b=>b.left)),top=Math.min(...bounds.map(b=>b.top));
 const right=Math.max(...bounds.map(b=>b.left+b.width)),bottom=Math.max(...bounds.map(b=>b.top+b.height));
 const width=right-left,height=bottom-top;
 const target=standing*(health===40?.75:health===20?.65:1);
 // The union crop and one scale/anchor for all frames preserve animation offsets.
 const scale=Math.min(health===0?standing/width:target/height,232/width,216/height);
 const outputWidth=Math.max(1,Math.round(width*scale)),outputHeight=Math.max(1,Math.round(height*scale));
 return {left,top,width,height,outputWidth,outputHeight,x:Math.round((512-outputWidth)/2),y:356-outputHeight};
}
// Find safe cuts in transparent gutters near nominal boundaries. Never cut visible pixels.
export function projectionCuts(projection,count,axis='axis'){
 const length=projection.length,cell=length/count,cuts=[0];
 for(let cut=1;cut<count;cut++){
  const nominal=cut*cell,lo=Math.max(cuts.at(-1)+1,Math.floor(nominal-cell*.30)),hi=Math.min(length-1,Math.ceil(nominal+cell*.30));
  const gaps=[];
  for(let i=lo;i<=hi;i++)if(projection[i]===0){const start=i;while(i+1<=hi&&projection[i+1]===0)i++;gaps.push({start,end:i,width:i-start+1,mid:Math.round((start+i)/2)});}
  gaps.sort((a,b)=>b.width-a.width||Math.abs(a.mid-nominal)-Math.abs(b.mid-nominal));
  if(!gaps.length){let min=Infinity,at=lo;for(let i=lo;i<=hi;i++)if(projection[i]<min){min=projection[i];at=i;}throw Error(`Unsafe ${axis} boundary ${cut}: minimum alpha projection ${min} at ${at}; no transparent gutter near ${Math.round(nominal)}`);}
  cuts.push(gaps[0].mid);
 }
 cuts.push(length);return cuts;
}
export function splitHealthCells(data,info){
 const yp=new Uint32Array(info.height);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>32)yp[y]++;
 const ys=projectionCuts(yp,6,'row'),xss=[];
 for(let row=0;row<6;row++){
  const xp=new Uint32Array(info.width);
  for(let y=ys[row];y<ys[row+1];y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>32)xp[x]++;
  xss.push(projectionCuts(xp,4,`row ${HEALTH_ROWS[row]} column`));
 }
 const xs=xss[0],cw=Math.max(...xss.flatMap(cuts=>cuts.slice(1).map((x,i)=>x-cuts[i]))),ch=Math.max(...ys.slice(1).map((y,i)=>y-ys[i]));
 const cells=[];let sourceInk=0,retainedInk=0;
 for(const value of yp)sourceInk+=value;
 for(let row=0;row<6;row++)for(let frame=0;frame<4;frame++){
  const cuts=xss[row],width=cuts[frame+1]-cuts[frame],height=ys[row+1]-ys[row];
  const ox=Math.floor((cw-width)/2),oy=0,pixels=Buffer.alloc(cw*ch*4);let x0=cw,y0=ch,x1=-1,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const src=((ys[row]+y)*info.width+cuts[frame]+x)*4,dest=((y+oy)*cw+x+ox)*4;
   if(data[src+3]<=32)continue;
   retainedInk++;data.copy(pixels,dest,src,src+4);x0=Math.min(x0,x+ox);y0=Math.min(y0,y+oy);x1=Math.max(x1,x+ox);y1=Math.max(y1,y+oy);
  }
  if(x1<0)throw Error(`Empty health frame at row ${HEALTH_ROWS[row]}, column ${frame+1}`);
  cells.push({pixels,bounds:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}});
 }
 if(retainedInk!==sourceInk)throw Error('Adaptive health grid lost visible source pixels');
 return {cells,cw,ch,xs,xss,ys,sourceInk,retainedInk};
}
export async function packHealthSheet(source,standing){
 const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {cells,cw,ch}=splitHealthCells(data,info),composites=[];
 for(let row=0;row<6;row++){
  const frames=cells.slice(row*4,row*4+4),g=rowGeometry(frames.map(frame=>frame.bounds),standing,HEALTH_ROWS[row]);
  for(let frame=0;frame<4;frame++){
   const input=await sharp(frames[frame].pixels,{raw:{width:cw,height:ch,channels:4}}).extract({left:g.left,top:g.top,width:g.width,height:g.height}).resize(g.outputWidth,g.outputHeight,{kernel:'nearest'}).png().toBuffer();
   composites.push({input,left:frame*512+g.x,top:row*512+g.y});
  }
 }
 return sharp({create:{width:2048,height:3072,channels:4,background:'#00000000'}}).composite(composites).webp({quality:89,alphaQuality:100,effort:6}).toBuffer();
}
async function main(){
 const manifest=process.argv[2];if(!manifest)throw Error('Usage: node scripts/pack-rpg-health-states.mjs <manifest.json>');
 const rows=JSON.parse(await fs.readFile(manifest,'utf8'));if(!Array.isArray(rows)||!rows.length)throw Error('Manifest must be a nonempty array of {id,source}.');
 const window={};vm.runInNewContext(await fs.readFile(path.join(root,'rpg/src/character-attacks.js'),'utf8'),{window});
 const metadataPath=path.join(root,'rpg/src/character-health.js');
 try{vm.runInNewContext(await fs.readFile(metadataPath,'utf8'),{window});}catch(error){if(error.code!=='ENOENT')throw error;}
 const catalog=window.RPG_CHARACTER_HEALTH||{},seen=new Set();
 await fs.mkdir(path.join(root,'public/rpg/assets/health'),{recursive:true});
 for(const {id,source} of rows){
  if(!ids.includes(id)||!window.RPG_CHARACTER_ATTACKS[id])throw Error('Unknown character: '+id);
  if(seen.has(id))throw Error('Duplicate character: '+id);seen.add(id);
  if(typeof source!=='string')throw Error('Missing source for '+id);
  const baseHeight=window.RPG_CHARACTER_ATTACKS[id].idleHeight||200;
  const sheet=await packHealthSheet(path.resolve(path.dirname(path.resolve(manifest)),source),baseHeight);
  await fs.writeFile(path.join(root,'public/rpg/assets/health',id+'.webp'),sheet);
  catalog[id]={src:`assets/health/${id}.webp`,tile:512,frames:4,rows:HEALTH_ROWS,facing:heroes.includes(id)?'right':'left',visible:baseHeight,baseHeight};
  console.log('Packed '+id);
 }
 const ordered=Object.fromEntries(ids.filter(id=>catalog[id]).map(id=>[id,catalog[id]]));
 await fs.writeFile(metadataPath,'// Generated by scripts/pack-rpg-health-states.mjs.\nwindow.RPG_CHARACTER_HEALTH='+JSON.stringify(ordered,null,1)+';\n');
 console.log(`Packed ${rows.length} health sheets; catalog contains ${Object.keys(ordered).length}/24 characters.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
