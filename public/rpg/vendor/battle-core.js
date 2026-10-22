(function(){(function(root){
 const MAX_LEVEL=88,clampLevel=n=>Math.max(1,Math.min(MAX_LEVEL,Math.floor(Number(n)||1)));
 const nextXp=level=>level>=MAX_LEVEL?0:100+35*(level-1)+5*(level-1)**2;
 function threshold(level){let xp=0;for(let n=1;n<clampLevel(level);n++)xp+=nextXp(n);return xp;}
 function progress(totalXp=0){totalXp=Math.min(threshold(88),Math.max(0,Math.floor(Number(totalXp)||0)));let level=1;while(level<88&&totalXp>=threshold(level+1))level++;return {level,totalXp,xp:totalXp-threshold(level),nextXp:nextXp(level),maxLevel:88};}
 const baseStats=level=>{const n=clampLevel(level)-1;return [20+4*n,4+n,4+n,4+n,20+3*n,4+n];};
 const maxAp=level=>20+2*(clampLevel(level)-1);
 function victoryXp(heroLevel,monsterLevel){return Math.round((40+12*clampLevel(monsterLevel))*Math.max(.5,Math.min(1.6,1+(monsterLevel-heroLevel)*.15)));}
 const api={MAX_LEVEL,clampLevel,nextXp,threshold,progress,baseStats,maxAp,victoryXp};root.RPGProgression=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
// Single catalogue shared by room, server combat, browser combat, and ct.js effects.
(function(root){
 const skills=[
  {
    "id": "basic",
    "name": "Basic Tackle",
    "category": "physical",
    "sprite": "skill_basic",
    "bonus": [
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "description": "A quick, economical shoulder impact.",
    "ap": 4,
    "mp": 2,
    "cooldown": 0,
    "scale": 0.38,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "punch",
    "name": "Super Punch",
    "category": "physical",
    "sprite": "skill_punch",
    "bonus": [
      0,
      3,
      0,
      0,
      0,
      0
    ],
    "description": "A heavy close-range punch.",
    "ap": 8,
    "mp": 4,
    "cooldown": 1,
    "scale": 0.7,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "crescent_slash",
    "name": "Crescent Slash",
    "category": "physical",
    "sprite": "skill_crescent_slash",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A broad silver blade arc.",
    "ap": 10,
    "mp": 4,
    "cooldown": 1,
    "scale": 0.82,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "piercing_thrust",
    "name": "Piercing Thrust",
    "category": "physical",
    "sprite": "skill_piercing_thrust",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A concentrated forward strike.",
    "ap": 12,
    "mp": 5,
    "cooldown": 2,
    "scale": 0.96,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "hammer_crash",
    "name": "Hammer Crash",
    "category": "physical",
    "sprite": "skill_hammer_crash",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A crushing impact that scatters stone.",
    "ap": 14,
    "mp": 6,
    "cooldown": 2,
    "scale": 1.1,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "meteor_fist",
    "name": "Meteor Fist",
    "category": "physical",
    "sprite": "skill_meteor_fist",
    "bonus": [
      0,
      2,
      0,
      0,
      0,
      2
    ],
    "description": "A costly, powerful golden finishing blow.",
    "ap": 18,
    "mp": 8,
    "cooldown": 3,
    "scale": 1.35,
    "magic": false,
    "animation": {
      "sheet": "physical",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "stone_shard",
    "name": "Stone Shard",
    "category": "elemental",
    "sprite": "skill_stone_shard",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Launch a sharpened fragment of earth.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "tidal_orb",
    "name": "Tidal Orb",
    "category": "elemental",
    "sprite": "skill_tidal_orb",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Strike with a compressed sphere of water.",
    "ap": 5,
    "mp": 6,
    "cooldown": 1,
    "scale": 0.62,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "frost_lance",
    "name": "Frost Lance",
    "category": "elemental",
    "sprite": "skill_frost_lance",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A sharp lance of enchanted ice.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "thorn_burst",
    "name": "Thorn Burst",
    "category": "elemental",
    "sprite": "skill_thorn_burst",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Unleash a cluster of magical thorns.",
    "ap": 8,
    "mp": 9,
    "cooldown": 2,
    "scale": 0.96,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "crystal_crush",
    "name": "Crystal Crush",
    "category": "elemental",
    "sprite": "skill_crystal_crush",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Shatter a concentrated violet crystal.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "earthbreaker",
    "name": "Earthbreaker",
    "category": "elemental",
    "sprite": "skill_earthbreaker",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "Release a deep eruption of earth energy.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "elemental",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "gust",
    "name": "Gust",
    "category": "wind",
    "sprite": "skill_gust",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A fast, inexpensive pulse of air.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "wind_blade",
    "name": "Wind Blade",
    "category": "wind",
    "sprite": "skill_wind_blade",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Cut through the air with a mint crescent.",
    "ap": 5,
    "mp": 6,
    "cooldown": 1,
    "scale": 0.62,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "air_lance",
    "name": "Air Lance",
    "category": "wind",
    "sprite": "skill_air_lance",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A focused spear of rushing air.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "cyclone",
    "name": "Cyclone",
    "category": "wind",
    "sprite": "skill_cyclone",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A tightly wound spinning vortex.",
    "ap": 8,
    "mp": 9,
    "cooldown": 2,
    "scale": 0.96,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "gale_burst",
    "name": "Gale Burst",
    "category": "wind",
    "sprite": "skill_gale_burst",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Release a powerful radial gale.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "tempest",
    "name": "Tempest",
    "category": "wind",
    "sprite": "skill_tempest",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A high-cost storm of swirling air.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "wind",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "ember",
    "name": "Ember",
    "category": "fire",
    "sprite": "skill_ember",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A small, efficient burning spark.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "fireball",
    "name": "Fireball",
    "category": "fire",
    "sprite": "skill_fireball",
    "bonus": [
      0,
      0,
      3,
      0,
      1,
      0
    ],
    "description": "A focused burst of fire magic.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "flame_slash",
    "name": "Flame Slash",
    "category": "fire",
    "sprite": "skill_flame_slash",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A sweeping arc of crimson flame.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "scorch_lance",
    "name": "Scorch Lance",
    "category": "fire",
    "sprite": "skill_scorch_lance",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A concentrated spear of fire.",
    "ap": 8,
    "mp": 9,
    "cooldown": 2,
    "scale": 0.96,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "inferno",
    "name": "Inferno",
    "category": "fire",
    "sprite": "skill_inferno",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "An expanding ring of searing flame.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "phoenix_flare",
    "name": "Phoenix Flare",
    "category": "fire",
    "sprite": "skill_phoenix_flare",
    "bonus": [
      0,
      0,
      2,
      0,
      2,
      0
    ],
    "description": "A golden phoenix-shaped magical burst.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "fire",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "spark",
    "name": "Spark",
    "category": "lightning",
    "sprite": "skill_spark",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A small, economical electric arc.",
    "ap": 3,
    "mp": 4,
    "cooldown": 0,
    "scale": 0.4,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 0,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "volt_dart",
    "name": "Volt Dart",
    "category": "lightning",
    "sprite": "skill_volt_dart",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Fire a focused electric projectile.",
    "ap": 5,
    "mp": 6,
    "cooldown": 1,
    "scale": 0.62,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 1,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "thunder_lash",
    "name": "Thunder Lash",
    "category": "lightning",
    "sprite": "skill_thunder_lash",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A crackling whip of blue electricity.",
    "ap": 6,
    "mp": 8,
    "cooldown": 2,
    "scale": 0.85,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 2,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "lightning",
    "name": "Lightning",
    "category": "lightning",
    "sprite": "skill_lightning",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A precise golden lightning strike.",
    "ap": 10,
    "mp": 10,
    "cooldown": 3,
    "scale": 1.1,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 3,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "chain_surge",
    "name": "Chain Surge",
    "category": "lightning",
    "sprite": "skill_chain_surge",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "Interlinked violet bolts strike one opponent.",
    "ap": 10,
    "mp": 11,
    "cooldown": 3,
    "scale": 1.15,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 4,
      "frames": 6,
      "fps": 9
    }
  },
  {
    "id": "thunderstorm",
    "name": "Thunderstorm",
    "category": "lightning",
    "sprite": "skill_thunderstorm",
    "bonus": [
      0,
      0,
      2,
      0,
      0,
      2
    ],
    "description": "A powerful blue and gold lightning explosion.",
    "ap": 12,
    "mp": 14,
    "cooldown": 3,
    "scale": 1.35,
    "magic": true,
    "animation": {
      "sheet": "lightning",
      "row": 5,
      "frames": 6,
      "fps": 9
    }
  }
];
 root.RPG_ATTACK_SKILLS=skills;
 if(typeof module!=="undefined"&&module.exports)module.exports=skills;
})(globalThis);
// Shared deterministic rules. The server owns all combat mutations.
const attackSkills=window.RPG_ATTACK_SKILLS;
const P=window.RPGProgression;
const SKILLS=Object.fromEntries(attackSkills.map(s=>[s.id,s]));
const MONSTERS=[['chaanack','Chaanack'],['erpack','Erpack'],['donkuber','Donkuber'],['windee','Windee'],['kalaagg','Kalaagg'],['pektu','Pektu'],['mhakiduk','Mhakiduk'],['odeksa','Odeksa'],['buhokba','Buhokba'],['muraduk','Muraduk'],['punsuck','Punsuck'],['conchita','Conchita'],['jengot','Jengot'],['draguu','Draguu'],['baluu','Baluu'],['kassag','Kassag']].map(([id,name],i)=>({id,name,boss:i>=10}));
function profile(input){
 if(!input||!['rogue','theft','assassin','mage','tank','archer','queen','crusader'].includes(input.heroId)||typeof input.name!=='string'||input.name.trim().length<2||input.name.length>32||!Number.isInteger(input.level)||input.level<1||input.level>88||!Array.isArray(input.stats)||input.stats.length!==6||input.stats.some(n=>!Number.isInteger(n)||n<4||n>5000)||!Array.isArray(input.active)||input.active.length!==4||input.active.some(id=>id!==null&&!SKILLS[id])||new Set(input.active.filter(Boolean)).size!==input.active.filter(Boolean).length)throw Error('Invalid sandbox hero loadout.');
 const stats=input.stats.slice();return {heroId:input.heroId,name:input.name.trim(),level:input.level,stats,active:input.active.filter(Boolean),hp:stats[0],maxHp:stats[0],mp:stats[4],maxMp:stats[4],ap:P.maxAp(input.level),maxAp:P.maxAp(input.level),turns:0,ready:{},defending:false};
}
const monsterLoadouts=[['basic','punch','ember'],['basic','hammer_crash','stone_shard'],['basic','piercing_thrust','gust'],['basic','thorn_burst','tidal_orb'],['basic','crescent_slash','frost_lance'],['basic','ember','volt_dart'],['basic','frost_lance','crystal_crush'],['basic','wind_blade','thunder_lash'],['basic','punch','gale_burst'],['basic','air_lance','spark'],['basic','earthbreaker','crystal_crush','thorn_burst'],['basic','flame_slash','inferno','phoenix_flare'],['basic','cyclone','tempest','gale_burst'],['basic','fireball','lightning','thunderstorm'],['basic','meteor_fist','chain_surge','hammer_crash'],['basic','scorch_lance','thunder_lash','tidal_orb']];
function monsterLoadout(id,level){return monsterLoadouts[MONSTERS.findIndex(m=>m.id===id)].filter(skill=>skill==='basic'||SKILLS[skill].animation.row<=Math.floor(level/2));}
function monster(id,level=1){const m=MONSTERS.find(m=>m.id===id);if(!m)throw Error('Unknown monster.');level=P.clampLevel(level);const stats=P.baseStats(level);return {...m,heroId:id,level,stats,active:monsterLoadout(id,level),hp:stats[0],maxHp:stats[0],mp:stats[4],maxMp:stats[4],ap:P.maxAp(level),maxAp:P.maxAp(level),turns:0,ready:{},defending:false};}
const emptyReport=()=>({damage:0,attacks:0,apSpent:0,mpSpent:0,apGained:0,mpGained:0,defends:0,skills:{}});
function reportFor(b,side){if(!b.report)b.report={complete:false,actors:[emptyReport(),emptyReport()]};return b.report.actors[side];}
function endBattle(b,winner,reason='knockout',now=Date.now()){
 if(b.status==='finished')return;
 b.status='finished';b.winner=winner;b.endReason=reason;b.endedAt=now;b.challenge=null;
}
function gainResource(b,side,resource,amount=20){
 if(!['ap','mp'].includes(resource)||!Number.isFinite(amount)||amount<0)throw Error('Invalid resource gain.');
 const a=b.actors[side],before=a[resource];a[resource]+=Math.min(amount,Math.max(0,a[resource==='ap'?'maxAp':'maxMp']-a[resource]));
 const gained=a[resource]-before;reportFor(b,side)[resource+'Gained']+=gained;return gained;
}
function harvestResult(b,side,resource,success,reason){
 const amount=success?gainResource(b,side,resource):0;
 b.harvestResult={id:(b.harvestResult?.id||0)+1,side,resource,success,amount,reason};
 return amount;
}
function battleSummary(b,side=0){
 if(b.status!=='finished'||![0,1].includes(side))return null;
 return {winner:b.winner===side,reason:b.endReason||'unknown',rounds:b.round,durationMs:Number.isFinite(b.startedAt)&&Number.isFinite(b.endedAt)?Math.max(0,b.endedAt-b.startedAt):null,complete:b.report?.complete===true,
  actors:[side,1-side].map(i=>{const a=b.actors[i],r=b.report?.actors[i];return {name:a.name,heroId:a.heroId,level:a.level,hp:a.hp,maxHp:a.maxHp,ap:a.ap,mp:a.mp,stats:r?{damage:r.damage,damageTaken:b.report?.actors[1-i]?.damage??null,attacks:r.attacks,apSpent:r.apSpent,mpSpent:r.mpSpent,apGained:r.apGained,mpGained:r.mpGained,defends:r.defends}:null,skills:r?Object.entries(r.skills).map(([id,v])=>({id,name:SKILLS[id]?.name||id,...v})):[]};})};
}
function createBattle(a,b,kind='monster',now=Date.now()){a.turns=1;return {startedAt:kind==='pvp'?null:now,endedAt:null,endReason:null,report:{complete:true,actors:[emptyReport(),emptyReport()]},kind,status:kind==='pvp'?'pending':'active',actors:[a,b],turn:0,round:1,ply:0,version:0,deadline:now+(kind==='pvp'?60000:1800000),events:[],eventSeq:0,log:['Battle ready. Equipment and skills are locked for this encounter.'],challenge:null,winner:null};}
function note(b,s){b.log.push(s);b.log=b.log.slice(-30);}
function usable(b,side,id){const a=b.actors[side],s=SKILLS[id];return b.status==='active'&&b.turn===side&&!b.challenge&&s&&a.active.includes(id)&&a.ap>=s.ap&&a.mp>=s.mp&&(a.ready[id]||0)<=a.turns;}
function attack(b,side,id,now=Date.now()){if(!usable(b,side,id))throw Error('Skill unavailable: check AP, mana, cooldown, and whose turn it is.');const a=b.actors[side],d=b.actors[1-side],s=SKILLS[id];a.ap-=s.ap;a.mp-=s.mp;a.ready[id]=a.turns+s.cooldown+1;let damage=Math.max(1,Math.round((a.stats[s.magic?2:1]*s.scale+2)-d.stats[3]*.15));if(d.defending)damage=Math.max(1,Math.ceil(damage/2));const hpBefore=d.hp,effective=Math.min(d.hp,damage);d.hp=Math.max(0,d.hp-damage);const r=reportFor(b,side);r.damage+=effective;r.attacks++;r.apSpent+=s.ap;r.mpSpent+=s.mp;const use=r.skills[id]||(r.skills[id]={uses:0,damage:0});use.uses++;use.damage+=effective;b.eventSeq=(b.eventSeq||0)+1;b.events=[...(b.events||[]),{id:b.eventSeq,skill:id,side,target:1-side,damage,hpBefore,hpAfter:d.hp}].slice(-12);note(b,`${a.name} used ${s.name} · ${damage} damage.`);if(d.hp===0){endBattle(b,side,'knockout',now);note(b,`${a.name} wins.`);}return damage;}
function advance(b,now=Date.now()){
 if(b.status!=='active')return;b.challenge=null;b.ply++;b.turn=1-b.turn;b.round=Math.floor(b.ply/2)+1;const a=b.actors[b.turn];a.turns++;a.defending=false;b.deadline=now+(b.kind==='pvp'?90000:1800000);
}
function enemyTurn(b,now=Date.now()){
 if(b.status!=='active'||b.turn!==1||b.kind==='pvp')return;
 const a=b.actors[1],target=b.actors[0],available=a.active.filter(id=>usable(b,1,id));
 const estimate=id=>Math.max(1,Math.round(a.stats[SKILLS[id].magic?2:1]*SKILLS[id].scale+2-target.stats[3]*.15));
 const lethal=available.find(id=>estimate(id)*(target.defending?.5:1)>=target.hp);
 const needs=a.ap<Math.min(a.maxAp,8)||a.mp<Math.min(a.maxMp,8);
 if(lethal)attack(b,1,lethal,now);
 else if(needs||(a.hp/a.maxHp<.35&&a.turns%3===0)||!available.length){
  if(!available.length&&(a.ap<a.maxAp||a.mp<a.maxMp)&&a.turns%2===0){const resource=a.ap/a.maxAp<a.mp/a.maxMp?'ap':'mp';const gained=gainResource(b,1,resource);note(b,`${a.name} recovers ${gained} ${resource.toUpperCase()}.`);}
  else defend(b,1);
 }else{const choices=available.sort((x,y)=>estimate(y)-estimate(x)),id=choices[a.turns%Math.min(2,choices.length)];attack(b,1,id,now);}
 advance(b,now);
}
function finishTurn(b,now=Date.now()){advance(b,now);enemyTurn(b,now);}
function defend(b,side){b.actors[side].defending=true;reportFor(b,side).defends++;const ap=gainResource(b,side,'ap',8),mp=gainResource(b,side,'mp',8);note(b,`${b.actors[side].name} defends · +${ap} AP, +${mp} MP for the next turn (up to cap) · next incoming damage halved.`);}
function timeout(b,now=Date.now()){
 if(!['active','pending'].includes(b.status)||now<=b.deadline)return false;
 if(b.status==='pending'){b.status='cancelled';note(b,'Challenge expired.');}else{endBattle(b,1-b.turn,'timeout',now);note(b,`${b.actors[b.turn].name} ran out of time and forfeited.`);}return true;
}
function publicBattle(b,me){if(!b)return null;const c=b.challenge;return {...b,me,actors:b.actors.map(a=>{const {userId,...visible}=a;return visible;}),challenge:c?{kind:c.kind,side:c.side,...(c.side===me?{fen:c.fen,moves:c.moves||[],elo:c.elo,puzzleId:c.puzzleId,rating:c.rating,pool:c.pool}:{} )}:null};}

window.RPGBattleRules={SKILLS,MONSTERS,profile,monster,createBattle,usable,attack,advance,enemyTurn,finishTurn,defend,timeout,note,endBattle,gainResource,harvestResult,battleSummary};})();