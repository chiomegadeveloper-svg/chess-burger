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
const gpsCutoff = () => new Date(now() - 45_000).toISOString();

async function publicRanks(client: Db) {
  const r = await client.from('cb_profiles')
    .select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak')
    .order('cbr', { ascending: false }).order('wins', { ascending: false }).order('user_id', { ascending: true }).limit(10);
  if (r.error) fail(500, r.error.message);
  return { players: r.data ?? [] };
}
async function playerRank(client: Db, profile: any) {
  const cbr = Number(profile.cbr ?? 0), wins = Number(profile.wins ?? 0);
  const ahead = [`cbr.gt.${cbr}`, `and(cbr.eq.${cbr},wins.gt.${wins})`, `and(cbr.eq.${cbr},wins.eq.${wins},user_id.lt.${profile.user_id})`].join(',');
  const r = await client.from('cb_profiles').select('user_id', { count: 'exact', head: true }).or(ahead);
  if (r.error) fail(500, r.error.message);
  return (r.count ?? 0) + 1;
}
function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(12_742_000 * Math.asin(Math.sqrt(h)));
}
async function savePresence(client: Db, account: any, body: Record<string, any>) {
  if (!body.gps) {
    const removed = await client.from('cb_gps_presence').delete().eq('user_id', account.id);
    if (removed.error) fail(500, 'GPS presence is not configured. Run the current GPS migration in Supabase.');
    return { ok: true };
  }
  const lat = Number(body.lat), lng = Number(body.lng), accuracy = Math.min(500, Math.max(0, Number(body.accuracy ?? 0)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) fail(400, 'The GPS reading is invalid.');
  const saved = await client.from('cb_gps_presence').upsert({ user_id: account.id, lat, lng, accuracy, seen_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (saved.error) fail(500, 'GPS presence is not configured. Run the current GPS migration in Supabase.');
  return { ok: true };
}
async function nearbyPlayers(client: Db, account: any) {
  const own = await client.from('cb_gps_presence').select('*').eq('user_id', account.id).gt('seen_at', gpsCutoff()).maybeSingle();
  if (own.error) fail(500, 'GPS presence is not configured. Run the current GPS migration in Supabase.');
  if (!own.data) return { players: [], territories: [] };
  const presence = await client.from('cb_gps_presence').select('*').neq('user_id', account.id).gt('seen_at', gpsCutoff());
  if (presence.error) fail(500, presence.error.message);
  const people = await playerMap(client, (presence.data ?? []).map((p: any) => p.user_id));
  const players = (presence.data ?? []).map((p: any) => {
    const person = people.get(p.user_id);
    const distance = metres(Number(own.data.lat), Number(own.data.lng), Number(p.lat), Number(p.lng));
    return person ? { ...person, lat: Number(p.lat), lng: Number(p.lng), distance } : null;
  }).filter((p: any) => p && p.distance <= 10_000).sort((a: any, b: any) => a.distance - b.distance);
  return { players, territories: [] };
}
const tc = (id: string) => TIME[id] ?? fail(400, 'Choose a valid time control.');
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32] ?? 'A').join('');
const one = <T>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) fail(500, r.error.message); if (!r.data) fail(404, 'This game is no longer available.'); return r.data as T; };

