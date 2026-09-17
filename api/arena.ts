import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

type Req = { method?: string; query?: Record<string, string | string[] | undefined>; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };
// The Supabase schema is managed in SQL migrations, so the server route uses
// runtime checks instead of a generated TypeScript database declaration.
type Db = any;

const TIME: Record<string, { seconds: number; increment: number; group: string; label: string }> = {
  '1+0': { seconds: 60, increment: 0, group: 'Bullet', label: '1 min' }, '1+1': { seconds: 60, increment: 1, group: 'Bullet', label: '1 + 1' }, '2+1': { seconds: 120, increment: 1, group: 'Bullet', label: '2 + 1' },
  '3+0': { seconds: 180, increment: 0, group: 'Blitz', label: '3 min' }, '3+2': { seconds: 180, increment: 2, group: 'Blitz', label: '3 + 2' }, '5+0': { seconds: 300, increment: 0, group: 'Blitz', label: '5 min' },
  '10+0': { seconds: 600, increment: 0, group: 'Rapid', label: '10 min' }, '10+5': { seconds: 600, increment: 5, group: 'Rapid', label: '10 + 5' }, '15+10': { seconds: 900, increment: 10, group: 'Rapid', label: '15 + 10' },
};
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const now = () => Date.now();
const tc = (id: string) => TIME[id] ?? fail(400, 'Choose a valid time control.');
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32] ?? 'A').join('');
const one = <T>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) fail(500, r.error.message); if (!r.data) fail(404, 'This game is no longer available.'); return r.data as T; };

function db(): Db {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail(503, 'The Vercel game service needs its Supabase server key.');
  return createClient(url as string, key as string, { auth: { autoRefreshToken: false, persistSession: false } }) as Db;
}
async function signedIn(client: Db, req: Req) {
  const header = req.headers.authorization;
  const token = (Array.isArray(header) ? header[0] : header || '').replace(/^Bearer\s+/i, '');
  if (!token) fail(401, 'Please sign in again.');
  const account = await client.auth.getUser(token);
  const user = account.data.user;
  if (account.error || !user) fail(401, 'Please sign in again.');
  const profile = one<any>(await client.from('cb_profiles').select('*').eq('user_id', user.id).maybeSingle());
  if (!profile.avatar_url?.trim()) fail(403, 'Add and save a profile picture to unlock Chess Burger.');
  return { id: user.id, profile };
}
async function playerMap(client: Db, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, any>();
  const r = await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak').in('user_id', unique);
  if (r.error) fail(500, r.error.message);
  return new Map((r.data ?? []).map((p: any) => [p.user_id, p]));
}
async function matchView(client: Db, row: any) {
  const players = await playerMap(client, [row.white_id, row.black_id]);
  return { ...row, created_at: Date.parse(row.created_at), last_tick: Number(row.last_tick), white_ms: Number(row.white_ms), black_ms: Number(row.black_ms), version: Number(row.version), white_cbr: Number(row.white_cbr), black_cbr: Number(row.black_cbr), rating_applied: Number(row.rating_applied), reactions: JSON.stringify(row.reactions ?? []), white: players.get(row.white_id), black: row.black_id ? players.get(row.black_id) : null, server_now: now() };
}
async function readMatch(client: Db, id: string): Promise<any> { return one<any>(await client.from('cb_matches').select('*').eq('id', id).maybeSingle()); }
const participant = (match: any, id: string) => [match.white_id, match.black_id, match.invite_to].filter(Boolean).includes(id);
function result(game: Chess): 'white' | 'black' | 'draw' | null { return game.isCheckmate() ? game.turn() === 'w' ? 'black' : 'white' : game.isDraw() ? 'draw' : null; }

