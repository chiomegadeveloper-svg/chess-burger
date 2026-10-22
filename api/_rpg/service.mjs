import {health,healthCap,mana,manaCap,normalize,loot,stash,recovery} from './rewards.mjs';
import {Chess} from 'chess.js';
import puzzles from './puzzles.json' with {type:'json'};
import * as R from './core.mjs';
import P from './src/progression.js';
import C from './src/inventory-core.js';
import Layout from './src/encounter-layout.js';
import {distanceMeters,validateFix} from './world.mjs';
import {roadPoints} from './map.mjs';
import {read,insert,write,fail,makeHero,saveInventory,progression} from './store.mjs';
const uci=m=>({from:m.slice(0,2),to:m.slice(2,4),promotion:m[4]||'q'});
const rand=n=>crypto.getRandomValues(new Uint32Array(1))[0]%n;
export async function gameRequest(client,user,method,input={},services={}){
 const now=services.now?.()??Date.now();let doc=await read(client,user),shared=null;
 const persist=()=>write(client,user,'rpg_profile','hero',doc);
 const cachedSet=()=>doc?.monsterSet?.refreshAt>now?{encounters:(doc.encounters||[]).filter(e=>!e.consumed&&e.expires_at>now),refreshAt:doc.monsterSet.refreshAt}:null;
 if(doc?.state){const normalized=normalize(doc),recovered=input.action==='init'&&recovery(doc);if(normalized||recovered)await persist();}
 if(input.action==='init')return {game:doc?.state||null,generation:doc?.generation||null,spawnCache:cachedSet()};
 const resetError=()=>{throw Object.assign(Error('Your RPG hero was reset by an owner. Reopen RPG to choose your hero.'),{status:409,code:'hero_reset'});};
 if(doc?.generation&&input.generation!==doc.generation)resetError();
 if(input.action==='register'){
  if(doc?.state){if(doc.heroId!==input.heroId||doc.name!==String(input.name).trim()||doc.starterSkill!==input.skill)fail('Your hero has already been chosen and cannot be changed.');return {game:doc.state,generation:doc.generation||null};}
  const proposed=makeHero(input);recovery(proposed);
  if(doc){Object.assign(proposed,{revision:doc.revision,generation:doc.generation,lastReset:doc.lastReset});await write(client,user,'rpg_profile','hero',proposed);}
  else await insert(client,user,'rpg_profile','hero',proposed);
  doc=await read(client,user);
  if(!doc?.state||doc.heroId!==proposed.heroId||doc.name!==proposed.name||doc.starterSkill!==proposed.starterSkill)fail('A hero was already confirmed in another window. Reopen RPG to continue.');return {game:doc.state,generation:doc.generation||null};
 }
 if(!doc?.state){if(doc?.generation)resetError();fail('Choose your hero first.',409);}
 if(input.action==='claimLoot'){stash(doc);await persist();return {game:doc.state,pendingLoot:doc.pendingLoot};}
 if(input.action==='save'){if(doc.pvpId){const rows=await client.from('cb_inventory_items').select('metadata').eq('item_kind','rpg_battle').eq('item_id',doc.pvpId).contains('metadata',{participants:[user]}).maybeSingle();if(rows.error||['active','pending'].includes(rows.data?.metadata?.status))fail('Equipment is locked during battle.');}saveInventory(doc,input.state);await persist();return {game:doc.state};}
 const near=(a,b)=>{if(!a)fail('Use a fresh map location to select an encounter.');const distance=distanceMeters(a,b);if(distance>200)throw Object.assign(Error('Outside attack range. Move within 200 meters to battle.'),{status:409,code:'out_of_range',distance:Math.ceil(distance)});};
 const getPresence=async id=>{const p=await read(client,id,'rpg_presence','live');if(!p||now-p.updatedAt>30000)fail('This player needs a fresh online GPS position.');return p;};
 if(input.channel==='presence'){
  if(method==='DELETE'){const r=await client.from('cb_inventory_items').delete().eq('user_id',user).eq('item_kind','rpg_presence').eq('item_id','live');if(r.error)fail('Could not stop player sharing.',503);return {ok:true};}
  const old=await read(client,user,'rpg_presence','live');
  if(method==='POST'){const gps=validateFix({...input,time:now},now);if(!gps)fail('Wait for an accurate GPS fix.');const p={...gps,revision:old?.revision||0,peerId:old?.peerId||crypto.randomUUID(),heroId:doc.heroId,name:doc.name,level:doc.state.level,updatedAt:now};if(old)await write(client,user,'rpg_presence','live',p);else await insert(client,user,'rpg_presence','live',p);return {ok:true};}
  if(!old||now-old.updatedAt>30000)return {players:[]};
  const rows=await client.from('cb_inventory_items').select('user_id,metadata').eq('item_kind','rpg_presence').gt('updated_at',new Date(now-45000).toISOString()).neq('user_id',user).limit(200);if(rows.error)fail('Nearby players unavailable.',503);
  return {players:(rows.data||[]).map(r=>r.metadata).filter(p=>now-p.updatedAt<45000&&distanceMeters(p,old)<=5000).sort((a,b)=>distanceMeters(a,old)-distanceMeters(b,old)).slice(0,100)};
 }
 const player=async (id=user)=>{const d=id===user?doc:await read(client,id);if(!d?.state)fail('This player has not chosen a hero.');const s=d.state;return {...R.profile({heroId:d.heroId,name:d.name,level:s.level,stats:C.totals(s,P.baseStats(s.level)),active:s.active}),hp:health(s),mp:mana(s),userId:id,heroGeneration:d.generation||null};};
 const me=b=>b.actors.findIndex(a=>a.userId===user),visible=b=>R.publicBattle(b,me(b));
 const save=async (b,solvedId=null)=>{
  b.version++;if(solvedId){doc.history=[solvedId,...doc.history.filter(id=>id!==solvedId)].slice(0,1000);}
  if(b.kind==='pvp'){shared.state=b;shared.status=b.status;await write(client,shared.owner,'rpg_battle',b.id,shared);if(solvedId)await persist();}
  else{doc.battle=b;await persist();}
 };
 async function validShared(b){
  const profiles=await Promise.all(b.actors.map(a=>a.userId===user?doc:read(client,a.userId)));
  if(profiles.every((p,i)=>p?.state&&(p.generation||null)===(b.actors[i].heroGeneration||null)))return true;
  if(['active','pending'].includes(b.status)){b.status='cancelled';b.winner=null;b.challenge=null;R.note(b,'Battle closed because a hero was reset by an owner.');await save(b);}
  return false;
 }
 async function current(){
  if(doc.pvpId){const rows=await client.from('cb_inventory_items').select('metadata').eq('item_kind','rpg_battle').eq('item_id',doc.pvpId).contains('metadata',{participants:[user]}).maybeSingle();if(rows.error)fail('Battle unavailable.',503);shared=rows.data?.metadata||null;if(shared){const b=shared.state;if(!await validShared(b))return null;if(R.timeout(b,now))await save(b);return b;}}
  const incoming=await client.from('cb_inventory_items').select('metadata').eq('item_kind','rpg_battle').contains('metadata',{participants:[user]}).in('metadata->>status',['pending','active']).gt('updated_at',new Date(now-7200000).toISOString()).limit(1).maybeSingle();if(incoming.error)fail('Battle unavailable.',503);
  if(incoming.data){shared=incoming.data.metadata;if(!await validShared(shared.state))return null;doc.pvpId=shared.state.id;await persist();if(R.timeout(shared.state,now))await save(shared.state);return shared.state;}
  const b=doc.battle||null;if(b&&R.timeout(b,now))await save(b);return b;
 }
 const result=async b=>{
  if(b?.status==='finished'&&me(b)>=0&&doc.healthBattle!==b.id){doc.state.currentHp=b.actors[me(b)].hp;doc.state.currentMp=b.actors[me(b)].mp;doc.healthBattle=b.id;await persist();}
  if(b?.status==='finished'&&b.winner===me(b)&&b.kind==='monster'&&!b.training&&b.encounterId&&b.endReason==='knockout'&&!doc.awards.some(a=>a.id===b.id)){
   const xp=Math.min(P.threshold(88)-doc.state.totalXp,P.victoryXp(doc.state.level,b.actors[1].level));C.gainXp(doc.state,xp);const encounter=doc.encounters.find(e=>e.id===b.encounterId);if(encounter)encounter.consumed=true;const drops=loot(b.actors[1].level,services.rng);doc.pendingLoot=[...(doc.pendingLoot||[]),...drops];stash(doc);doc.awards=[...doc.awards,{id:b.id,xp,drops}].slice(-100);await persist();
  }
  return {game:doc.state,pendingLoot:doc.pendingLoot||[],drops:doc.awards.find(a=>a.id===b?.id)?.drops||[],battle:b?visible(b):null,progression:progression(doc,b),defeatedEncounterId:b?.kind==='monster'&&b.status==='finished'&&b.winner===me(b)&&b.endReason==='knockout'?b.encounterId:null};
 };
 if(['drinkPotion','usePotion'].includes(input.action)){await result(await current());
  const ongoing=await read(client,user,'rpg_profile','hero');let active=ongoing?.battle?.status==='active';if(ongoing?.pvpId){const rows=await client.from('cb_inventory_items').select('metadata').eq('item_kind','rpg_battle').eq('item_id',ongoing.pvpId).contains('metadata',{participants:[user]}).maybeSingle();if(rows.error)fail('Battle unavailable.',503);active=['pending','active'].includes(rows.data?.metadata?.status);}if(active)fail('Finish your battle before using a potion.');
  const index=doc.state.items.findIndex(i=>input.action==='usePotion'?i.uid===input.uid&&C.isConsumable(i):i.defId==='health_potion');if(index<0)fail('This potion is no longer available.');
  const item=doc.state.items[index],resource=item.defId==='health_potion'?'hp':'mp',balance=resource==='hp'?health(doc.state):mana(doc.state),cap=resource==='hp'?healthCap(doc.state):manaCap(doc.state);
  if(balance>=cap)fail(resource==='hp'?'Health is already full.':'Mana is already full.');
  doc.state.items.splice(index,1);doc.state.inventoryRevision=(doc.state.inventoryRevision||0)+1;doc.state[resource==='hp'?'currentHp':'currentMp']=Math.min(cap,balance+20);stash(doc);await persist();return {game:doc.state,pendingLoot:doc.pendingLoot,restored:{resource,amount:Math.min(20,cap-balance)}};
 }
 if(input.action==='progress')return {progression:progression(doc)};
 if(method==='GET')return await result(await current());
 if(input.action==='spawn'){
  const gps=validateFix(input.gps,now);if(!gps)fail('Wait for a fresh GPS fix.');
  if(!doc.monsterSet||!(doc.monsterSet.refreshAt>now)){
   let points;const cache=doc.roadCache;
   if(cache&&now-cache.at<21600000&&distanceMeters(cache,gps)<=150)points=cache.points.filter(p=>distanceMeters(gps,p)<=600);
   if(!points?.length){try{points=await (services.roadPoints||roadPoints)(gps);}catch{points=[];}}
   if(!points.length)return {encounters:[],spawnStatus:'unavailable',refreshAt:now+5000,message:'Loading nearby roads · retrying automatically.'};
   doc.roadCache={lat:gps.lat,lng:gps.lng,at:now,points};
   doc.monsterSet={...gps,createdAt:now,refreshAt:now+1800000};doc.encounters=Layout.create(gps,doc.state.level,R.MONSTERS.filter(m=>!m.boss),now,points).map(e=>({...e,id:crypto.randomUUID(),training:false,consumed:false}));await persist();
  }
  const cache=cachedSet(),encounters=cache.encounters;
  return {encounters,spawnStatus:'ready',refreshAt:cache.refreshAt,exhausted:!encounters.length,progression:progression(doc),message:`${encounters.length} fixed road encounters · 200 m attack range · new set every 30 minutes.`};
 }
 if(input.action==='select-encounter'){
  const gps=validateFix(input.gps,now),encounter=doc.encounters.find(e=>e.id===input.target&&!e.consumed&&e.expires_at>now);
  if(!gps)fail('Use a fresh map location to select this monster.');if(!encounter)fail('This monster has expired or was already defeated.');near(gps,encounter);
  doc.selection={target:encounter.id,token:crypto.randomUUID(),expiresAt:Math.min(encounter.expires_at,now+120000)};await persist();return {selectionToken:doc.selection.token};
 }
 if(['practice','encounter','challenge'].includes(input.action)){
  if(input.action==='practice')fail('Choose a nearby monster on the map.');
  const existing=await current();if(existing?.status==='finished')await result(existing);if(existing&&['active','pending'].includes(existing.status))fail('Finish your current battle first.');
  const a=await player();if(a.hp<=0)fail('Drink a health potion in Hero Room before entering another battle.');if(!a.active.length)fail('Equip an attack skill first.');let enemy,kind='monster',encounter;
  if(input.action==='encounter'){encounter=doc.encounters.find(e=>e.id===input.target&&!e.consumed&&e.expires_at>now);if(!encounter)fail('This monster expired or has already been battled.');
   const selected=doc.selection&&doc.selection.target===input.target&&doc.selection.token===input.selectionToken&&doc.selection.expiresAt>now;
   if(!selected){const gps=validateFix(input.gps,now);if(!gps)fail('Select this monster on the map again.');near(gps,encounter);}enemy=R.monster(encounter.monsterId,encounter.level);}
  else{const p=await getPresence(user),r=await client.from('cb_inventory_items').select('user_id,metadata').eq('item_kind','rpg_presence').eq('metadata->>peerId',input.target).gt('updated_at',new Date(now-30000).toISOString()).maybeSingle();if(r.error||!r.data||r.data.user_id===user)fail('This player is no longer nearby.');near(p,r.data.metadata);enemy=await player(r.data.user_id);kind='pvp';}
  const battle=R.createBattle(a,enemy,kind,now);battle.id=crypto.randomUUID();battle.encounterId=encounter?.id||null;battle.training=false;
  if(kind==='pvp'){shared={revision:0,owner:user,participants:[user,enemy.userId],status:battle.status,state:battle};await insert(client,user,'rpg_battle',battle.id,shared);doc.pvpId=battle.id;await persist();}
  else{doc.pvpId=null;doc.selection=null;doc.battle=battle;await persist();}
  return await result(battle);
 }
 const b=await current();if(!b)fail('No current battle.',404);const side=me(b);if(side<0)fail('This is not your battle.',403);
 if(input.action==='leave'){
  if(['active','pending'].includes(b.status)){if(b.status==='pending'){b.status='cancelled';b.winner=null;b.challenge=null;}else R.endBattle(b,1-side,'forfeit',now);R.note(b,`${b.actors[side].name} left the encounter.`);await save(b);}
  const settled=await result(b);if(doc.pvpId){doc.pvpId=null;await persist();}else{doc.battle=null;await persist();}return {battle:null,report:b.status==='finished'?visible(b):null,progression:settled.progression};
 }
 if(input.version!==b.version)fail('Battle changed. Refresh and try again.',409);
 if(b.status==='pending'){
  if(input.action==='decline'){b.status='cancelled';R.note(b,'Challenge declined.');}
  else if(input.action==='accept'&&side===1){b.actors[1]=await player();if(b.actors[1].hp<=0)fail('Drink a health potion before accepting.');if(!b.actors[1].active.length)fail('Equip a skill first.');b.status='active';b.startedAt=now;b.battleEndsAt=now+300000;b.deadline=now+90000;R.note(b,'Challenge accepted. Challenger takes the first turn.');}
  else fail('Waiting for the other player to accept.');await save(b);return await result(b);
 }
 if(b.status!=='active')fail('This battle has ended.',409);
 if(b.turn!==side)fail('Wait for your turn.',409);
 const a=b.actors[side];let solvedId=null;
 if(input.action==='harvest'){
  if(b.challenge)fail('Finish or abandon the current challenge first.',409);
  if(!['ap','mp'].includes(input.resource))fail('Choose AP or mana.');
  if(a[input.resource]>=a[input.resource==='ap'?'maxAp':'maxMp'])fail('That resource is already full.');
  if(input.resource==='ap'){
   const boss=b.actors[1-side].boss,elo=boss?1480+rand(621):750+rand(731);b.challenge={kind:'ap',side,elo,fen:new Chess().fen(),moves:[],clocks:[60000,60000],clockAt:now};
  }else{
   const history=doc.history.map(puzzle_id=>({puzzle_id})),seen=new Set(history.map(h=>h.puzzle_id)),pool=b.actors[1-side].boss?'hard':'regular',eligible=puzzles.filter(p=>p.pool===pool&&!seen.has(p.id)),p=eligible[rand(eligible.length)];if(!p)fail('Puzzle pool unavailable. Try again later.',503);
   const chess=new Chess(p.fen);chess.move(uci(p.moves[0]));b.challenge={kind:'mp',side,puzzleId:p.id,pool,rating:p.rating,fen:chess.fen(),moves:[],step:1};
  }
  b.deadline=now+(b.kind==='pvp'?900000:1800000);R.note(b,`${a.name} chose ${input.resource.toUpperCase()} harvest. No other action this turn.`);
 }else if(input.action==='puzzleMove'){
  const c=b.challenge;if(!c||c.kind!=='mp'||c.side!==side||typeof input.move!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(input.move))fail('Invalid puzzle move.');
  const p=puzzles.find(p=>p.id===c.puzzleId),chess=new Chess(c.fen);let legal;try{legal=chess.move(uci(input.move));}catch{fail('That move is not legal.');}
  if(input.move!==p.moves[c.step]&&!chess.isCheckmate()){
   R.harvestResult(b,side,'mp',false,'Puzzle missed');R.note(b,'Puzzle missed. No mana gained.');R.finishTurn(b,now);
  }else{
   c.moves.push(input.move);c.step++;
   if(c.step>=p.moves.length||chess.isCheckmate()){R.harvestResult(b,side,'mp',true,'Puzzle solved perfectly');solvedId=p.id;R.note(b,`${a.name} solved the puzzle perfectly · +20 MP (up to cap).`);R.finishTurn(b,now);}
   else{const reply=p.moves[c.step++];chess.move(uci(reply));c.moves.push(reply);c.fen=chess.fen();}
  }
 }else if(['chessFinish','chessSave'].includes(input.action)){
  const c=b.challenge;if(!c||c.kind!=='ap'||c.side!==side||!Array.isArray(input.moves)||input.moves.length>1000||input.moves.some(m=>typeof m!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)))fail('Invalid chess game.');
  const chess=new Chess();try{for(const m of input.moves)chess.move(uci(m));}catch{fail('Invalid chess move history.');}
  if(c.moves.some((m,i)=>input.moves[i]!==m))fail('Chess history cannot be rewritten.');
  if(c.clocks){if(input.moves.length!==c.moves.length+1)fail('Submit one chess move at a time.');const turn=c.moves.length%2;c.clocks[turn]=Math.max(0,c.clocks[turn]-(now-c.clockAt));c.clockAt=now;}
  if(input.action==='chessSave'){if(chess.isGameOver())fail('Submit the completed game.');c.moves=input.moves.slice();c.fen=new Chess().fen();await save(b);return await result(b);}
  if(!chess.isGameOver())fail('Finish the chess game first.');
  if(chess.isCheckmate()&&chess.turn()==='b'){R.harvestResult(b,side,'ap',true,'Chess victory');R.note(b,`${a.name} won the chess game · +20 AP (up to cap).`);}else{R.harvestResult(b,side,'ap',false,chess.isCheckmate()?'Chess game lost':'Chess game drawn');R.note(b,'Chess game lost or drawn. No AP gained.');}
  R.finishTurn(b,now);
 }else if(input.action==='abandon'){
  if(!b.challenge)fail('No harvest challenge in progress.');R.harvestResult(b,side,b.challenge.kind,false,'Harvest abandoned');R.note(b,`${a.name} abandoned the challenge. No resource gained.`);R.finishTurn(b,now);
 }else{
  if(b.challenge)fail('Finish or abandon your harvest first.');
  if(input.action==='attack')R.attack(b,side,input.skill,now);
  else if(input.action==='defend')R.defend(b,side);
  else fail('Unknown battle action.');
  R.finishTurn(b,now);
 }
 await save(b,solvedId);
 return await result(b);
}
