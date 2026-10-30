import {createHash} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';

// Preserve the imported artwork byte for byte while letting the browser request
// only the images actually displayed instead of downloading every catalog first.
export async function extractRpgImages(html,output){
 const directory=new URL('assets/embedded/',output),images=new Map();
 const result=html.replace(/data:image\/(webp|png|jpeg|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})/g,(_,type,encoded)=>{
  const bytes=Buffer.from(encoded,'base64'),hash=createHash('sha256').update(bytes).digest('hex');
  const path=`assets/embedded/${hash}.${type==='svg+xml'?'svg':type==='jpeg'?'jpg':type}`;
  if(!images.has(path))images.set(path,bytes);
  return path;
 });
 // This directory is generated exclusively by this build step.
 await rm(directory,{recursive:true,force:true});await mkdir(directory,{recursive:true});
 await Promise.all([...images].map(([path,bytes])=>writeFile(new URL(path,output),bytes)));
 return {html:result,images:images.size,bytes:[...images.values()].reduce((sum,data)=>sum+data.length,0)};
}
