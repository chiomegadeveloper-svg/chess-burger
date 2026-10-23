// Slice the approved stone-rune artwork. Every UI keeps the same stable skill ID.
import sharp from 'sharp';import {mkdir} from 'node:fs/promises';import skills from '../rpg/src/skill-catalog.js';
const out=new URL('../public/rpg/assets/skills/runes/',import.meta.url);await mkdir(out,{recursive:true});
const rows={physical:0,wind:1,elemental:2,fire:3,lightning:4};
const columns={basic:1,punch:5,crescent_slash:2,piercing_thrust:3,hammer_crash:4,meteor_fist:0,stone_shard:2,tidal_orb:1,frost_lance:0,thorn_burst:3,crystal_crush:2,earthbreaker:5,gust:0,wind_blade:3,air_lance:2,cyclone:5,gale_burst:4,tempest:1,ember:0,fireball:1,flame_slash:2,scorch_lance:3,inferno:4,phoenix_flare:5,spark:0,volt_dart:2,thunder_lash:3,lightning:1,chain_surge:4,thunderstorm:5};
const xs=[170,392,614,838,1061,1283],ys=[194,382,568,754,942];
for(const s of skills){if(columns[s.id]===undefined)throw Error('Missing rune mapping '+s.id);await sharp(new URL('../public/rpg/assets/skills/rune-source.webp',import.meta.url).pathname).extract({left:xs[columns[s.id]]-84,top:ys[rows[s.category]]-84,width:168,height:168}).resize(192,192).webp({quality:92}).toFile(new URL(s.id+'.webp',out).pathname);}
console.log('Built 30 skill icons from the approved stone-rune artwork.');
