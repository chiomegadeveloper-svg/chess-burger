import { test } from 'node:test';
import assert from 'node:assert/strict';
import swiss from '../api/swiss.ts';

function response() {
  const reply={code:200,body:null,headers:{},setHeader(name,value){this.headers[name]=value},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  return reply;
}

test('Swiss pairing endpoint rejects unsupported methods and unauthenticated requests before contacting the provider',async()=>{
  const get=response();
  await swiss({method:'GET',headers:{}},get);
  assert.equal(get.code,405);
  const unauthenticated=response();
  await swiss({method:'POST',headers:{},body:{trf:'001 test'}},unauthenticated);
  assert.equal(unauthenticated.code,401);
  assert.equal(unauthenticated.headers['Cache-Control'],'no-store');
});
