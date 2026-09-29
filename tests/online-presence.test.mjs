import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const start=source.indexOf('async function publicOnlineUsers(');
const end=source.indexOf('\nasync function activeMatchFor(',start);
assert.ok(start>=0&&end>start);
const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

test('Online directory reads recent presence without a HEAD schema probe',async()=>{
  const now=Date.now();
  const rows=[
    {user_id:'current',seen_at:new Date(now-4000).toISOString()},
    {user_id:'stale',seen_at:new Date(0).toISOString()},
  ];
  let presenceRequests=0;
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
          presenceRequests++;
          assert.equal(this.column,'user_id,seen_at');
          assert.equal(this.options.head,undefined);
        }
        const selected=rows.filter(row=>(!this.field||Date.parse(row[this.field])>Date.parse(this.value))&&(!this.ids||this.ids.includes(row.user_id)));
        return Promise.resolve({data:selected,error:null,count:selected.length}).then(resolve,reject);
      },
    };return query;
  }};
  const playerMap=async(_client,ids)=>new Map(ids.map(id=>[id,{user_id:id,cbr:88}]));
  const run=new Function('client','livePresenceTimestampField','now','fail','playerMap','console',
    `${compiled};return publicOnlineUsers(client);`);
  const result=await run(client,async()=> 'seen_at',()=>now,(_code,message)=>{throw Error(message)},playerMap,console);
  assert.deepEqual(result.users.map(user=>user.user_id),['current']);
  assert.equal(result.count,1);
  assert.equal(presenceRequests,1);
});
