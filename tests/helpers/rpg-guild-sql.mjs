import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import C from '../../api/_rpg/src/inventory-core.js';
import {makeHero} from '../../api/_rpg/store.mjs';

export async function fixture(){
 const db=new PGlite(),users=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()],guild=crypto.randomUUID();
 await db.exec(`create role anon;create role authenticated;create role service_role;create table cb_profiles(user_id uuid primary key,gold_points integer not null default 0);create table cb_gold_ledger(id text primary key,user_id uuid,delta integer,kind text,reference_id uuid);create table cb_guilds(id uuid primary key,name text);create table cb_guild_members(user_id uuid primary key,guild_id uuid references cb_guilds);create table cb_inventory_items(user_id uuid,item_kind text,item_id text,metadata jsonb not null,updated_at timestamptz,primary key(user_id,item_kind,item_id));grant all on cb_profiles,cb_guilds,cb_guild_members,cb_inventory_items to service_role;`);
 await db.exec(fs.readFileSync('supabase/rpg-guild-stash.sql','utf8'));
 await db.query('insert into cb_guilds values($1,$2)',[guild,'Test Guild']);
 const docs=users.map((user,i)=>{const doc=makeHero({heroId:i===1?'mage':'rogue',name:'Player '+i,skill:'punch'});doc.recoveryGranted=true;doc.feedCursor={registered:true,level:1};return doc;});
 for(let i=0;i<users.length;i++){await db.query('insert into cb_profiles(user_id) values($1)',[users[i]]);await db.query("insert into cb_inventory_items values($1,'rpg_profile','hero',$2,now())",[users[i],JSON.stringify(docs[i])]);if(i<2)await db.query('insert into cb_guild_members values($1,$2)',[users[i],guild]);}
 const client={from(table){const filters=[],args=[];let fields='*';return {select(value){fields=value;return this;},eq(key,value){args.push(value);filters.push('"'+key+'"=$'+args.length);return this;},async maybeSingle(){try{const result=await db.query('select '+fields+' from '+table+(filters.length?' where '+filters.join(' and '):'')+' limit 1',args);return {data:result.rows[0]||null,error:null};}catch(e){return {data:null,error:{message:e.message,code:e.code}};}}};},async rpc(name,args){try{if(name==='cb_rpg_guild_cbg')return {data:(await db.query('select cb_rpg_guild_cbg($1,$2,$3,$4,$5,$6) as result',[args.p_user_id,args.p_guild_id,args.p_request_id,args.p_direction,args.p_amount,args.p_generation])).rows[0].result,error:null};const values=[args.p_user_id,args.p_guild_id,args.p_request_id,args.p_revision,args.p_stash_revision,JSON.stringify(args.p_document),JSON.stringify(args.p_items),args.p_item_uid,args.p_from,args.p_to];return {data:(await db.query('select cb_rpg_guild_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',values)).rows[0].result,error:null};}catch(e){return {data:null,error:{message:e.message,code:e.code}};}}};
 const load=async i=>(await db.query("select metadata from cb_inventory_items where user_id=$1 and item_kind='rpg_profile'",[users[i]])).rows[0].metadata;
 const item={uid:crypto.randomUUID(),defId:'iron_dagger_v1',rotation:0,rotated:false,...C.rollItem(C.itemMap.iron_dagger_v1,1,()=>0,{rarity:'rare',requiredLevel:1})};C.place(docs[0].state,item,'bag',0,0);
 await db.query("update cb_inventory_items set metadata=$1 where user_id=$2",[JSON.stringify(docs[0]),users[0]]);
 const request=(doc,from,to,revision=0)=>({action:'guildTransfer',guildId:guild,uid:item.uid,from,to,x:0,y:0,rotation:0,requestId:crypto.randomUUID(),stashRevision:revision,inventoryRevision:doc.state.inventoryRevision||0});
 return {db,client,users,guild,docs,item,load,request,close:()=>db.close()};
}