function db(): Db {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url) fail(503, 'The Vercel game service is missing NEXT_PUBLIC_SUPABASE_URL (or VITE_SUPABASE_URL).');
  if (!key) fail(503, 'The Vercel game service is missing SUPABASE_SERVICE_ROLE_KEY.');
  // Supabase sends this value in HTTP headers; reject accidentally pasted
  // instructions or Unicode characters without ever logging the credential.
  if (!/^[\x21-\x7e]+$/.test(key)) fail(503, 'The Vercel Supabase server key contains invalid characters. Replace it with the exact key from Supabase, then redeploy Preview.');
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
  return { ...row, created_at: Date.parse(row.created_at), last_tick: Date.parse(row.last_tick), white_ms: Number(row.white_ms), black_ms: Number(row.black_ms), version: Number(row.version), white_cbr: Number(row.white_cbr), black_cbr: Number(row.black_cbr), rating_applied: row.rating_applied ? 1 : 0, reactions: JSON.stringify(Array.isArray(row.reactions) ? row.reactions : []), white: players.get(row.white_id), black: row.black_id ? players.get(row.black_id) : null, server_now: now() };
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
  const rated = await client.from('cb_matches').update({ rating_applied: true }).eq('id', match.id).eq('rating_applied', false);
  if (rated.error) fail(500, rated.error.message);
}
async function publicFeed(client: Db) {
  const list = await client.from('cb_feed').select('*').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('created_at', { ascending: false }).limit(70);
  if (list.error) fail(500, list.error.message);
  const challengeIds = (list.data ?? []).filter((e: any) => e.kind === 'challenge' && e.challenge_match_id).map((e: any) => e.challenge_match_id);
  const activeChallenges = new Set<string>();
  if (challengeIds.length) {
    const waiting = await client.from('cb_matches').select('id').in('id', challengeIds).eq('status', 'waiting').is('invite_to', null).gt('created_at', new Date(now() - 120000).toISOString());
    if (waiting.error) fail(500, waiting.error.message);
    for (const m of waiting.data ?? []) activeChallenges.add(m.id);
  }
  const people = await playerMap(client, (list.data ?? []).map((e: any) => e.user_id));
  return { events: (list.data ?? []).filter((e: any) => e.kind !== 'challenge' || activeChallenges.has(e.challenge_match_id)).map((e: any) => ({ id: e.kind === 'challenge' && e.challenge_match_id ? `challenge:${e.challenge_match_id}` : e.id, user_id: e.user_id, kind: e.kind, display_name: e.kind === 'announcement' ? 'Chess Burger' : e.display_name, content: e.content, image_url: e.image_url ?? '', expires_at: e.expires_at, cbr_delta: e.cbr_delta ?? 0, gold_delta: e.gold_delta ?? 0, heart_count: e.heart_count ?? 0, created_at: e.created_at, avatar_url: e.kind === 'announcement' ? '/cburger_logo.png' : people.get(e.user_id)?.avatar_url ?? '', cbr: people.get(e.user_id)?.cbr ?? 88 })) };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  let action = '';
  try {
    const client = db(), body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    action = String(req.method === 'GET' ? req.query?.action ?? '' : body.action ?? '');
    console.info('arena.request', { action, method: req.method });
    if (req.method === 'GET') {
      if (action === 'feed') return res.status(200).json(await publicFeed(client));
      if (action === 'ranks') return res.status(200).json(await publicRanks(client));
      fail(404, 'Unknown game request.');
    }
    const account = await signedIn(client, req);
    // The app refreshes this on sign-in to obtain the authoritative profile.
    // Keep it as a first-class migration action rather than falling through to
    // a 404 on every page load.
    if (action === 'me') return res.status(200).json({ profile: { ...account.profile, ocbr: Number(account.profile.ocbr ?? 88) }, rank: await playerRank(client, account.profile) });
    if (action === 'presence') return res.status(200).json(await savePresence(client, account, body));
    if (action === 'nearby') return res.status(200).json(await nearbyPlayers(client, account));
    if (action === 'territory-leaders') {
      const ranked = await publicRanks(client);
      return res.status(200).json({ scope: body.scope === 'barangay' ? 'barangay' : 'city', label: body.scope === 'barangay' ? 'Nearby barangay' : 'Nearby city', players: ranked.players });
    }
    if (action === 'social-status' || action === 'social-update') {
      const target = String(body.target ?? '');
      if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(target) || target === account.id) fail(400, 'Choose another registered player.');
      const pair = `and(user_id.eq.${account.id},target_id.eq.${target}),and(user_id.eq.${target},target_id.eq.${account.id})`;
      const links = await client.from('cb_social_links').select('*').or(pair);
      if (links.error) fail(500, links.error.message);
      const rows = links.data ?? [];
      if (action === 'social-status') return res.status(200).json({
        blocked: rows.some((r: any) => r.kind === 'block'),
        blockedByMe: rows.some((r: any) => r.kind === 'block' && r.user_id === account.id),
        following: rows.some((r: any) => r.kind === 'follow' && r.user_id === account.id),
        friendship: rows.filter((r: any) => r.kind === 'friend').map((r: any) => r.status === 'accepted' ? 'accepted' : r.user_id === account.id ? 'sent' : 'received')[0] ?? null,
      });
      const op = String(body.op ?? '');
      const person = await client.from('cb_profiles').select('user_id').eq('user_id', target).maybeSingle();
      if (person.error) fail(500, person.error.message);
      if (!person.data) fail(404, 'This player is unavailable.');
      if (!['block', 'unblock'].includes(op) && rows.some((r: any) => r.kind === 'block')) fail(403, 'This player is unavailable.');
      let update: any;
      if (op === 'unfollow' || op === 'unblock') update = await client.from('cb_social_links').delete().eq('user_id', account.id).eq('target_id', target).eq('kind', op === 'unfollow' ? 'follow' : 'block');
      else if (op === 'remove-friend') update = await client.from('cb_social_links').delete().eq('kind', 'friend').or(pair);
      else if (op === 'accept') update = await client.from('cb_social_links').update({ status: 'accepted' }).eq('user_id', target).eq('target_id', account.id).eq('kind', 'friend').eq('status', 'pending');
      else if (['follow', 'friend', 'block'].includes(op)) {
        const exists = rows.some((r: any) => r.kind === op && (op === 'friend' || r.user_id === account.id));
        if (!exists) update = await client.from('cb_social_links').insert({ user_id: account.id, target_id: target, kind: op, status: op === 'friend' ? 'pending' : 'active' });
        if (update?.error && update.error.code !== '23505') fail(500, update.error.message);
        if (op === 'block') update = await client.from('cb_social_links').delete().in('kind', ['friend', 'follow']).or(pair);
      } else fail(400, 'Unknown social action.');
      if (update?.error && update.error.code !== '23505') fail(500, update.error.message);
      return res.status(200).json({ ok: true });
    }
    if (action === 'search-players') {
      const query = String(body.query ?? '').trim().replace(/^@/, '').toLowerCase(); if (query.length < 2) return res.status(200).json({ players: [] });
      const r = await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak').neq('user_id', account.id).or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(10);
      if (r.error) fail(500, r.error.message); return res.status(200).json({ players: r.data ?? [] });
    }
    if (action === 'room') {
      const control = String(body.control ?? ''), clock = tc(control), target = typeof body.target === 'string' ? body.target : null, publicChallenge = body.publicChallenge === true;
      if (publicChallenge && target) fail(400, 'Choose one challenge audience.');
      const active = await client.from('cb_matches').select('id').eq('status', 'active').or(`white_id.eq.${account.id},black_id.eq.${account.id}`).limit(1); if (active.error) fail(500, active.error.message); if (active.data?.length) fail(409, 'Finish your current match first.');
      // A new invitation replaces older unanswered invitations from this host.
      const old = await client.from('cb_matches').select('id').eq('host_id', account.id).eq('status', 'waiting');
      if (old.error) fail(500, old.error.message);
      const oldIds = (old.data ?? []).map((m: any) => m.id);
      if (oldIds.length) {
        const cancelled = await client.from('cb_matches').update({ status: 'cancelled' }).in('id', oldIds).eq('host_id', account.id).eq('status', 'waiting');
        if (cancelled.error) fail(500, cancelled.error.message);
        const expired = await client.from('cb_feed').update({ expires_at: new Date().toISOString() }).in('challenge_match_id', oldIds).eq('kind', 'challenge');
        if (expired.error) fail(500, expired.error.message);
      }
      const match = one<any>(await client.from('cb_matches').insert({ host_id: account.id, white_id: account.id, invite_to: target, status: 'waiting', code: code(), control, white_ms: clock.seconds * 1000, black_ms: clock.seconds * 1000, last_tick: new Date().toISOString(), white_cbr: account.profile.cbr }).select('*').single());
      if (publicChallenge) { const event = await client.from('cb_feed').insert({ user_id: account.id, kind: 'challenge', display_name: account.profile.display_name, content: `is looking for a ${clock.group.toLowerCase()} challenge · ${clock.label}.`, challenge_match_id: match.id, expires_at: new Date(now() + 120000).toISOString() }); if (event.error) { await client.from('cb_matches').delete().eq('id', match.id); fail(500, event.error.message); } }
      console.info('arena.room-created', { matchId: match.id, publicChallenge });
      return res.status(200).json({ match: await matchView(client, match), challengePublished: publicChallenge });
    }
    if (action === 'accept-challenge') {
      const id = String(body.id ?? ''), match = await readMatch(client, id); if (match.white_id === account.id) fail(400, 'You cannot accept your own challenge.');
      if (match.status !== 'waiting' || match.invite_to || Date.parse(match.created_at) <= now() - 120000) fail(404, 'This challenge has expired or was accepted.');
      const event = await client.from('cb_feed').select('id').eq('challenge_match_id', id).eq('kind', 'challenge').gt('expires_at', new Date().toISOString()).maybeSingle(); if (event.error) fail(500, event.error.message); if (!event.data) fail(404, 'This challenge has expired or was accepted.');
      const changed = await client.from('cb_matches').update({ black_id: account.id, black_cbr: account.profile.cbr, status: 'active', version: 1, last_tick: new Date().toISOString() }).eq('id', id).eq('status', 'waiting').is('black_id', null).select('*').maybeSingle(); if (changed.error) fail(500, changed.error.message); if (!changed.data) fail(409, 'This challenge was already accepted.');
      await client.from('cb_feed').update({ expires_at: new Date().toISOString() }).eq('id', event.data.id); return res.status(200).json({ match: await matchView(client, changed.data) });
    }
    if (action === 'join') {
      const roomCode = String(body.code ?? '').trim().toUpperCase();
      const match = one<any>(await client.from('cb_matches').select('*').eq('code', roomCode).eq('status', 'waiting').maybeSingle());
      if (match.white_id === account.id) fail(400, 'You cannot join your own room.');
      if (match.invite_to && match.invite_to !== account.id) fail(403, 'This invitation belongs to another player.');
      if (Date.parse(match.created_at) <= now() - 120000) fail(410, 'This invitation has expired.');
      const changed = await client.from('cb_matches').update({ black_id: account.id, black_cbr: account.profile.cbr, status: 'active', version: Number(match.version) + 1, last_tick: new Date().toISOString() }).eq('id', match.id).eq('version', match.version).eq('status', 'waiting').is('black_id', null).select('*').maybeSingle();
      if (changed.error) fail(500, changed.error.message);
      if (!changed.data) fail(409, 'This room was already joined.');
      return res.status(200).json({ match: await matchView(client, changed.data) });
    }
    if (action === 'match') { const match = await readMatch(client, String(body.id ?? '')); if (!participant(match, account.id)) fail(403, 'This room is private.'); return res.status(200).json({ match: await matchView(client, match) }); }
    if (action === 'state') {
      const [r, pending] = await Promise.all([
        client.from('cb_matches').select('*').eq('status', 'active').or(`white_id.eq.${account.id},black_id.eq.${account.id}`).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        client.from('cb_matches').select('id,host_id,control,code,created_at').eq('status', 'waiting').eq('invite_to', account.id).gt('created_at', new Date(now() - 120000).toISOString()).order('created_at', { ascending: false }).limit(10),
      ]);
      if (r.error || pending.error) fail(500, r.error?.message ?? pending.error?.message ?? 'Unable to load match state.');
      const names = await playerMap(client, (pending.data ?? []).map((invite: any) => invite.host_id));
      return res.status(200).json({ match: r.data ? await matchView(client, r.data) : null, completed: null, invites: (pending.data ?? []).map((invite: any) => ({ ...invite, host_name: names.get(invite.host_id)?.display_name ?? 'A player' })), fair_play: { total_aborts: 0, cooldown_until: 0 } });
    }
    if (action === 'cancel-room' || action === 'decline-room') {
      const id = String(body.id ?? '');
      const r = await client.from('cb_matches').update({ status: 'cancelled' }).eq('id', id).eq(action === 'cancel-room' ? 'host_id' : 'invite_to', account.id).eq('status', 'waiting').select('id').maybeSingle();
      if (r.error) fail(500, r.error.message);
      if (!r.data) fail(409, 'This invitation is no longer available.');
      const expired = await client.from('cb_feed').update({ expires_at: new Date().toISOString() }).eq('kind', 'challenge').eq('challenge_match_id', id);
      if (expired.error) fail(500, expired.error.message);
      return res.status(200).json({ ok: true });
    }
    if (action === 'heart') { const id = String(body.id ?? ''); if (id.startsWith('challenge:')) return res.status(200).json({ ok: true }); const r = body.liked === true ? await client.from('cb_feed_reactions').upsert({ feed_id: id, user_id: account.id }, { onConflict: 'feed_id,user_id' }) : await client.from('cb_feed_reactions').delete().eq('feed_id', id).eq('user_id', account.id); if (r.error) fail(500, r.error.message); return res.status(200).json({ ok: true }); }
    if (action === 'hearts') { const r = await client.from('cb_feed_reactions').select('feed_id').eq('user_id', account.id); if (r.error) fail(500, r.error.message); return res.status(200).json({ ids: (r.data ?? []).map((row: any) => row.feed_id) }); }
    if (action === 'timeout') {
      const match = await readMatch(client, String(body.id ?? ''));
      if (![match.white_id, match.black_id].includes(account.id)) fail(403, 'Only players may update this match.');
      if (match.status !== 'active') return res.status(200).json({ match: await matchView(client, match) });
      const game = new Chess(); if (match.pgn) game.loadPgn(match.pgn);
      const whiteTurn = game.turn() === 'w';
      const remaining = Number(whiteTurn ? match.white_ms : match.black_ms) - Math.max(0, now() - Date.parse(match.last_tick));
      if (remaining > 0) fail(409, 'The clock is still running.');
      const patch = { status: 'finished', result: whiteTurn ? 'black' : 'white', version: Number(match.version) + 1, last_tick: new Date().toISOString(), [whiteTurn ? 'white_ms' : 'black_ms']: 0 };
      const changed = await client.from('cb_matches').update(patch).eq('id', match.id).eq('version', match.version).eq('status', 'active').select('*').maybeSingle();
      if (changed.error) fail(500, changed.error.message);
      if (!changed.data) return res.status(200).json({ match: await matchView(client, await readMatch(client, match.id)) });
      await settle(client, changed.data);
      return res.status(200).json({ match: await matchView(client, await readMatch(client, match.id)) });
    }
    if (action === 'move' || action === 'resign' || action === 'abort') {
      const match = await readMatch(client, String(body.id ?? '')); if (![match.white_id, match.black_id].includes(account.id)) fail(403, 'Only players may update this match.'); if (Number(body.version) !== Number(match.version)) fail(409, 'The board changed. Please try again.');
      let patch: Record<string, unknown> = { version: Number(match.version) + 1, last_tick: new Date().toISOString() };
      if (match.status !== 'active') fail(409, 'This match is no longer active.');
      if (action === 'abort') patch = { ...patch, status: 'cancelled', result: null }; else if (action === 'resign') patch = { ...patch, status: 'finished', result: account.id === match.white_id ? 'black' : 'white' }; else {
        const game = new Chess(); if (match.pgn) game.loadPgn(match.pgn);
        const whiteTurn = game.turn() === 'w';
        if ((whiteTurn ? match.white_id : match.black_id) !== account.id) fail(409, 'Wait for your opponent.');
        const remaining = Math.max(0, Number(whiteTurn ? match.white_ms : match.black_ms) - Math.max(0, now() - Date.parse(match.last_tick)));
        if (!remaining) patch = { ...patch, status: 'finished', result: whiteTurn ? 'black' : 'white', [whiteTurn ? 'white_ms' : 'black_ms']: 0 };
        else {
          try { game.move(body.move); } catch { fail(400, 'That move is not legal.'); }
          const ended = result(game); patch = { ...patch, pgn: game.pgn(), [whiteTurn ? 'white_ms' : 'black_ms']: remaining + tc(match.control).increment * 1000, ...(ended ? { status: 'finished', result: ended } : {}) };
        }
      }
      const changed = await client.from('cb_matches').update(patch).eq('id', match.id).eq('version', match.version).select('*').maybeSingle(); if (changed.error) fail(500, changed.error.message); if (!changed.data) fail(409, 'The board changed. Please try again.'); await settle(client, changed.data); return res.status(200).json({ match: await matchView(client, await readMatch(client, match.id)), fair_play: { total_aborts: 0, cooldown_until: 0 } });
    }
    if (action === 'react') { const match = await readMatch(client, String(body.id ?? '')); if (!participant(match, account.id)) fail(403, 'This room is private.'); const reactions = Array.isArray(match.reactions) ? match.reactions : []; reactions.push({ emote: String(body.emote ?? '').slice(0, 8), at: now() }); const changed = one<any>(await client.from('cb_matches').update({ reactions, version: Number(match.version) + 1 }).eq('id', match.id).eq('version', match.version).select('*').maybeSingle()); return res.status(200).json({ match: await matchView(client, changed) }); }
    fail(404, 'This game action is not available during the migration.');
  } catch (error) { const known = error instanceof ApiError ? error : new ApiError(500, 'The game service could not complete this request. Please try again.'); console.error('arena.failed', { action, status: known.status, message: known.message }); return res.status(known.status).json({ error: known.message }); }
}
