import {readFile,writeFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
// These shared catalogs expose browser globals as well as their CommonJS exports.
const catalogs=await Promise.all(['elements','progression','skill-catalog','potion-catalog'].map(name=>read(`api/_rpg/src/${name}.js`)));
const core=(await read('api/_rpg/core.mjs')).replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
const exports=['damageFor','SKILLS','MONSTERS','profile','monster','createBattle','usable','attack','advance','enemyTurn','finishTurn','defend','timeout','note','endBattle','gainResource','harvestAmount','harvestResult','potion','potionFromItem','battleSummary','publicBattle'];
await writeFile(new URL('../public/rpg/vendor/battle-core.js',import.meta.url),'(function(){'+catalogs.join('\n')+'\nconst attackSkills=globalThis.RPG_ATTACK_SKILLS,P=globalThis.RPGProgression,E=globalThis.RPGElements,Potions=globalThis.RPGPotions;\n'+core+'\nglobalThis.RPGBattleRules={'+exports.join(',')+'};})();');
