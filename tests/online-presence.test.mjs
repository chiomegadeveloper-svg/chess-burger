import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const start=source.indexOf('let cachedPresenceTimestampField:');
const end=source.indexOf('\nasync function activeMatchFor(',start);
assert.ok(start>=0&&end>start);
const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

test('Online directory uses a legacy timestamp when seen_at is absent, without HEAD',async()=>{
  const now=Date.now();
  const rows=[
    {user_id:'current',last_seen_at:new Date(now-4000).toISOString()},
    {user_id:'stale',last_seen_at:new Date(0).toISOString()},
  ];
  const presenceColumns=[];
  const client={from(table){
    const query={column:'*',options:{},field:'',value:null,ids:null,
      select(column,options={}){this.column=column;this.options=options;return this},
      gt(field,value){this.field=field;this.value=value;return this},
      order(){return this},limit(){return this},
      in(field,ids){this.ids=ids;return this},
      eq(){return this},
      then(resolve,reject){
        if(table==='cb_matches')return Promise.resolve({data:[],error:null}).then(resolve,reject);
        if(table==='cb_live_presence'){
          presenceColumns.push(this.column);
          assert.equal(this.options.head,undefined);
          if(this.column==='seen_at')return Promise.resolve({data:null,error:{message:'column cb_live_presence.seen_at does not exist',code:'42703'}}).then(resolve,reject);
        }
        const selected=rows.filter(row=>(!this.field||Date.parse(row[this.field])>Date.parse(this.value))&&(!this.ids||this.ids.includes(row.user_id)));
        return Promise.resolve({data:selected,error:null,count:selected.length}).then(resolve,reject);
      },
    };return query;
  }};
  const playerMap=async(_client,ids)=>new Map(ids.map(id=>[id,{user_id:id,cbr:88}]));
  const run=new Function('client','now','fail','playerMap','console',
    `${compiled};return publicOnlineUsers(client);`);
  const result=await run(client,()=>now,(_code,message)=>{throw Error(message)},playerMap,console);
  assert.deepEqual(result.users.map(user=>user.user_id),['current']);
  assert.equal(result.count,1);
  assert.deepEqual(presenceColumns,['seen_at','last_seen_at','user_id,last_seen_at']);
});
