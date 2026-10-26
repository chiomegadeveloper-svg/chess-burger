import './build-rpg-core.mjs';
import './build-rpg-character-geometry.mjs';
import './build-rpg-skill-fx.mjs';
import './build-rpg-runes.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../rpg/',import.meta.url),out=new URL('../public/rpg/',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
let html=await read('src/hero-forge.html');
html=html.replace(/"stats":\[[0-9,]+\]/g,'"stats":[20,4,4,4,20,4]');
html=html.replace("btn.querySelector('.heroClass').textContent=h.heroClass","btn.querySelector('.heroClass').textContent=h.heroClass+' · '+RPGElements.label(RPGElements.affinity(h.id))");
html=html.replace('const HEROES=','const HERO_HEADS='+await read('src/hero-heads.json')+';const HEROES=');
html=html.replace("btn.querySelector('img').src=h.img","btn.querySelector('img').src=HERO_HEADS[h.id]");
html=html.replace('Every hero starts with six basic stats, each from 4 to 28. Select a hero to compare their strengths.','Start with 20 Health, 20 AP and 20 MP. Choose your one hero and your additional starting skill.').replace('LEVEL 1 · RANGE 4–28','LEVEL 1 · MAX 88').replaceAll('<small> / 28</small>','<small> base</small>');
html=html.replace('Equipment upgrades are coming soon.','Your hero choice is permanent for now.').replace('✧ ENCHANTMENT · SOON','✧ YOUR NEXT ROOM').replace('◈ WEAPON · ◈ ARMOR · ◈ RELIC · ◈ ACCESSORY','BAG · STASH · ATTACKS · SPELLS').replace('SAVE HERO LOCALLY ↗','CONFIRM HERO →');
html=html.replace(/RPG Hero Forge Sandbox/g,'RPG').replace(/SANDBOX · NOT DEPLOYED/g,'YOUR ADVENTURE').replace(/Saved on this device only[^<]*/g,'One hero per account · choose carefully');
html=html.replace('<head>','<head><base href="/rpg/"><script src="elements.js"></script><script src="live-skill-picker.js"></script><script src="live-bootstrap.js"></script>');
const css=await Promise.all(['hero-room','babaylan-book','damage-sprites','world','battle','merchant','chests'].map(f=>read('src/'+f+'.css')));
html=html.replace('</head>','<link rel="stylesheet" href="vendor/leaflet/leaflet.css"><link rel="stylesheet" href="live.css"><style>'+css.join('\n')+'</style></head>');
const names=['skill-catalog','progression','encounter-layout','inventory-core','item-images','babaylan-data','babaylan-images','hero-room','babaylan-book','damage-data','damage-sprites','character-attacks','character-idles','map-basemap','city-boundary','world','battle-sound','battle-backgrounds','battle','merchant','chests'];
const scripts=await Promise.all(names.map(async f=>'<script>\n'+await read('src/'+f+'.js')+'\n</script>'));
const parts=await Promise.all(['hero-room','babaylan-book','world','battle','merchant','chests'].map(f=>read('src/'+f+'.html')));
// Preserve the imported sandbox battle template; adapt only production copy and routes.
parts[3]=parts[3].replace('Battle Lab','Battle').replaceAll('10 m','200 m')
 .replace('Both players must be online and within 200 m to begin.','Nearby player selection happens on the map. Accept to begin the duel.')
 .replace('GPS victories earn hero XP; device practice progress stays on this device.','Victories earn hero XP. Combat does not require GPS.')
 .replace('History is saved on the server for online battles, and on this device for practice.','Puzzle history is saved to your account.')
 .replace('Map encounters require fresh GPS and accuracy within ±200 m, plus a measured distance of 200 m or less. GPS readings are estimates. PvP also requires the other player to accept.','The map checks the 200 m range when selecting an encounter. Combat needs no GPS updates. GPS resumes when you return to the map. PvP requires the other player to accept.')
 .replace('Sandbox battles use local hero loadouts and award no competitive or monetary rewards.','RPG battles award hero XP. They do not change Chess Burger ratings or CBG balances.')
 .replaceAll('href="/assets/','href="/rpg/assets/').replaceAll('href="/vendor/','href="/rpg/vendor/');
html=html.replace('</body>',parts.join('\n')+'<script src="vendor/skill-frame.js"></script><script src="vendor/ctjs-skill-fx.js"></script><script src="vendor/chess.js"></script><script src="vendor/battle-core.js"></script><script src="vendor/leaflet/leaflet.js"></script><script src="vendor/leaflet/Leaflet.VectorGrid.bundled.js"></script>'+scripts.join('\n')+'</body>');
html=html.replaceAll('{{BABAYLAN_BOOK_ICON}}','data:image/svg+xml;base64,'+Buffer.from(await read('babaylan-book.svg')).toString('base64'));
html=html.replaceAll('RPG SANDBOX','RPG').replaceAll('SANDBOX','ADVENTURE');
await mkdir(out,{recursive:true});await writeFile(new URL('index.html',out),html);
console.log('Built live Chess Burger RPG: '+fileURLToPath(new URL('index.html',out)));
