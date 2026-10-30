import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export async function writeRpgCacheManifest(){
 const root=new URL('../public/rpg/',import.meta.url),assets=[];
 async function walk(relative=''){
  for(const entry of await readdir(new URL(relative,root),{withFileTypes:true})){
   const name=relative+entry.name;
   if(entry.isDirectory())await walk(name+'/');
   else if(/\.(html|js|css|json|wasm|webp|png|svg|woff2?)$/.test(name)&&name!=='cache-manifest.json'){
    const data=await readFile(new URL(name,root));
    assets.push({path:'/rpg/'+name,bytes:data.length,revision:createHash('sha256').update(data).digest('hex')});
   }
  }
 }
 await walk();assets.sort((a,b)=>a.path.localeCompare(b.path));
 const source=await readFile(new URL('../app/app-version.ts',import.meta.url),'utf8');
 const version='0.'+source.match(/APP_VERSION_NUMBER = (\d+)/)[1].padStart(4,'0');
 const manifest={version,bytes:assets.reduce((n,a)=>n+a.bytes,0),assets};
 await writeFile(new URL('cache-manifest.json',root),JSON.stringify(manifest));
 console.log(`RPG device pack: ${assets.length} files · ${(manifest.bytes/1048576).toFixed(1)} MiB.`);
 return manifest;
}
