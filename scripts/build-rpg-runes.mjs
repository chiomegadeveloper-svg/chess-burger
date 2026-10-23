import {mkdir,writeFile} from 'node:fs/promises';
import skills from '../rpg/src/skill-catalog.js';
const out=new URL('../public/rpg/assets/skills/runes/',import.meta.url);
const colors={physical:'#ffe1a3',elemental:'#8ae6bf',wind:'#a4f3ed',fire:'#ffae65',lightning:'#b8b0ff'};
// Dedicated interface glyphs, independent of the animation atlases.
const glyphs={
 basic:'<path d="m48 15 8 22 23-4-15 16 14 18-23-6-9 22-5-24-24 1 19-13-12-19 21 8Z"/>',
 punch:'<path d="M31 72 20 50V34q0-8 8-8h4V22q0-7 8-7h4q7 0 7 7 0-7 8-7h3q8 0 8 8v10h3q8 0 8 8v14L67 77H35Z M32 27v23m19-27v26m19-15v17M27 55h38"/>',
 crescent_slash:'<path d="M76 17Q24 26 20 77q28-9 49-32Q42 57 37 58q7-25 39-41Z"/><path d="m59 69 6 8m9-25 9 2"/>',
 piercing_thrust:'<path d="m72 15 9 1-2 9-32 33-9-9ZM40 46l13 13M35 56 21 72l4 4 16-14M17 78l5 4"/><path d="m51 23-5-8m26 31 9 3"/>',
 hammer_crash:'<path d="m31 18 43 18-8 19-43-18ZM49 46 32 79l-10-5 18-33"/><path d="m53 68 7 12m7-23 14 3m-9 11 7 6"/>',
 meteor_fist:'<path d="m32 52 10-18 13-3 17 13 2 17-12 14-20-1-15-10Z M42 40l19 14m-26-3 21 16"/><path d="M17 20 36 32M34 15l10 10M15 39l12 4m27-26 3 7"/>',
 stone_shard:'<path d="m48 16 25 25-8 34-36 5-8-31ZM48 16 39 49l26 26M21 49h18l34-8M39 49 29 80"/>',
 tidal_orb:'<circle cx="48" cy="48" r="28"/><path d="M22 52q13-20 29-3t23-1M25 64q13-15 27-2t17-1M35 35q7-9 14-8"/>',
 frost_lance:'<path d="M48 15v66M20 31l56 34M20 65l56-34M38 22l10 10 10-10M38 74l10-10 10 10M20 42l15-3-2-15M63 72l-2-15 15-3M20 54l15 3-2 15M63 24l-2 15 15 3"/>',
 thorn_burst:'<path d="m48 16 8 23 24-9-15 20 14 19-24-7-7 20-7-21-24 8 15-19-15-20 23 9Z"/><circle cx="48" cy="49" r="9"/>',
 crystal_crush:'<path d="m48 15 23 24-9 35-28 5-14-36ZM48 15l-4 33 18 26M20 43l24 5 27-9M44 48 34 79"/><path d="m74 64 9 8m-65-6-7 8"/>',
 earthbreaker:'<path d="M18 70h20l8-15-9-12 15-17-3-13M48 55l11 9 6-16 14 4M35 82l3-12M59 64l-2 19M18 36l8 5m43-15-5 8"/>',
 gust:'<path d="M17 36h42q17 0 17-12t-16-7M17 49h51q18 0 14 15-3 10-14 7M17 62h27q12 0 12 11t-13 6"/>',
 wind_blade:'<path d="M20 32q35-17 60-8L45 43l28 5-52 29 25-27-26-7 37-13Z"/>',
 air_lance:'<path d="m76 18 7 2-2 7-54 53-7-7ZM60 24l-6-9M72 38l10 3M38 28H18m14 15H12m11 15H12"/>',
 cyclone:'<path d="M19 29q27-20 57-5M18 40q24-17 56-6M24 50q23-12 44-7M31 60q17-9 31-7M38 70q11-6 18-6M44 80l8-6"/>',
 gale_burst:'<path d="M19 35q18-15 34 0t27-3M16 49q20-16 36 0t29-2M19 64q17-16 33-2t26-1"/><path d="m34 20 1-7m-3 64-3 7m38-65 5-5"/>',
 tempest:'<path d="M63 25q-26-12-38 10-14 28 16 39 21 7 34-11 9-14-2-25-12-13-25-4-13 9-7 20 6 10 16 4"/><path d="m64 15 1 11 12 1M24 72l-3 11"/>',
 ember:'<path d="M49 15q8 18 2 27 14-2 17-17 19 27 8 44-11 18-32 13-32-6-23-33 4-11 15-18-3 16 4 21 11-14 9-37Z"/><path d="M48 55q-17 20 0 25 16-7 0-25Z"/>',
 fireball:'<path d="m74 17-9 27q17 26-7 36-28 11-38-13-9-22 15-31l21-19-8 20 16-7Z"/><path d="M48 47q20 17 3 28-17 0-17-13 0-8 14-15Z"/>',
 flame_slash:'<path d="M77 17Q30 29 19 78q30-10 55-39L43 58q6-23 34-41Z"/><path d="m25 30 5-15 8 11m22 44 5 13 7-11"/>',
 scorch_lance:'<path d="m70 17 11 3-4 12-39 38-11-11ZM32 65l-15 16M47 28q-10-8-5-15M62 65q15 1 17 15M24 43q-10-2-10-12"/>',
 inferno:'<path d="M22 76q-14-22 6-45 0 16 9 17-3-21 14-35-1 23 12 31 10-7 8-19 22 27 5 51Z"/><path d="M43 77q-14-15 2-28 0 12 9 17l5-8q8 12 0 19"/>',
 phoenix_flare:'<path d="m48 36-7-17 12 9 5-14 4 22 19-9-10 19 13 2-21 17-15 17-13-17L13 48l14-1-11-20 21 10 11 15 11-6"/><path d="m35 65 13-5 15 5M48 61v20"/>',
 spark:'<path d="m54 14-31 39h23l-7 30 34-44H50Z"/><path d="m20 20 8 8m46 39 8 8m-7-54 6-7M17 72l7-6"/>',
 volt_dart:'<path d="m73 15-16 30h20L25 82l16-32H20Z"/>',
 thunder_lash:'<path d="M18 25h33L37 46h30L50 65h28L64 81M29 16l-6 8 6 8"/>',
 lightning:'<path d="m53 13-29 40h22l-7 30 34-45H51Z"/>',
 chain_surge:'<path d="m38 17-14 22h15l-4 16 21-27H43Z M64 48 50 70h15l-4 13 20-25H69Z"/><path d="M28 60q-12 17 3 21 10 4 18-5M64 39q15-15 5-22-7-5-17 0"/>',
 thunderstorm:'<path d="M21 43q-8-19 9-23 11-19 29-4 23-3 19 18 15 16-2 20H61M21 43h14M49 35 32 59h17l-9 24 29-35H52Z"/>'
};
await mkdir(out,{recursive:true});
for(const s of skills){
 if(!glyphs[s.id])throw Error('Missing rune: '+s.id);
 const color=colors[s.category];
 const art=glyphs[s.id].replace(/<path d="([^"]+)"/g,(all,path)=>all+` fill="${/[zZ]/.test(path)?'url(#symbol)':'none'}"${/[zZ]/.test(path)?' stroke="#10202e" stroke-width="1.8"':''}`).replace(/<circle /g,'<circle fill="url(#gem)" ');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none"><title>${s.name}</title><defs>
 <radialGradient id="gem" cx=".34" cy=".22" r=".9"><stop stop-color="${color}" stop-opacity=".7"/><stop offset=".4" stop-color="#15313f"/><stop offset="1" stop-color="#030d19"/></radialGradient>
 <linearGradient id="rim" x1="15" y1="5" x2="75" y2="92" gradientUnits="userSpaceOnUse"><stop stop-color="#f7ffff"/><stop offset=".24" stop-color="${color}"/><stop offset=".52" stop-color="#1f4656"/><stop offset=".76" stop-color="${color}"/><stop offset="1" stop-color="#07121c"/></linearGradient>
 <linearGradient id="symbol" x1="25" y1="15" x2="65" y2="82" gradientUnits="userSpaceOnUse"><stop stop-color="#fffef2"/><stop offset=".28" stop-color="${color}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="#47717a"/></linearGradient>
 <linearGradient id="gloss" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="disc"><circle cx="48" cy="48" r="40"/></clipPath>
 </defs><circle cx="48" cy="49" r="46" fill="#02080f"/><circle cx="48" cy="47" r="44" fill="url(#rim)"/><circle cx="48" cy="47" r="39.5" fill="url(#gem)" stroke="#07121d" stroke-width="2"/>
 <circle cx="48" cy="47" r="35.5" stroke="${color}" stroke-opacity=".3" stroke-width="1"/>
 <g transform="translate(6 5) scale(.875)" stroke="#020a16" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${art}</g>
 <g transform="translate(6 3.5) scale(.875)" stroke="url(#symbol)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">${art}</g>
 <path d="M8 29Q43-4 87 25L83 43Q45 23 13 49Z" fill="url(#gloss)" clip-path="url(#disc)"/><path d="M24 13Q47 2 66 12" stroke="#fff" stroke-opacity=".65" stroke-width="1.3" stroke-linecap="round"/><path d="m75 74 3 3" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>\n`;
 await writeFile(new URL(s.id+'.svg',out),svg);
}
console.log(`Built ${skills.length} glossy elemental battle runes.`);
