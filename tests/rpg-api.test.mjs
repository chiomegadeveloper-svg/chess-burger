import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/_rpg/handler.ts';
const uid='11111111-1111-4111-8111-111111111111';
test('live RPG handler checks origin and session, scopes account reads, and verifies production storage readiness',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY,calls=[];
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
 globalThis.fetch=async(url,options={})=>{const text=String(url);calls.push(text);let data=[];if(text.includes('/auth/v1/user'))data={id:uid,role:'authenticated',aud:'authenticated'};if(text.includes('/cb_profiles'))data={agreement_version:'accepted',avatar_url:'https://test/avatar.webp'};return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});};
 const request=async(req)=>{let status,body;const response={setHeader(){},status(value){status=value;return this;},json(value){body=value;return this;}};await handler({method:'POST',headers:{host:'chessburger.site',origin:'https://chessburger.site'},body:{action:'init'},...req},response);return {status,body};};
 try{
  assert.equal((await request({})).status,401);
  assert.equal((await request({headers:{host:'chessburger.site',origin:'https://evil.test',authorization:'Bearer test'}})).status,403);
  assert.equal((await request({method:'PUT'})).status,405);
  assert.equal((await request({headers:{host:'chessburger.site',origin:'https://chessburger.site',authorization:'Bearer test'},body:{action:'owner_search',query:'tester'}})).status,403);
  const ready=await request({method:'GET',query:{health:'1'}});assert.equal(ready.status,200);assert.equal(ready.body.ready,true);
  const init=await request({headers:{host:'chessburger.site',origin:'https://chessburger.site',authorization:'Bearer test'}});assert.equal(init.status,200);assert.equal(init.body.game,null);
  assert.ok(calls.some(url=>url.includes('user_id=eq.'+uid)&&url.includes('item_kind=eq.rpg_profile')));
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});
