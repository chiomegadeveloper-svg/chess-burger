// Pack generated cutouts into attack-aligned tiles and larger portrait versions.
import sharp from 'sharp';import fs from 'node:fs/promises';import vm from 'node:vm';
const rows=JSON.parse(await fs.readFile(process.argv[2],'utf8')),window={};vm.runInNewContext(await fs.readFile('rpg/src/character-attacks.js','utf8'),{window});
await fs.mkdir('public/rpg/assets/death/portraits',{recursive:true});
for(const row of rows){
 const entry=window.RPG_CHARACTER_ATTACKS[row.id];if(!entry)throw Error('Unknown character: '+row.id);
 const extent=entry.idleHeight||200;let pipeline=sharp(row.source).trim();if(row.id==='tank')pipeline=pipeline.flop();const body=await pipeline.png().toBuffer();
 async function tile(size,visible,baseline){const {data,info}=await sharp(body).resize(visible,visible,{fit:'inside'}).png().toBuffer({resolveWithObject:true});return sharp({create:{width:size,height:size,channels:4,background:'#00000000'}}).composite([{input:data,left:Math.round(size/2-info.width/2),top:baseline-info.height}]).webp({quality:90}).toBuffer();}
 const hero=['rogue','theft','assassin','mage','tank','archer','queen','crusader'].includes(row.id),direction=hero?'right':'left';
 for(const [folder,frame] of [['',await tile(512,extent,356)],['portraits/',await tile(400,300,345)]]){await fs.writeFile(`public/rpg/assets/death/${folder}${row.id}-${direction}.webp`,frame);if(hero)await sharp(frame).flop().webp({quality:90}).toFile(`public/rpg/assets/death/${folder}${row.id}-left.webp`);}
}
