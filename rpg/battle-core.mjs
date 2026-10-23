// Shared deterministic rules. The server owns all combat mutations.
import attackSkills from './src/skill-catalog.js';
import P from './src/progression.js';
export const SKILLS=Object.fromEntries(attackSkills.map(s=>[s.id,s]));
export const MONSTERS=[['chaanack','Chaanack'],['erpack','Erpack'],['donkuber','Donkuber'],['windee','Windee'],['kalaagg','Kalaagg'],['pektu','Pektu'],['mhakiduk','Mhakiduk'],['odeksa','Odeksa'],['buhokba','Buhokba'],['muraduk','Muraduk'],['punsuck','Punsuck'],['conchita','Conchita'],['jengot','Jengot'],['draguu','Draguu'],['baluu','Baluu'],['kassag','Kassag']].map(([id,name],i)=>({id,name,boss:i>=10}));
export function profile(input){
 if(!input||!['rogue','theft','assassin','mage','tank','archer','queen','crusader'].includes(input.heroId)||typeof input.name!=='string'||input.name.trim().length<2||input.name.length>32||!Number.isInteger(input.level)||input.level<1||input.level>88||!Array.isArray(input.stats)||input.stats.length!==6||input.stats.some(n=>!Number.isInteger(n)||n<4||n>5000)||!Array.isArray(input.active)||input.active.length!==4||input.active.some(id=>id!==null&&!SKILLS[id])||new Set(input.active.filter(Boolean)).size!==input.active.filter(Boolean).length)throw Error('Invalid sandbox hero loadout.');
 const stats=input.stats.slice();return {heroId:input.heroId,name:input.name.trim(),level:input.level,stats,active:input.active.filter(Boolean),hp:stats[0],maxHp:stats[0],mp:stats[4],maxMp:stats[4],passives:input.passives||{},ap:input.maxAp||P.maxAp(input.level),maxAp:input.maxAp||P.maxAp(input.level),turns:0,ready:{},defending:false};
}
const monsterLoadouts=[['basic','punch','ember'],['basic','hammer_crash','stone_shard'],['basic','piercing_thrust','gust'],['basic','thorn_burst','tidal_orb'],['basic','crescent_slash','frost_lance'],['basic','ember','volt_dart'],['basic','frost_lance','crystal_crush'],['basic','wind_blade','thunder_lash'],['basic','punch','gale_burst'],['basic','air_lance','spark'],['basic','earthbreaker','crystal_crush','thorn_burst'],['basic','flame_slash','inferno','phoenix_flare'],['basic','cyclone','tempest','gale_burst'],['basic','fireball','lightning','thunderstorm'],['basic','meteor_fist','chain_surge','hammer_crash'],['basic','scorch_lance','thunder_lash','tidal_orb']];
function monsterLoadout(id,level){return monsterLoadouts[MONSTERS.findIndex(m=>m.id===id)].filter(skill=>skill==='basic'||SKILLS[skill].animation.row<=Math.floor(level/2));}
export function monster(id,level=1){const m=MONSTERS.find(m=>m.id===id);if(!m)throw Error('Unknown monster.');level=P.clampLevel(level);const stats=P.baseStats(level);return {...m,heroId:id,level,stats,active:monsterLoadout(id,level),hp:stats[0],maxHp:stats[0],mp:stats[4],maxMp:stats[4],ap:P.maxAp(level),maxAp:P.maxAp(level),turns:0,ready:{},defending:false};}
const emptyReport=()=>({damage:0,attacks:0,apSpent:0,mpSpent:0,apGained:0,mpGained:0,defends:0,skills:{}});
function reportFor(b,side){if(!b.report)b.report={complete:false,actors:[emptyReport(),emptyReport()]};return b.report.actors[side];}
export function endBattle(b,winner,reason='knockout',now=Date.now()){
 if(b.status==='finished')return;
 b.status='finished';b.winner=winner;b.endReason=reason;b.endedAt=now;b.challenge=null;
}
export function gainResource(b,side,resource,amount=20){
 if(!['ap','mp'].includes(resource)||!Number.isFinite(amount)||amount<0)throw Error('Invalid resource gain.');
 const a=b.actors[side],before=a[resource];a[resource]+=Math.min(amount,Math.max(0,a[resource==='ap'?'maxAp':'maxMp']-a[resource]));
 const gained=a[resource]-before;reportFor(b,side)[resource+'Gained']+=gained;return gained;
}
export function potion(b,side,resource,amount=20){
 if(b.status!=='active'||b.turn!==side||b.challenge||!['hp','mp'].includes(resource))throw Error('Use a potion only on your turn, outside a harvest.');
 const actor=b.actors[side],cap=actor[resource==='hp'?'maxHp':'maxMp'];if(actor.hp<=0||actor[resource]>=cap)throw Error(resource==='hp'?'Health is already full.':'Mana is already full.');
 amount=Math.round(amount*(1+(actor.passives?.potionPower||0)/100));const restored=resource==='mp'?gainResource(b,side,'mp',amount):Math.min(amount,cap-actor.hp);if(resource==='hp')actor.hp+=restored;
 b.eventSeq=(b.eventSeq||0)+1;b.events=[...(b.events||[]),{id:b.eventSeq,kind:'potion',resource,side,target:side,amount:restored,hpAfter:actor.hp}].slice(-12);
 note(b,`${actor.name} used a ${resource==='hp'?'health':'mana'} potion · +${restored} ${resource.toUpperCase()} · turn ended.`);return restored;
}
export function harvestResult(b,side,resource,success,reason){
 const amount=success?gainResource(b,side,resource):0;
 b.harvestResult={id:(b.harvestResult?.id||0)+1,side,resource,success,amount,reason};
 return amount;
}
export function battleSummary(b,side=0){
 if(b.status!=='finished'||![0,1].includes(side))return null;
 return {winner:b.winner===side,reason:b.endReason||'unknown',rounds:b.round,durationMs:Number.isFinite(b.startedAt)&&Number.isFinite(b.endedAt)?Math.max(0,b.endedAt-b.startedAt):null,complete:b.report?.complete===true,
  actors:[side,1-side].map(i=>{const a=b.actors[i],r=b.report?.actors[i];return {name:a.name,heroId:a.heroId,level:a.level,hp:a.hp,maxHp:a.maxHp,ap:a.ap,mp:a.mp,stats:r?{damage:r.damage,damageTaken:b.report?.actors[1-i]?.damage??null,attacks:r.attacks,apSpent:r.apSpent,mpSpent:r.mpSpent,apGained:r.apGained,mpGained:r.mpGained,defends:r.defends}:null,skills:r?Object.entries(r.skills).map(([id,v])=>({id,name:SKILLS[id]?.name||id,...v})):[]};})};
}
export function createBattle(a,b,kind='monster',now=Date.now()){a.turns=1;return {startedAt:kind==='pvp'?null:now,endedAt:null,endReason:null,report:{complete:true,actors:[emptyReport(),emptyReport()]},kind,status:kind==='pvp'?'pending':'active',actors:[a,b],turn:0,round:1,ply:0,version:0,battleEndsAt:kind==='pvp'?null:now+300000,deadline:now+(kind==='pvp'?60000:300000),events:[],eventSeq:0,log:['Battle ready. Equipment and skills are locked for this encounter.'],challenge:null,winner:null};}
export function note(b,s){b.log.push(s);b.log=b.log.slice(-30);}
export function usable(b,side,id){const a=b.actors[side],s=SKILLS[id];return b.status==='active'&&b.turn===side&&!b.challenge&&s&&a.active.includes(id)&&a.ap>=s.ap&&a.mp>=s.mp&&(a.ready[id]||0)<=a.turns;}
export function attack(b,side,id,now=Date.now()){if(!usable(b,side,id))throw Error('Skill unavailable: check AP, mana, cooldown, and whose turn it is.');const a=b.actors[side],d=b.actors[1-side],s=SKILLS[id];a.ap-=s.ap;a.mp-=s.mp;a.ready[id]=a.turns+s.cooldown+1;let damage=Math.max(1,Math.round((a.stats[s.magic?2:1]*s.scale+2)-d.stats[3]*.15));const p=a.passives||{},res=d.passives||{};damage=Math.max(1,Math.round(damage*(1+(p[s.magic?'magicDamage':'physicalDamage']||0)/100)*(1+(b.kind==='monster'&&side===0?(p.monsterDamage||0):0)/100)*(1-(res.damageReduction||0)/100)));if(d.defending)damage=Math.max(1,Math.ceil(damage/2));const hpBefore=d.hp,effective=Math.min(d.hp,damage);d.hp=Math.max(0,d.hp-damage);const r=reportFor(b,side);r.damage+=effective;r.attacks++;r.apSpent+=s.ap;r.mpSpent+=s.mp;const use=r.skills[id]||(r.skills[id]={uses:0,damage:0});use.uses++;use.damage+=effective;b.eventSeq=(b.eventSeq||0)+1;b.events=[...(b.events||[]),{id:b.eventSeq,skill:id,side,target:1-side,damage,hpBefore,hpAfter:d.hp}].slice(-12);note(b,`${a.name} used ${s.name} · ${damage} damage.`);if(d.hp===0){endBattle(b,side,'knockout',now);note(b,`${a.name} wins.`);}return damage;}
export function advance(b,now=Date.now()){
 if(b.status!=='active')return;b.challenge=null;b.ply++;b.turn=1-b.turn;b.round=Math.floor(b.ply/2)+1;const a=b.actors[b.turn];a.turns++;a.defending=false;b.deadline=now+(b.kind==='pvp'?90000:1800000);
}
export function enemyTurn(b,now=Date.now()){
 if(b.status!=='active'||b.turn!==1||b.kind==='pvp')return;
 const a=b.actors[1],target=b.actors[0],available=a.active.filter(id=>usable(b,1,id));
 const estimate=id=>Math.max(1,Math.round(a.stats[SKILLS[id].magic?2:1]*SKILLS[id].scale+2-target.stats[3]*.15));
 const lethal=available.find(id=>estimate(id)*(target.defending?.5:1)>=target.hp);
 if(lethal)attack(b,1,lethal,now);
 else if((a.hp/a.maxHp<.35&&a.turns%3===0)||!available.length){
  if(!available.length&&(a.ap<a.maxAp||a.mp<a.maxMp)&&a.turns%2===0){const resource=a.ap/a.maxAp<a.mp/a.maxMp?'ap':'mp';const gained=gainResource(b,1,resource);recordAction(b,{kind:'recover',side:1,resource,amount:gained});note(b,`${a.name} recovers ${gained} ${resource.toUpperCase()}.`);}
  else defend(b,1);
 }else{const choices=available.sort((x,y)=>estimate(y)-estimate(x)),id=choices[a.turns%Math.min(2,choices.length)];attack(b,1,id,now);}
 advance(b,now);
}
export function finishTurn(b,now=Date.now()){advance(b,now);enemyTurn(b,now);}
function recordAction(b,event){b.eventSeq=(b.eventSeq||0)+1;b.events=[...(b.events||[]),{id:b.eventSeq,...event}].slice(-12);}
export function defend(b,side){b.actors[side].defending=true;reportFor(b,side).defends++;const ap=gainResource(b,side,'ap',8),mp=gainResource(b,side,'mp',8);recordAction(b,{kind:'defend',side,ap,mp});note(b,`${b.actors[side].name} defends · +${ap} AP, +${mp} MP for the next turn (up to cap) · next incoming damage halved.`);}
export function timeout(b,now=Date.now()){
 if(!['active','pending'].includes(b.status))return false;
 if(b.status==='active'&&now>=(b.battleEndsAt??b.startedAt+300000)){endBattle(b,null,'battle_limit',b.battleEndsAt??b.startedAt+300000);note(b,'Five minute battle limit reached. No victory rewards.');return true;}
 const c=b.challenge;if(c?.kind==='ap'&&c.clocks){const turn=c.moves.length%2;if(now-c.clockAt>=c.clocks[turn]){harvestResult(b,c.side,'ap',turn===1,'Chess clock expired');finishTurn(b,now);return true;}}
 if(now<=b.deadline)return false;
 if(b.status==='pending'){b.status='cancelled';note(b,'Challenge expired.');}else{endBattle(b,1-b.turn,'timeout',now);note(b,`${b.actors[b.turn].name} ran out of time and forfeited.`);}return true;
}
export function publicBattle(b,me){if(!b)return null;const c=b.challenge;return {...b,me,actors:b.actors.map(a=>{const {userId,...visible}=a;return visible;}),challenge:c?{kind:c.kind,side:c.side,clocks:c.clocks,clockAt:c.clockAt,...(c.side===me?{fen:c.fen,moves:c.moves||[],elo:c.elo,puzzleId:c.puzzleId,rating:c.rating,pool:c.pool}:{} )}:null};}