async function settle(client: Db, match: any) {
  if (match.status !== 'finished' || match.rating_applied || !match.black_id || !match.result) return;
  const people = await playerMap(client, [match.white_id, match.black_id]);
  const white = people.get(match.white_id), black = people.get(match.black_id); if (!white || !black) return;
  for (const [p, side, rival] of [[white, 'white', black], [black, 'black', white]] as const) {
    const won = match.result === side, lost = match.result !== 'draw' && !won;
    const delta = won ? 8 + (p.win_streak + 1 >= 4 ? 2 : 0) + (Math.abs(p.cbr - rival.cbr) > 10 ? Math.floor(rival.cbr * .1) : 0) : lost ? -Math.min(10, p.cbr) : 0;
    const gold = won ? 5 + (p.win_streak >= 5 ? 2 : 0) : lost ? 1 : 0;
    const updated = await client.from('cb_profiles').update({ cbr: Math.max(0, p.cbr + delta), gold_points: p.gold_points + gold, wins: p.wins + (won ? 1 : 0), losses: p.losses + (lost ? 1 : 0), win_streak: won ? p.win_streak + 1 : 0 }).eq('user_id', p.user_id);
    if (updated.error) fail(500, updated.error.message);
    if (won) { const event = await client.from('cb_feed').insert({ user_id: p.user_id, kind: 'win', display_name: p.display_name, content: `won a ${tc(match.control).group.toLowerCase()} match.`, cbr_delta: delta, gold_delta: gold }); if (event.error) fail(500, event.error.message); }
  }
  const rated = await client.from('cb_matches').update({ rating_applied: 1, updated_at: new Date().toISOString() }).eq('id', match.id).eq('rating_applied', 0);
  if (rated.error) fail(500, rated.error.message);
}
async function publicFeed(client: Db) {
  const list = await client.from('cb_feed').select('*').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('created_at', { ascending: false }).limit(70);
  if (list.error) fail(500, list.error.message);
  const people = await playerMap(client, (list.data ?? []).map((e: any) => e.user_id));
  return { events: (list.data ?? []).map((e: any) => ({ id: e.kind === 'challenge' && e.challenge_match_id ? `challenge:${e.challenge_match_id}` : e.id, user_id: e.user_id, kind: e.kind, display_name: e.kind === 'announcement' ? 'Chess Burger' : e.display_name, content: e.content, image_url: e.image_url ?? '', expires_at: e.expires_at, cbr_delta: e.cbr_delta ?? 0, gold_delta: e.gold_delta ?? 0, heart_count: e.heart_count ?? 0, created_at: e.created_at, avatar_url: e.kind === 'announcement' ? '/cburger_logo.png' : people.get(e.user_id)?.avatar_url ?? '', cbr: people.get(e.user_id)?.cbr ?? 88 })) };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const client = db(), body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const action = String(req.method === 'GET' ? req.query?.action ?? '' : body.action ?? '');
    if (req.method === 'GET') { if (action === 'feed') return res.status(200).json(await publicFeed(client)); fail(404, 'Unknown game request.'); }
    const account = await signedIn(client, req);
    if (action === 'search-players') {
      const query = String(body.query ?? '').trim().replace(/^@/, '').toLowerCase(); if (query.length < 2) return res.status(200).json({ players: [] });
      const r = await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak').neq('user_id', account.id).or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(10);
      if (r.error) fail(500, r.error.message); return res.status(200).json({ players: r.data ?? [] });
    }
    if (action === 'room') {
      const control = String(body.control ?? ''), clock = tc(control), target = typeof body.target === 'string' ? body.target : null, publicChallenge = body.publicChallenge === true;
      if (publicChallenge && target) fail(400, 'Choose one challenge audience.');
      const active = await client.from('cb_matches').select('id').eq('status', 'active').or(`white_id.eq.${account.id},black_id.eq.${account.id}`).limit(1); if (active.error) fail(500, active.error.message); if (active.data?.length) fail(409, 'Finish your current match first.');
      const match = one<any>(await client.from('cb_matches').insert({ host_id: account.id, white_id: account.id, invite_to: target, code: code(), control, white_ms: clock.seconds * 1000, black_ms: clock.seconds * 1000, last_tick: now(), white_cbr: account.profile.cbr }).select('*').single());
      if (publicChallenge) { const event = await client.from('cb_feed').insert({ user_id: account.id, kind: 'challenge', display_name: account.profile.display_name, content: `is looking for a ${clock.group.toLowerCase()} challenge · ${clock.label}.`, challenge_match_id: match.id, expires_at: new Date(now() + 120000).toISOString() }); if (event.error) { await client.from('cb_matches').delete().eq('id', match.id); fail(500, event.error.message); } }
      return res.status(200).json({ match: await matchView(client, match) });
    }
    if (action === 'accept-challenge') {
      const id = String(body.id ?? ''), match = await readMatch(client, id); if (match.white_id === account.id) fail(400, 'You cannot accept your own challenge.');
      const event = await client.from('cb_feed').select('id').eq('challenge_match_id', id).eq('kind', 'challenge').gt('expires_at', new Date().toISOString()).maybeSingle(); if (event.error) fail(500, event.error.message); if (!event.data) fail(404, 'This challenge has expired or was accepted.');
      const changed = await client.from('cb_matches').update({ black_id: account.id, black_cbr: account.profile.cbr, status: 'active', version: 1, last_tick: now(), updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'waiting').is('black_id', null).select('*').maybeSingle(); if (changed.error) fail(500, changed.error.message); if (!changed.data) fail(409, 'This challenge was already accepted.');
      await client.from('cb_feed').update({ expires_at: new Date().toISOString() }).eq('id', event.data.id); return res.status(200).json({ match: await matchView(client, changed.data) });
    }
    if (action === 'match') { const match = await readMatch(client, String(body.id ?? '')); if (!participant(match, account.id)) fail(403, 'This room is private.'); return res.status(200).json({ match: await matchView(client, match) }); }
    if (action === 'state') { const r = await client.from('cb_matches').select('*').eq('status', 'active').or(`white_id.eq.${account.id},black_id.eq.${account.id}`).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (r.error) fail(500, r.error.message); return res.status(200).json({ match: r.data ? await matchView(client, r.data) : null, completed: null, invites: [], fair_play: { total_aborts: 0, cooldown_until: 0 } }); }
    if (action === 'cancel-room') { const r = await client.from('cb_matches').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', String(body.id ?? '')).eq('host_id', account.id).eq('status', 'waiting'); if (r.error) fail(500, r.error.message); return res.status(200).json({ ok: true }); }
    if (action === 'heart') { const id = String(body.id ?? ''); if (id.startsWith('challenge:')) return res.status(200).json({ ok: true }); const r = body.liked === true ? await client.from('cb_feed_reactions').upsert({ feed_id: id, user_id: account.id }, { onConflict: 'feed_id,user_id' }) : await client.from('cb_feed_reactions').delete().eq('feed_id', id).eq('user_id', account.id); if (r.error) fail(500, r.error.message); return res.status(200).json({ ok: true }); }
    if (action === 'hearts') { const r = await client.from('cb_feed_reactions').select('feed_id').eq('user_id', account.id); if (r.error) fail(500, r.error.message); return res.status(200).json({ ids: (r.data ?? []).map((row: any) => row.feed_id) }); }
    if (action === 'move' || action === 'resign' || action === 'abort') {
      const match = await readMatch(client, String(body.id ?? '')); if (![match.white_id, match.black_id].includes(account.id)) fail(403, 'Only players may update this match.'); if (Number(body.version) !== Number(match.version)) fail(409, 'The board changed. Please try again.');
      let patch: Record<string, unknown> = { version: Number(match.version) + 1, last_tick: now(), updated_at: new Date().toISOString() };
      if (action === 'abort') patch = { ...patch, status: 'cancelled', result: null }; else if (action === 'resign') patch = { ...patch, status: 'finished', result: account.id === match.white_id ? 'black' : 'white' }; else { if (match.status !== 'active') fail(409, 'This match is no longer active.'); const game = new Chess(); if (match.pgn) game.loadPgn(match.pgn); if ((game.turn() === 'w' ? match.white_id : match.black_id) !== account.id) fail(409, 'Wait for your opponent.'); try { game.move(body.move); } catch { fail(400, 'That move is not legal.'); } const ended = result(game); patch = { ...patch, pgn: game.pgn(), ...(ended ? { status: 'finished', result: ended } : {}) }; }
      const changed = await client.from('cb_matches').update(patch).eq('id', match.id).eq('version', match.version).select('*').maybeSingle(); if (changed.error) fail(500, changed.error.message); if (!changed.data) fail(409, 'The board changed. Please try again.'); await settle(client, changed.data); return res.status(200).json({ match: await matchView(client, await readMatch(client, match.id)), fair_play: { total_aborts: 0, cooldown_until: 0 } });
    }
    if (action === 'react') { const match = await readMatch(client, String(body.id ?? '')); if (!participant(match, account.id)) fail(403, 'This room is private.'); const reactions = Array.isArray(match.reactions) ? match.reactions : []; reactions.push({ emote: String(body.emote ?? '').slice(0, 8), at: now() }); const changed = one<any>(await client.from('cb_matches').update({ reactions, version: Number(match.version) + 1, updated_at: new Date().toISOString() }).eq('id', match.id).eq('version', match.version).select('*').maybeSingle()); return res.status(200).json({ match: await matchView(client, changed) }); }
    fail(404, 'This game action is not available during the migration.');
  } catch (error) { const known = error instanceof ApiError ? error : new ApiError(500, 'The game service could not complete this request. Please try again.'); if (!(error instanceof ApiError)) console.error('Chess Burger arena error', error); return res.status(known.status).json({ error: known.message }); }
}
