import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/arena.ts';

const uid = '11111111-1111-4111-8111-111111111111';
const profile = { user_id: uid, display_name: 'Test player', avatar_url: 'https://example.com/avatar.webp', cbr: 88 };
const match = { id: '22222222-2222-4222-8222-222222222222', white_id: uid, status: 'waiting', control: '10+0', version: 0, created_at: new Date().toISOString(), last_tick: new Date().toISOString() };

async function request(publicChallenge, rejectFeed = false, action = 'room') {
  const original = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
  const writes = [], queries = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method ?? 'GET';
    queries.push({ path: url.pathname, method, query: url.searchParams.toString() });
    let body;
    let status = 200;
    if (url.pathname === '/auth/v1/user') body = { id: uid };
    else if (url.pathname.endsWith('/cb_profiles')) body = url.searchParams.has('user_id') && url.searchParams.get('user_id').startsWith('eq.') ? profile : [profile];
    else if (url.pathname.endsWith('/cb_matches')) {
      if (method === 'POST') { writes.push(JSON.parse(init.body)); body = match; }
      else if (method === 'PATCH') { writes.push(JSON.parse(init.body)); body = { id: match.id }; }
      else if (method === 'DELETE') body = null;
      else body = [];
    } else if (url.pathname.endsWith('/cb_feed')) {
      writes.push(JSON.parse(init.body));
      status = method === 'POST' ? (rejectFeed ? 400 : 201) : 200;
      body = rejectFeed ? { message: 'challenge kind constraint rejected', code: '23514' } : null;
    } else throw Error('Unexpected URL: ' + url.pathname);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const res = { code: 200, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-user-token' }, body: { action, id: match.id, control: '10+0', publicChallenge } }, res);
    return { ...res, writes, queries };
  } finally {
    globalThis.fetch = original;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
}

test('public challenge inserts linked feed event before confirming publication', async () => {
  const r = await request(true);
  assert.equal(r.code, 200);
  assert.equal(r.body.challengePublished, true);
  assert.equal(r.writes[0].status, 'waiting');
  assert.equal(r.writes[1].kind, 'challenge');
  assert.equal(r.writes[1].challenge_match_id, match.id);
});
test('private room is never reported as a public challenge', async () => {
  const r = await request(false);
  assert.equal(r.code, 200);
  assert.equal(r.body.challengePublished, false);
  assert.equal(r.writes.length, 1);
});
test('failed feed insert cannot return a publication success', async () => {
  const r = await request(true, true);
  assert.equal(r.code, 500);
  assert.equal(r.body.challengePublished, undefined);
  assert.match(r.body.error, /constraint/);
});
test('recipient decline cancels the waiting invitation and expires its feed entry', async () => {
  const r = await request(false, false, 'decline-room');
  assert.equal(r.code, 200);
  assert.equal(r.writes[0].status, 'cancelled');
  assert.ok(r.queries.some(q => q.path.endsWith('/cb_matches') && q.method === 'PATCH' && q.query.includes('invite_to=eq.' + uid)));
  assert.ok(r.writes[1].expires_at);
});
