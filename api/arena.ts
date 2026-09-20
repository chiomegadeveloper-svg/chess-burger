import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

type Req = { method?: string; query?: Record<string, string | string[] | undefined>; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };
// The Supabase schema is managed in SQL migrations, so the server route uses
// runtime checks instead of a generated TypeScript database declaration.
type Db = any;

// Keep the match engine in this serverless entrypoint. Vercel was unable to
// resolve the former cross-file helper at runtime, which crashed Arena before
// Home, Map, Rank, or gameplay could receive a JSON response.
namespace MatchEngine {
  export class Failure extends Error {
    constructor(message: string, public status = 409) { super(message); this.name = 'MatchActionError'; }
  }
  export const actions = new Set(['match', 'move', 'resign', 'abort', 'timeout', 'offer', 'respond-offer']);
  type Row = Record<string, any>;
  type Meta = { requests?: Record<string, { takeback: number; draw: number }>; pending?: any; last?: any; request_ids?: string[]; move_ids?: string[] };
  const LIMIT = 3, OFFER_MS = 30_000;
  const increments: Record<string, number> = { '1+0': 0, '1+1': 1, '2+1': 1, '3+0': 0, '3+2': 2, '5+0': 0, '10+0': 0, '10+5': 5, '15+10': 10 };
  const reject = (message: string, status = 409): never => { throw new Failure(message, status); };
  function check(error: { message: string } | null) { if (error) reject(/game_meta/.test(error.message) ? 'Run supabase/0014_gameplay_v46.sql, then redeploy.' : error.message, 500); }
  const stamp = (value: string | number) => typeof value === 'number' ? value : Date.parse(value);
  function view(row: Row) { return { ...row, version: Number(row.version), created_at: stamp(row.created_at), last_tick: stamp(row.last_tick), white_ms: Number(row.white_ms), black_ms: Number(row.black_ms), rating_applied: row.rating_applied ? 1 : 0, reactions: typeof row.reactions === 'string' ? row.reactions : JSON.stringify(row.reactions ?? {}), game_meta: row.game_meta ?? {}, server_now: Date.now() }; }
  function game(row: Row) { const value = new Chess(); if (row.pgn) value.loadPgn(row.pgn); return value; }
  function clear(meta: Meta, outcome: 'expired' | 'position-changed'): Meta { if (!meta.pending) return meta; const { id, kind, by } = meta.pending; return { ...meta, pending: null, last: { id, kind, by, outcome } }; }
  function clock(row: Row, at: number) { const chess = game(row), white = chess.turn() === 'w', elapsed = Math.max(0, at - row.last_tick), white_ms = Math.max(0, row.white_ms - (white ? elapsed : 0)), black_ms = Math.max(0, row.black_ms - (white ? 0 : elapsed)); return { chess, white, white_ms, black_ms, expired: (white ? white_ms : black_ms) <= 0 }; }
  function apply(row: Row, actor: string, action: string, input: Record<string, unknown>, at: number): Row {
    if (![row.white_id, row.black_id].includes(actor)) reject('Only the two players may update this match.', 403);
    const meta: Meta = row.game_meta ?? {};
    if (action === 'move' && typeof input.request_id === 'string' && meta.move_ids?.includes(input.request_id)) return row;
    if (action === 'offer' && typeof input.request_id === 'string' && meta.request_ids?.includes(input.request_id)) return row;
    if (row.status !== 'active') reject('This match is no longer active.');
    const c = clock(row, at);
    if (c.expired) return { ...row, white_ms: c.white_ms, black_ms: c.black_ms, last_tick: at, status: 'finished', result: c.white ? 'black' : 'white', version: row.version + 1, game_meta: clear(meta, 'expired') };
    const next = { ...row, version: row.version + 1, server_now: at };
    const pending = meta.pending && meta.pending.expires_at > at ? meta.pending : null;
    const currentMeta = meta.pending && !pending ? clear(meta, 'expired') : meta;
    if (action === 'timeout') reject('The clock is still running.');
    if (action === 'move') {
      if ((c.white ? row.white_id : row.black_id) !== actor) reject('Wait for your opponent.', 403);
      if (typeof input.base_pgn === 'string' ? input.base_pgn !== row.pgn : Number(input.version) !== row.version) reject('The board changed. Please try your move again.');
      const move = input.move as { from?: string; to?: string; promotion?: string } | undefined;
      if (!move?.from || !move.to) reject('Choose a legal move.', 400);
      try { c.chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' }); } catch { reject('That move is not legal.', 400); }
      const increment = (increments[row.control] ?? 0) * 1000;
      const ended = c.chess.isCheckmate() ? (c.chess.turn() === 'w' ? 'black' : 'white') : c.chess.isDraw() ? 'draw' : null;
      const ids = [...(meta.move_ids ?? [])];
      if (typeof input.request_id === 'string') ids.push(input.request_id.slice(0, 80));
      return { ...next, pgn: c.chess.pgn(), white_ms: c.white_ms + (c.white ? increment : 0), black_ms: c.black_ms + (c.white ? 0 : increment), last_tick: at, status: ended ? 'finished' : 'active', result: ended, game_meta: { ...clear(currentMeta, 'position-changed'), move_ids: ids } };
    }
    if (action === 'resign' || action === 'abort') return { ...next, white_ms: c.white_ms, black_ms: c.black_ms, last_tick: at, status: action === 'abort' ? 'cancelled' : 'finished', result: action === 'abort' ? null : actor === row.white_id ? 'black' : 'white', game_meta: clear(currentMeta, 'position-changed') };
    if (action === 'offer') {
      const kind = input.kind as 'takeback' | 'draw', id = input.request_id;
      if (!['takeback', 'draw'].includes(kind) || typeof id !== 'string' || !/^[\w-]{8,80}$/.test(id)) reject('Invalid match request.', 400);
      if (pending) reject('Answer the pending request first.');
      const used = currentMeta.requests?.[actor] ?? { takeback: 0, draw: 0 };
      if (used[kind] >= LIMIT) reject(`You have used all 3 ${kind === 'draw' ? 'draw offers' : 'takeback requests'} in this match.`);
      let plies = 0;
      if (kind === 'takeback') {
        const history = c.chess.history({ verbose: true }), color = actor === row.white_id ? 'w' : 'b';
        let own = -1;
        for (let i = history.length - 1; i >= 0; i--) if (history[i]?.color === color) { own = i; break; }
        if (own < 0) reject('You have not made a move to take back.');
        plies = history.length - own;
      }
      return { ...next, game_meta: { ...currentMeta, requests: { ...currentMeta.requests, [actor]: { ...used, [kind]: used[kind] + 1 } }, request_ids: [...(currentMeta.request_ids ?? []), id], pending: { id, kind, by: actor, at, expires_at: at + OFFER_MS, pgn: row.pgn, plies } } };
    }
    if (action === 'respond-offer') {
      if (!pending || pending.id !== input.request_id) reject('This request expired or was already answered.');
      if (pending.by === actor) reject('Only your opponent can approve or decline your request.', 403);
      if (typeof input.accept !== 'boolean') reject('Choose Accept or Decline.', 400);
      if (pending.pgn !== row.pgn) reject('The position changed. This request is no longer valid.');
      const game_meta = { ...currentMeta, pending: null, last: { id: pending.id, kind: pending.kind, by: pending.by, outcome: input.accept ? 'accepted' : 'declined' } };
      if (!input.accept) return { ...next, game_meta };
      if (pending.kind === 'draw') return { ...next, game_meta, status: 'finished', result: 'draw', white_ms: c.white_ms, black_ms: c.black_ms, last_tick: at };
      let white_ms = c.white_ms, black_ms = c.black_ms;
      const increment = (increments[row.control] ?? 0) * 1000;
      for (let i = 0; i < pending.plies; i++) { const undone = c.chess.undo(); if (!undone) reject('There is no move to take back.'); if (undone.color === 'w') white_ms = Math.max(0, white_ms - increment); else black_ms = Math.max(0, black_ms - increment); }
      return { ...next, game_meta, pgn: c.chess.pgn(), white_ms, black_ms, last_tick: at };
    }
    return reject('Unknown match action.', 400);
  }
  export async function run(client: Db, req: Req, action: string, body: Record<string, unknown>, settleMatch: (client: Db, row: Row) => Promise<void>) {
    const started = Date.now(), header = req.headers.authorization;
    const token = (Array.isArray(header) ? header[0] : header ?? '').replace(/^Bearer\s+/i, '');
    if (!token) reject('Please sign in again.', 401);
    const id = String(body.id ?? '');
    if (!/^[\w-]{1,80}$/.test(id)) reject('Invalid match.', 400);
    const [auth, found] = await Promise.all([client.auth.getUser(token), client.from('cb_matches').select('*').eq('id', id).maybeSingle()]);
    if (auth.error || !auth.data.user) reject('Please sign in again.', 401);
    check(found.error);
    if (!found.data) reject('This match is no longer available.', 404);
    const actor = auth.data.user.id;
    if (![found.data.white_id, found.data.black_id].includes(actor)) reject('Only the two players may access this match.', 403);
    let row: Row = found.data;
    if (action === 'match') {
      const match = view(row);
      if (!body.compact) {
        const people = await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak').in('user_id', [row.white_id, row.black_id].filter(Boolean));
        check(people.error);
        match.white = people.data?.find((p: any) => p.user_id === row.white_id);
        match.black = people.data?.find((p: any) => p.user_id === row.black_id);
      }
      return { match };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = view(row), next = apply(current, actor, action, body, action === 'move' ? Math.max(started, current.last_tick) : Date.now());
      if (next === current) return { match: current };
      const patch = { pgn: next.pgn, white_ms: next.white_ms, black_ms: next.black_ms, last_tick: new Date(next.last_tick).toISOString(), status: next.status, result: next.result, version: next.version, game_meta: next.game_meta };
      const changed = await client.from('cb_matches').update(patch).eq('id', id).eq('version', row.version).eq('status', 'active').select('*').maybeSingle();
      check(changed.error);
      if (changed.data) {
        row = changed.data;
        if (row.status === 'finished') { await settleMatch(client, row); const rated = await client.from('cb_matches').select('*').eq('id', id).single(); check(rated.error); row = rated.data; }
        console.info('arena.match-action', { action, id, elapsed_ms: Date.now() - started });
        return { match: view(row) };
      }
      const latest = await client.from('cb_matches').select('*').eq('id', id).single();
      check(latest.error);
      row = latest.data;
    }
    return reject('The match changed. Please retry your action.');
  }
}

const TIME: Record<string, { seconds: number; increment: number; group: string; label: string }> = {
  '1+0': { seconds: 60, increment: 0, group: 'Bullet', label: '1 min' }, '1+1': { seconds: 60, increment: 1, group: 'Bullet', label: '1 + 1' }, '2+1': { seconds: 120, increment: 1, group: 'Bullet', label: '2 + 1' },
  '3+0': { seconds: 180, increment: 0, group: 'Blitz', label: '3 min' }, '3+2': { seconds: 180, increment: 2, group: 'Blitz', label: '3 + 2' }, '5+0': { seconds: 300, increment: 0, group: 'Blitz', label: '5 min' },
  '10+0': { seconds: 600, increment: 0, group: 'Rapid', label: '10 min' }, '10+5': { seconds: 600, increment: 5, group: 'Rapid', label: '10 + 5' }, '15+10': { seconds: 900, increment: 10, group: 'Rapid', label: '15 + 10' },
};
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const now = () => Date.now();
const gpsCutoff = () => new Date(now() - 45_000).toISOString();

async function publicRanks(client: Db) {
  await reconcileAuthProfiles(client);
  const r = await client.from('cb_profiles')
    .select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak')
    .order('cbr', { ascending: false }).order('wins', { ascending: false }).order('user_id', { ascending: true }).limit(10);
  if (r.error) fail(500, r.error.message);
  return { players: r.data ?? [] };
}

function profileSeed(user: any) {
  const meta = user.user_metadata ?? {};
  const rawName = String(meta.full_name ?? meta.name ?? meta.display_name ?? user.email?.split('@')[0] ?? 'Chess Burger Player').trim();
  const base = String(meta.username ?? user.email?.split('@')[0] ?? rawName).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 15) || 'player';
  const username = `${base.length < 3 ? `player_${base}` : base}_${String(user.id).replace(/-/g, '').slice(0, 6)}`.slice(0, 24);
  const candidateAvatar = String(meta.avatar_url ?? meta.picture ?? '').trim();
  return { user_id: user.id, username, display_name: rawName.slice(0, 60) || 'Chess Burger Player', avatar_url: /^https:\/\//i.test(candidateAvatar) ? candidateAvatar : '', country_code: /^[A-Z]{2}$/.test(String(meta.country_code ?? '')) ? meta.country_code : 'PH' };
}

async function reconcileAuthProfiles(client: Db) {
  const [accounts, profiles] = await Promise.all([client.auth.admin.listUsers({ page: 1, perPage: 1000 }), client.from('cb_profiles').select('user_id')]);
  if (accounts.error) fail(500, accounts.error.message);
  if (profiles.error) fail(500, profiles.error.message);
  const existing = new Set((profiles.data ?? []).map((row: any) => row.user_id));
  const missing = (accounts.data?.users ?? []).filter((user: any) => !existing.has(user.id)).map(profileSeed);
  if (missing.length) {
    const inserted = await client.from('cb_profiles').upsert(missing, { onConflict: 'user_id', ignoreDuplicates: true });
    if (inserted.error) fail(500, inserted.error.message);
    console.info('arena.profiles-reconciled', { created: missing.length, totalAuthUsers: accounts.data?.total ?? accounts.data?.users?.length ?? 0 });
  }
  return Number(accounts.data?.total ?? accounts.data?.users?.length ?? 0);
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
    const removed = await client.from('cb_presence').update({ gps_enabled: false, seen_at: new Date().toISOString() }).eq('user_id', account.id);
    if (removed.error) fail(500, 'GPS presence is temporarily unavailable.');
    return { ok: true };
  }
  const lat = Number(body.lat), lng = Number(body.lng), accuracy = Math.min(500, Math.max(0, Number(body.accuracy ?? 0)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) fail(400, 'The GPS reading is invalid.');
  const saved = await client.from('cb_presence').upsert({ user_id: account.id, latitude: lat, longitude: lng, accuracy, gps_enabled: true, seen_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (saved.error) fail(500, 'GPS presence is temporarily unavailable.');
  const barangay = typeof body.barangay === 'string' ? body.barangay.trim().slice(0, 96) : '';
  const locality = typeof body.locality === 'string' ? body.locality.trim().slice(0, 96) : '';
  if (barangay && locality) {
    const region = await client.from('cb_player_regions').upsert({ user_id: account.id, barangay, locality, country_code: account.profile.country_code || 'PH', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (region.error) console.warn('arena.region-unavailable', { userId: account.id });
  }
  return { ok: true };
}
async function nearbyPlayers(client: Db, account: any) {
  const own = await client.from('cb_presence').select('*').eq('user_id', account.id).eq('gps_enabled', true).gt('seen_at', gpsCutoff()).maybeSingle();
  if (own.error) fail(500, 'GPS presence is temporarily unavailable.');
  if (!own.data) return { players: [], territories: [] };
  const presence = await client.from('cb_presence').select('*').neq('user_id', account.id).eq('gps_enabled', true).gt('seen_at', gpsCutoff());
  if (presence.error) fail(500, presence.error.message);
  const active = await client.from('cb_matches').select('white_id,black_id').eq('status', 'active');
  if (active.error) fail(500, active.error.message);
  const playing = new Set((active.data ?? []).flatMap((m: any) => [m.white_id, m.black_id]).filter(Boolean));
  const available = (presence.data ?? []).filter((p: any) => !playing.has(p.user_id));
  const people = await playerMap(client, available.map((p: any) => p.user_id));
  const players = available.map((p: any) => {
    const person = people.get(p.user_id);
    const distance = metres(Number(own.data.latitude), Number(own.data.longitude), Number(p.latitude), Number(p.longitude));
    return person ? { ...person, lat: Number(p.latitude), lng: Number(p.longitude), distance } : null;
  }).filter((p: any) => p && p.distance <= 10_000).sort((a: any, b: any) => a.distance - b.distance);
  const refreshed=await client.rpc('cb_refresh_territories',{p_user_id:account.id,p_lat:Number(own.data.latitude),p_lng:Number(own.data.longitude)});
  const fullFields='id,user_id,lat,lng,kingdom_name,defense_points,last_visited_at,defense_checked_at';
  let [nearbyZones,ownedZones]=await Promise.all([client.from('cb_territories').select(fullFields).gte('lat',Number(own.data.latitude)-.15).lte('lat',Number(own.data.latitude)+.15).gte('lng',Number(own.data.longitude)-.25).lte('lng',Number(own.data.longitude)+.25).limit(100),client.from('cb_territories').select(fullFields).eq('user_id',account.id).limit(3)]);
  let rulesReady=!refreshed.error&&!nearbyZones.error&&!ownedZones.error;
  if(!rulesReady)[nearbyZones,ownedZones]=await Promise.all([client.from('cb_territories').select('id,user_id,lat,lng,kingdom_name').gte('lat',Number(own.data.latitude)-.15).lte('lat',Number(own.data.latitude)+.15).gte('lng',Number(own.data.longitude)-.25).lte('lng',Number(own.data.longitude)+.25).limit(100),client.from('cb_territories').select('id,user_id,lat,lng,kingdom_name').eq('user_id',account.id).limit(3)]);
  if(nearbyZones.error||ownedZones.error)return {players,territories:[],owned_count:0,slot_limit:3,rules_ready:false};
  const merged=[...(nearbyZones.data??[]),...(ownedZones.data??[])].filter((zone:any,index:number,rows:any[])=>rows.findIndex(other=>other.id===zone.id)===index);
  const ownerIds=merged.map((zone:any)=>zone.user_id).filter(Boolean);
  const owners=ownerIds.length?await playerMap(client,ownerIds):new Map();
  const liveLocations=new Map([[account.id,own.data],...(presence.data??[]).map((row:any)=>[row.user_id,row])]);
  const territories=merged.map((zone:any)=>{
    const abandoned=!zone.user_id||Number(zone.defense_points??10)<=0;
    const owner=owners.get(zone.user_id);
    const ownerLocation=zone.user_id?liveLocations.get(zone.user_id):null;
    const ownerInRange=!!ownerLocation&&metres(Number(zone.lat),Number(zone.lng),Number(ownerLocation.latitude),Number(ownerLocation.longitude))<=1000;
    const viewerInRange=metres(Number(zone.lat),Number(zone.lng),Number(own.data.latitude),Number(own.data.longitude))<=1000;
    return {...zone,user_id:zone.user_id??'',centroid_lat:Number(zone.lat),centroid_lng:Number(zone.lng),defense_points:abandoned?0:Number(zone.defense_points??10),online:!abandoned&&ownerInRange,is_owner:!abandoned&&zone.user_id===account.id,abandoned,in_range:viewerInRange,display_name:abandoned?'No KING':owner?.display_name??'Player',username:owner?.username??'',avatar_url:owner?.avatar_url??'',cbr:abandoned?null:Number(owner?.cbr??0),country_code:owner?.country_code??''};
  });
  return {players,territories,owned_count:(ownedZones.data??[]).length,slot_limit:Number(account.profile.territory_slots??3),rules_ready:rulesReady};
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
  let profileResult = await client.from('cb_profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (!profileResult.error && !profileResult.data) {
    const created = await client.from('cb_profiles').upsert(profileSeed(user), { onConflict: 'user_id', ignoreDuplicates: true });
    if (created.error) fail(500, created.error.message);
    profileResult = await client.from('cb_profiles').select('*').eq('user_id', user.id).maybeSingle();
  }
  const profile = one<any>(profileResult);
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

async function broadcastMatch(match: any) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key || !match?.id) return;
  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: `cb-match:${match.id}`, event: 'match-updated', payload: { id: match.id, match }, private: false }] }),
    });
    if (!response.ok) console.warn('arena.realtime-broadcast-failed', { matchId: match.id, status: response.status });
  } catch (error) {
    console.warn('arena.realtime-broadcast-failed', { matchId: match.id, message: String(error) });
  }
}

async function settle(client: Db, match: any) {
  if (match.status !== 'finished' || match.rating_applied || !match.black_id || !match.result) return;
  if (['queue', 'wager'].includes(String(match.play_mode ?? 'normal'))) {
    const paid = await client.rpc('cb_settle_match_gold', { p_match_id: match.id });
    if (paid.error) fail(500, paid.error.message);
  }
  const people = await playerMap(client, [match.white_id, match.black_id]);
  const white = people.get(match.white_id), black = people.get(match.black_id); if (!white || !black) return;
  for (const [p, side, rival] of [[white, 'white', black], [black, 'black', white]] as const) {
    const won = match.result === side, lost = match.result !== 'draw' && !won;
    const delta = won ? 8 + (p.win_streak + 1 >= 4 ? 2 : 0) + (Math.abs(p.cbr - rival.cbr) > 10 ? Math.floor(rival.cbr * .1) : 0) : lost ? -Math.min(10, p.cbr) : 0;
    const goldMatch = ['queue', 'wager'].includes(String(match.play_mode ?? 'normal'));
    const gold = goldMatch ? 0 : won ? 5 + (p.win_streak >= 5 ? 2 : 0) : lost ? 1 : 0;
    const updated = await client.from('cb_profiles').update({ cbr: Math.max(0, p.cbr + delta), gold_points: p.gold_points + gold, wins: p.wins + (won ? 1 : 0), losses: p.losses + (lost ? 1 : 0), win_streak: won ? p.win_streak + 1 : 0 }).eq('user_id', p.user_id);
    if (updated.error) fail(500, updated.error.message);
    if (won) { const event = await client.from('cb_feed').insert({ user_id: p.user_id, kind: 'win', display_name: p.display_name, content: `won a ${tc(match.control).group.toLowerCase()} match.`, cbr_delta: delta, gold_delta: gold }); if (event.error) fail(500, event.error.message); }
  }
  const rated = await client.from('cb_matches').update({ rating_applied: true }).eq('id', match.id).eq('rating_applied', false);
  if (rated.error) fail(500, rated.error.message);
}
async function finishExpiredMatch(client: Db, match: any) {
  if (!match || match.status !== 'active') return match;
  const game = new Chess();
  if (match.pgn) game.loadPgn(match.pgn);
  const whiteTurn = game.turn() === 'w';
  const checkedAt = now();
  const remaining = Number(whiteTurn ? match.white_ms : match.black_ms) - Math.max(0, checkedAt - Date.parse(match.last_tick));
  if (remaining > 0) return match;
  const patch = { status: 'finished', result: whiteTurn ? 'black' : 'white', version: Number(match.version) + 1, last_tick: new Date(checkedAt).toISOString(), [whiteTurn ? 'white_ms' : 'black_ms']: 0 };
  const changed = await client.from('cb_matches').update(patch).eq('id', match.id).eq('version', match.version).eq('status', 'active').select('*').maybeSingle();
  if (changed.error) fail(500, changed.error.message);
  const current = changed.data ?? await readMatch(client, match.id);
  await settle(client, current);
  return current;
}
async function publicFeed(client: Db) {
  // Keep the public feed compatible with databases created before expires_at
  // was added. Filtering an optional column in PostgREST can otherwise take
  // the entire Home page down.
  const list = await client.from('cb_feed').select('*').order('created_at', { ascending: false }).limit(70);
  if (list.error) fail(500, list.error.message);
  const visible = (list.data ?? []).filter((event: any) => !event.expires_at || Date.parse(event.expires_at) > now());
  const challengeIds = visible.filter((e: any) => e.kind === 'challenge' && e.challenge_match_id).map((e: any) => e.challenge_match_id);
  const activeChallenges = new Map<string, any>();
  if (challengeIds.length) {
    const waiting = await client.from('cb_matches').select('id,play_mode,wager_gold').in('id', challengeIds).eq('status', 'waiting').is('invite_to', null).gt('created_at', new Date(now() - 120000).toISOString());
    if (waiting.error) fail(500, waiting.error.message);
    for (const m of waiting.data ?? []) activeChallenges.set(m.id, m);
  }
  const people = await playerMap(client, visible.map((e: any) => e.user_id));
  return { events: visible.filter((e: any) => e.kind !== 'challenge' || activeChallenges.has(e.challenge_match_id)).map((e: any) => { const match = activeChallenges.get(e.challenge_match_id); return { id: e.kind === 'challenge' && e.challenge_match_id ? `challenge:${e.challenge_match_id}` : e.id, user_id: e.user_id, kind: e.kind, display_name: e.kind === 'announcement' ? 'Chess Burger' : e.display_name, content: e.content, image_url: e.image_url ?? '', expires_at: e.expires_at, cbr_delta: e.cbr_delta ?? 0, gold_delta: e.gold_delta ?? 0, heart_count: e.heart_count ?? 0, created_at: e.created_at, avatar_url: e.kind === 'announcement' ? '/cburger_logo.png' : people.get(e.user_id)?.avatar_url ?? '', cbr: people.get(e.user_id)?.cbr ?? 88, play_mode: match?.play_mode ?? 'normal', wager_gold: Number(match?.wager_gold ?? 0) }; }) };
}
async function saveLiveHeartbeat(client: Db, userId: string) {
  const stamp = new Date().toISOString();
  const candidates = ['seen_at', 'last_seen_at', 'updated_at', 'last_seen'];
  let lastError: any = null;
  for (const field of candidates) {
    const saved = await client.from('cb_live_presence').upsert({ user_id: userId, [field]: stamp }, { onConflict: 'user_id' });
    if (!saved.error) return { ok: true, field };
    lastError = saved.error;
    if (!/column .* does not exist|schema cache/i.test(String(saved.error.message ?? ''))) break;
  }
  fail(500, lastError?.message ?? 'Online presence is temporarily unavailable.');
}
function liveAt(row: any) {
  const value = row.seen_at ?? row.last_seen_at ?? row.updated_at ?? row.last_seen ?? null;
  const parsed = value ? Date.parse(String(value)) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
async function publicOnlineUsers(client: Db) {
  const [presence, active] = await Promise.all([
    client.from('cb_live_presence').select('*').limit(100),
    client.from('cb_matches').select('white_id,black_id').eq('status', 'active'),
  ]);
  if (presence.error || active.error) fail(500, presence.error?.message ?? active.error?.message ?? 'Online players are temporarily unavailable.');
  const cutoff = now() - 60_000;
  const recent = (presence.data ?? []).filter((row: any) => {
    const timestamp = liveAt(row);
    return timestamp === null ? row.online !== false && row.is_online !== false : timestamp > cutoff;
  });
  const playing = new Set((active.data ?? []).flatMap((match: any) => [match.white_id, match.black_id]).filter(Boolean));
  const people = await playerMap(client, recent.map((row: any) => row.user_id));
  const users = recent.map((row: any) => {
    const player = people.get(row.user_id);
    return player ? { ...player, cbr: Number(player.cbr ?? 88), available: !playing.has(row.user_id) } : null;
  }).filter(Boolean).sort((a: any, b: any) => b.cbr - a.cbr);
  return { users, count: users.length };
}

async function activeMatchFor(client: Db, userId: string) {
  const found = await client.from('cb_matches').select('*').eq('status', 'active').or(`white_id.eq.${userId},black_id.eq.${userId}`).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (found.error) fail(500, found.error.message);
  return found.data ?? null;
}

export function pickQueueCandidate(rows: any[], ownId: string, ownSeenAt: string, ownCbr: number, ratings: Map<string, any>) {
  const ownSeen = Date.parse(ownSeenAt);
  return rows
    .filter((row: any) => {
      const seen = Date.parse(String(row.seen_at ?? ''));
      return row.user_id !== ownId && Number.isFinite(seen) && (seen < ownSeen || (seen === ownSeen && String(row.user_id) < ownId));
    })
    .sort((a: any, b: any) => {
      const aGap = Math.abs(Number(ratings.get(a.user_id)?.cbr ?? 88) - ownCbr);
      const bGap = Math.abs(Number(ratings.get(b.user_id)?.cbr ?? 88) - ownCbr);
      return aGap - bGap || Date.parse(a.seen_at) - Date.parse(b.seen_at) || String(a.user_id).localeCompare(String(b.user_id));
    })[0] ?? null;
}

async function queuedMatch(client: Db, account: any, controlId: string) {
  const clock = tc(controlId);
  if (Number(account.profile.gold_points ?? 0) < 3) fail(409, 'You need at least 3 Gold to enter online pairing.');
  const compatible = Object.entries(TIME).filter(([, value]) => value.group === clock.group).map(([id]) => id);
  const active = await activeMatchFor(client, account.id);
  if (active) {
    const current = await finishExpiredMatch(client, active);
    if (current.status === 'active') return { match: await matchView(client, current), searching: false };
  }

  const existing = await client.from('cb_match_queue').select('user_id,control,match_id,seen_at').eq('user_id', account.id).maybeSingle();
  if (existing.error) fail(500, existing.error.message);
  if (existing.data?.match_id) {
    const linked = await client.from('cb_matches').select('*').eq('id', existing.data.match_id).maybeSingle();
    if (linked.error) fail(500, linked.error.message);
    if (linked.data?.status === 'active' && participant(linked.data, account.id)) return { match: await matchView(client, linked.data), searching: false };
    if (linked.data?.status === 'waiting' && participant(linked.data, account.id) && Date.parse(linked.data.created_at) > now() - 20_000) return { match: null, searching: true };
    if (linked.data?.status === 'waiting') await client.from('cb_matches').delete().eq('id', linked.data.id).eq('status', 'waiting');
    const cleared = await client.from('cb_match_queue').delete().eq('user_id', account.id).eq('match_id', existing.data.match_id);
    if (cleared.error) fail(500, cleared.error.message);
  }

  const seenAt = new Date().toISOString();
  const saved = await client.from('cb_match_queue').upsert({ user_id: account.id, control: controlId, seen_at: seenAt }, { onConflict: 'user_id' });
  if (saved.error) fail(500, saved.error.message);

  const waiting = await client.from('cb_match_queue').select('user_id,control,match_id,seen_at').neq('user_id', account.id).in('control', compatible).is('match_id', null).gt('seen_at', new Date(now() - 15_000).toISOString()).order('seen_at', { ascending: true }).limit(40);
  if (waiting.error) fail(500, waiting.error.message);
  const ratings = await playerMap(client, (waiting.data ?? []).map((row: any) => row.user_id));
  const candidate = pickQueueCandidate(waiting.data ?? [], account.id, seenAt, Number(account.profile.cbr ?? 88), ratings);
  if (!candidate) return { match: null, searching: true };

  const opponent = ratings.get(candidate.user_id);
  if (!opponent || Number(opponent.gold_points ?? 0) < 3 || await activeMatchFor(client, candidate.user_id) || await activeMatchFor(client, account.id)) return { match: null, searching: true };

  const matchId = crypto.randomUUID();
  const created = await client.from('cb_matches').insert({
    id: matchId,
    host_id: candidate.user_id,
    white_id: candidate.user_id,
    black_id: account.id,
    invite_to: null,
    code: code(),
    control: controlId,
    status: 'waiting',
    white_ms: clock.seconds * 1000,
    black_ms: clock.seconds * 1000,
    last_tick: new Date().toISOString(),
    white_cbr: Number(opponent.cbr ?? 88),
    black_cbr: Number(account.profile.cbr ?? 88),
    play_mode: 'queue',
    wager_gold: 3,
  }).select('*').single();
  if (created.error) fail(500, created.error.message);

  const claimedOpponent = await client.from('cb_match_queue').update({ match_id: matchId }).eq('user_id', candidate.user_id).is('match_id', null).select('user_id').maybeSingle();
  const claimedSelf = claimedOpponent.data ? await client.from('cb_match_queue').update({ match_id: matchId }).eq('user_id', account.id).is('match_id', null).select('user_id').maybeSingle() : { data: null, error: null };
  if (claimedOpponent.error || claimedSelf.error || !claimedOpponent.data || !claimedSelf.data) {
    const removed = await client.from('cb_matches').delete().eq('id', matchId).eq('status', 'waiting');
    if (removed.error) console.warn('arena.queue-cleanup-failed', { matchId });
    const current = await activeMatchFor(client, account.id);
    return { match: current ? await matchView(client, current) : null, searching: !current };
  }

  const started = await client.rpc('cb_activate_gold_match', { p_match_id: matchId, p_acceptor_id: account.id });
  if (started.error || !started.data) {
    await client.from('cb_matches').delete().eq('id', matchId).eq('status', 'waiting');
    fail(409, started.error?.message ?? 'Another player matched first. Searching again…');
  }
  const startedMatch = Array.isArray(started.data) ? started.data[0] : started.data;
  if (!startedMatch) fail(409, 'Another player matched first. Searching again…');
  const view = await matchView(client, startedMatch);
  await broadcastMatch(view);
  console.info('arena.queue-matched', { matchId, control: controlId });
  return { match: view, searching: false };
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
      if (action === 'online-users') return res.status(200).json(await publicOnlineUsers(client));
      if (action === 'ranks') return res.status(200).json(await publicRanks(client));
      if (action === 'live') {
        const found = await client.from('cb_matches').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(20);
        if (found.error) fail(500, found.error.message);
        const matches = (await Promise.all((found.data ?? []).map(async (row: any) => finishExpiredMatch(client, row)))).filter((row: any) => row?.status === 'active');
        return res.status(200).json({ matches: await Promise.all(matches.map((row: any) => matchView(client, row))) });
      }
      if (action === 'watch') {
        const match = await readMatch(client, String(req.query?.id ?? ''));
        if (match.status === 'waiting') fail(404, 'This match has not started.');
        return res.status(200).json({ match: await matchView(client, match) });
      }
      fail(404, 'Unknown game request.');
    }
    if (MatchEngine.actions.has(action)) return res.status(200).json(await MatchEngine.run(client, req, action, body, settle));
    const account = await signedIn(client, req);
    // The app refreshes this on sign-in to obtain the authoritative profile.
    // Keep it as a first-class migration action rather than falling through to
    // a 404 on every page load.
    if (action === 'me') return res.status(200).json({ profile: { ...account.profile, ocbr: Number(account.profile.ocbr ?? 88) }, rank: await playerRank(client, account.profile) });
    if (action === 'heartbeat') return res.status(200).json(await saveLiveHeartbeat(client, account.id));
    if (action === 'map-stats') {
      const registered = await reconcileAuthProfiles(client);
      const [online, matches, gps] = await Promise.all([
        publicOnlineUsers(client),
        client.from('cb_matches').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        client.from('cb_presence').select('user_id', { count: 'exact', head: true }).eq('gps_enabled', true).gt('seen_at', gpsCutoff()),
      ]);
      if (matches.error || gps.error) fail(500, matches.error?.message ?? gps.error?.message ?? 'Unable to load activity totals.');
      const leaderProfile = online.users[0] ?? null;
      return res.status(200).json({
        online_users: online.count,
        registered_users: registered,
        active_matches: matches.count ?? 0,
        gps_online: gps.count ?? 0,
        highest_online: leaderProfile ? { user_id: leaderProfile.user_id, display_name: leaderProfile.display_name, cbr: Number(leaderProfile.cbr ?? 88) } : null,
        updated_at: new Date().toISOString()
      });
    }
    if (action === 'social-presence') return res.status(200).json({ ok: true });
    if (action === 'social-counts') {
      const [friends, followers] = await Promise.all([
        client.from('cb_social_links').select('user_id', { count: 'exact', head: true }).eq('kind', 'friend').eq('status', 'accepted').or(`user_id.eq.${account.id},target_id.eq.${account.id}`),
        client.from('cb_social_links').select('user_id', { count: 'exact', head: true }).eq('kind', 'follow').eq('target_id', account.id),
      ]);
      if (friends.error || followers.error) fail(500, friends.error?.message ?? followers.error?.message ?? 'Unable to load social totals.');
      return res.status(200).json({ friends: friends.count ?? 0, followers: followers.count ?? 0 });
    }
    if (action === 'public-profile') {
      const target = String(body.user_id ?? '');
      if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(target)) fail(400, 'Choose a registered player.');
      if (target !== account.id) {
        const blocked = await client.from('cb_social_links').select('user_id').eq('kind', 'block').or(`and(user_id.eq.${account.id},target_id.eq.${target}),and(user_id.eq.${target},target_id.eq.${account.id})`).limit(1);
        if (blocked.error) fail(500, blocked.error.message);
        if (blocked.data?.length) fail(403, 'This profile is unavailable.');
      }
      const profile = one<any>(await client.from('cb_profiles').select('*').eq('user_id', target).maybeSingle());
      return res.status(200).json({ profile: { ...profile, ocbr: Number(profile.ocbr ?? 88) }, rank: await playerRank(client, profile) });
    }
    if (action === 'presence') return res.status(200).json(await savePresence(client, account, body));
    if (action === 'nearby') return res.status(200).json(await nearbyPlayers(client, account));
    if (action === 'territory-leaders') {
      const scope = body.scope === 'barangay' ? 'barangay' : body.scope === 'city' ? 'city' : null;
      if (!scope) fail(400, 'Choose a territory ranking.');
      const own = await client.from('cb_player_regions').select('barangay,locality').eq('user_id', account.id).maybeSingle();
      if (own.error) fail(500, 'Territory regions are not configured. Run the current GPS migration in Supabase.');
      if (!own.data) fail(409, 'Keep GPS on briefly so Chess Burger can identify your territory.');
      const field = scope === 'city' ? 'locality' : 'barangay', label = own.data[field];
      const regions = await client.from('cb_player_regions').select('user_id').eq(field, label).limit(250);
      if (regions.error) fail(500, regions.error.message);
      const ids = (regions.data ?? []).map((r: any) => r.user_id);
      const ranked = ids.length ? await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak').in('user_id', ids).order('cbr', { ascending: false }).order('wins', { ascending: false }).limit(10) : { data: [], error: null };
      if (ranked.error) fail(500, ranked.error.message);
      return res.status(200).json({ scope, label, players: ranked.data ?? [] });
    }
    if (action === 'claim') {
      const kingdomName=String(body.kingdom_name??'').trim().replace(/\s+/g,' ');
      if(kingdomName.length<3||kingdomName.length>40)fail(400,'Kingdom name must be 3 to 40 characters.');
      const presence = await client.from('cb_presence').select('latitude,longitude,accuracy').eq('user_id', account.id).eq('gps_enabled', true).gt('seen_at', new Date(now() - 30_000).toISOString()).maybeSingle();
      if (presence.error) fail(500, 'GPS presence is temporarily unavailable.');
      if (!presence.data || Number(presence.data.accuracy) > 100) fail(409, 'Enable GPS and wait for accuracy within 100 m.');
      const requestedLat=Number(body.lat),requestedLng=Number(body.lng),requestedAccuracy=Number(body.accuracy);
      if(!Number.isFinite(requestedLat)||!Number.isFinite(requestedLng)||requestedAccuracy>100||metres(requestedLat,requestedLng,Number(presence.data.latitude),Number(presence.data.longitude))>100)fail(409,'Your GPS location changed. Wait for the map dot to settle, then try again.');
      const claimed = await client.rpc('cb_claim_territory_v2', {p_user_id:account.id,p_lat:requestedLat,p_lng:requestedLng,p_accuracy:requestedAccuracy,p_kingdom_name:kingdomName});
      if(claimed.error){if(/cb_claim_territory_v2|schema cache|function/i.test(claimed.error.message))fail(503,'Run supabase/0016_three_kingdom_slots_decay.sql in Supabase, then try again.');fail(409,claimed.error.message);}
      const saved=await client.from('cb_territories').select('id,user_id,lat,lng,kingdom_name,defense_points').eq('id',claimed.data).eq('user_id',account.id).maybeSingle();
      if(saved.error)fail(500,saved.error.message);
      if(!saved.data)fail(500,'Your kingdom could not be named.');
      return res.status(200).json({ok:true,claimed:true,defense_points:Number(saved.data.defense_points??10),gold_cost:48,territory:saved.data});
    }
    if(action==='territory-name'){const territoryId=String(body.territory_id??''),kingdomName=String(body.kingdom_name??'').trim().replace(/\s+/g,' ');if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(territoryId))fail(400,'Choose a valid kingdom.');if(kingdomName.length<3||kingdomName.length>40)fail(400,'Kingdom name must be 3 to 40 characters.');const saved=await client.from('cb_territories').update({kingdom_name:kingdomName}).eq('id',territoryId).eq('user_id',account.id).select('id,user_id,lat,lng,kingdom_name').maybeSingle();if(saved.error)fail(500,saved.error.message);if(!saved.data)fail(403,'Only the kingdom owner can rename it.');return res.status(200).json({territory:{...saved.data,is_owner:true,display_name:account.profile.display_name}});}
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
    if (action === 'queue') return res.status(200).json(await queuedMatch(client, account, String(body.control ?? '')));
    if (action === 'cancel-queue') {
      const removed = await client.from('cb_match_queue').delete().eq('user_id', account.id).is('match_id', null);
      if (removed.error) fail(500, removed.error.message);
      return res.status(200).json({ ok: true });
    }
    if (action === 'room') {
      const control = String(body.control ?? ''), clock = tc(control), target = typeof body.target === 'string' ? body.target : null, publicChallenge = body.publicChallenge === true;
      const playMode = body.play_mode === 'wager' && (target || publicChallenge) ? 'wager' : 'normal';
      const wagerGold = playMode === 'wager' ? Number(body.wager_gold) : 0;
      if (playMode === 'wager' && (!Number.isInteger(wagerGold) || wagerGold < 1 || wagerGold > 10000)) fail(400, 'Choose a whole Gold wager from 1 to 10,000.');
      if (playMode === 'wager' && Number(account.profile.gold_points ?? 0) < wagerGold) fail(409, `You need ${wagerGold} Gold to create this wager.`);
      if (publicChallenge && target) fail(400, 'Choose one challenge audience.');
      const active = await client.from('cb_matches').select('id').eq('status', 'active').or(`white_id.eq.${account.id},black_id.eq.${account.id}`).limit(1); if (active.error) fail(500, active.error.message); if (active.data?.length) fail(409, 'Finish your current match first.');
      if (target) {
        const targetActive = await client.from('cb_matches').select('id').eq('status', 'active').or(`white_id.eq.${target},black_id.eq.${target}`).limit(1);
        if (targetActive.error) fail(500, targetActive.error.message);
        if (targetActive.data?.length) fail(409, 'This player is already in an active match.');
      }
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
      const unqueued = await client.from('cb_match_queue').delete().eq('user_id', account.id).is('match_id', null);
      if (unqueued.error) fail(500, unqueued.error.message);
      const match = one<any>(await client.from('cb_matches').insert({ host_id: account.id, white_id: account.id, invite_to: target, status: 'waiting', code: code(), control, white_ms: clock.seconds * 1000, black_ms: clock.seconds * 1000, last_tick: new Date().toISOString(), white_cbr: account.profile.cbr, play_mode: playMode, wager_gold: wagerGold, public_challenge: publicChallenge }).select('*').single());
      if (publicChallenge) { const event = await client.from('cb_feed').insert({ user_id: account.id, kind: 'challenge', display_name: account.profile.display_name, content: `is looking for a ${clock.group.toLowerCase()} challenge · ${clock.label}${playMode === 'wager' ? ` · Wager ${wagerGold} Gold` : ''}.`, challenge_match_id: match.id, expires_at: new Date(now() + 120000).toISOString() }); if (event.error) { await client.from('cb_matches').delete().eq('id', match.id); fail(500, event.error.message); } }
      console.info('arena.room-created', { matchId: match.id, publicChallenge });
      return res.status(200).json({ match: await matchView(client, match), challengePublished: publicChallenge });
    }
    if (action === 'accept-challenge') {
      const id = String(body.id ?? ''), match = await readMatch(client, id); if (match.white_id === account.id) fail(400, 'You cannot accept your own challenge.');
      if (match.status !== 'waiting' || match.invite_to || Date.parse(match.created_at) <= now() - 120000) fail(404, 'This challenge has expired or was accepted.');
      const event = await client.from('cb_feed').select('id').eq('challenge_match_id', id).eq('kind', 'challenge').gt('expires_at', new Date().toISOString()).maybeSingle(); if (event.error) fail(500, event.error.message); if (!event.data) fail(404, 'This challenge has expired or was accepted.');
      const changed = await client.rpc('cb_activate_gold_match', { p_match_id: id, p_acceptor_id: account.id }); if (changed.error) fail(/Gold|accepted|available/i.test(changed.error.message) ? 409 : 500, changed.error.message);
      const activeChallenge = Array.isArray(changed.data) ? changed.data[0] : changed.data; if (!activeChallenge) fail(409, 'This challenge was already accepted.');
      await client.from('cb_feed').update({ expires_at: new Date().toISOString() }).eq('id', event.data.id);
      const view = await matchView(client, activeChallenge);
      await client.from('cb_match_queue').delete().in('user_id', [match.white_id, account.id]);
      await broadcastMatch(view);
      return res.status(200).json({ match: view });
    }
    if (action === 'join') {
      const roomCode = String(body.code ?? '').trim().toUpperCase();
      const match = one<any>(await client.from('cb_matches').select('*').eq('code', roomCode).eq('status', 'waiting').maybeSingle());
      if (match.white_id === account.id) fail(400, 'You cannot join your own room.');
      if (match.invite_to && match.invite_to !== account.id) fail(403, 'This invitation belongs to another player.');
      if (Date.parse(match.created_at) <= now() - 120000) fail(410, 'This invitation has expired.');
      if (match.match_kind === 'invasion') {
        const accepted = await client.rpc('cb_accept_invasion', { p_match_id: match.id, p_owner_id: account.id });
        if (accepted.error) fail(/Gold|expired|changed|available/i.test(accepted.error.message) ? 409 : 500, accepted.error.message);
        const current = await readMatch(client, match.id);
        const view = await matchView(client, current);
        await broadcastMatch(view);
        return res.status(200).json({ match: view });
      }
      const changed = await client.rpc('cb_activate_gold_match', { p_match_id: match.id, p_acceptor_id: account.id });
      if (changed.error) fail(/Gold|accepted|available/i.test(changed.error.message) ? 409 : 500, changed.error.message);
      const activeRoom = Array.isArray(changed.data) ? changed.data[0] : changed.data;
      if (!activeRoom) fail(409, 'This room was already joined.');
      const view = await matchView(client, activeRoom);
      await client.from('cb_match_queue').delete().in('user_id', [match.white_id, account.id]);
      await broadcastMatch(view);
      return res.status(200).json({ match: view });
    }
    if (action === 'match') { const match = await readMatch(client, String(body.id ?? '')); if (!participant(match, account.id)) fail(403, 'This room is private.'); return res.status(200).json({ match: await matchView(client, match) }); }
    if (action === 'state') {
      const [r, pending] = await Promise.all([
        client.from('cb_matches').select('*').eq('status', 'active').or(`white_id.eq.${account.id},black_id.eq.${account.id}`).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        client.from('cb_matches').select('id,host_id,control,code,created_at,play_mode,wager_gold,match_kind').eq('status', 'waiting').eq('invite_to', account.id).gt('created_at', new Date(now() - 120000).toISOString()).order('created_at', { ascending: false }).limit(10),
      ]);
      if (r.error || pending.error) fail(500, r.error?.message ?? pending.error?.message ?? 'Unable to load match state.');
      const current = r.data ? await finishExpiredMatch(client, r.data) : null;
      const activeMatch = current?.status === 'active' ? current : null;
      const names = await playerMap(client, (pending.data ?? []).map((invite: any) => invite.host_id));
      return res.status(200).json({ match: activeMatch ? await matchView(client, activeMatch) : null, completed: current?.status === 'finished' ? await matchView(client, current) : null, invites: (pending.data ?? []).map((invite: any) => ({ ...invite, host_name: names.get(invite.host_id)?.display_name ?? 'A player' })), fair_play: { total_aborts: 0, cooldown_until: 0 } });
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
    if (action === 'reject-challenge') {
      const match = await readMatch(client, String(body.id ?? ''));
      if (!match.public_challenge || match.status !== 'waiting') fail(409, 'This feed challenge is no longer available.');
      return res.status(200).json({ ok: true, expires_at: new Date(Date.parse(match.created_at) + 120_000).toISOString() });
    }
    if (action === 'heart') { const id = String(body.id ?? ''); if (id.startsWith('challenge:')) return res.status(200).json({ ok: true }); const r = body.liked === true ? await client.from('cb_feed_reactions').upsert({ feed_id: id, user_id: account.id }, { onConflict: 'feed_id,user_id' }) : await client.from('cb_feed_reactions').delete().eq('feed_id', id).eq('user_id', account.id); if (r.error) fail(500, r.error.message); return res.status(200).json({ ok: true }); }
    if (action === 'hearts') { const r = await client.from('cb_feed_reactions').select('feed_id').eq('user_id', account.id); if (r.error) fail(500, r.error.message); return res.status(200).json({ ids: (r.data ?? []).map((row: any) => row.feed_id) }); }
    if (action === 'timeout') {
      const match = await readMatch(client, String(body.id ?? ''));
      if (![match.white_id, match.black_id].includes(account.id)) fail(403, 'Only players may update this match.');
      if (match.status !== 'active') return res.status(200).json({ match: await matchView(client, match) });
      const game = new Chess(); if (match.pgn) game.loadPgn(match.pgn);
      const whiteTurn = game.turn() === 'w';
      const checkedAt = now();
      const remaining = Number(whiteTurn ? match.white_ms : match.black_ms) - Math.max(0, checkedAt - Date.parse(match.last_tick));
      if (remaining > 0) fail(409, 'The clock is still running.');
      const patch = { status: 'finished', result: whiteTurn ? 'black' : 'white', version: Number(match.version) + 1, last_tick: new Date(checkedAt).toISOString(), [whiteTurn ? 'white_ms' : 'black_ms']: 0 };
      const changed = await client.from('cb_matches').update(patch).eq('id', match.id).eq('version', match.version).eq('status', 'active').select('*').maybeSingle();
      if (changed.error) fail(500, changed.error.message);
      if (!changed.data) return res.status(200).json({ match: await matchView(client, await readMatch(client, match.id)) });
      await settle(client, changed.data);
      const view = await matchView(client, await readMatch(client, match.id));
      await broadcastMatch(view);
      return res.status(200).json({ match: view });
    }
    if (action === 'move' || action === 'resign' || action === 'abort') {
      const match = await readMatch(client, String(body.id ?? '')); if (![match.white_id, match.black_id].includes(account.id)) fail(403, 'Only players may update this match.'); if (Number(body.version) !== Number(match.version)) fail(409, 'The board changed. Please try again.');
      const actionAt = now();
      let patch: Record<string, unknown> = { version: Number(match.version) + 1, last_tick: new Date(actionAt).toISOString() };
      if (match.status !== 'active') fail(409, 'This match is no longer active.');
      if (action === 'abort') patch = { ...patch, status: 'cancelled', result: null }; else if (action === 'resign') patch = { ...patch, status: 'finished', result: account.id === match.white_id ? 'black' : 'white' }; else {
        const game = new Chess(); if (match.pgn) game.loadPgn(match.pgn);
        const whiteTurn = game.turn() === 'w';
        if ((whiteTurn ? match.white_id : match.black_id) !== account.id) fail(409, 'Wait for your opponent.');
        const remaining = Number(whiteTurn ? match.white_ms : match.black_ms) - Math.max(0, actionAt - Date.parse(match.last_tick));
        if (remaining <= 0) patch = { ...patch, status: 'finished', result: whiteTurn ? 'black' : 'white', [whiteTurn ? 'white_ms' : 'black_ms']: 0 };
        else {
          try { game.move(body.move); } catch { fail(400, 'That move is not legal.'); }
          const ended = result(game), incrementMs = tc(match.control).increment * 1000;
          patch = { ...patch, pgn: game.pgn(), [whiteTurn ? 'white_ms' : 'black_ms']: remaining + incrementMs, ...(ended ? { status: 'finished', result: ended } : {}) };
        }
      }
      const changed = await client.from('cb_matches').update(patch).eq('id', match.id).eq('version', match.version).select('*').maybeSingle();
      if (changed.error) fail(500, changed.error.message);
      if (!changed.data) fail(409, 'The board changed. Please try again.');
      await settle(client, changed.data);
      const view = await matchView(client, await readMatch(client, match.id));
      await broadcastMatch(view);
      return res.status(200).json({ match: view, fair_play: { total_aborts: 0, cooldown_until: 0 } });
    }
    if (action === 'react') {
      const match = await readMatch(client, String(body.id ?? ''));
      if (!participant(match, account.id)) fail(403, 'This room is private.');
      const reactions = Array.isArray(match.reactions) ? match.reactions : [];
      reactions.push({ emote: String(body.emote ?? '').slice(0, 8), at: now() });
      const changed = one<any>(await client.from('cb_matches').update({ reactions, version: Number(match.version) + 1 }).eq('id', match.id).eq('version', match.version).select('*').maybeSingle());
      const view = await matchView(client, changed);
      await broadcastMatch(view);
      return res.status(200).json({ match: view });
    }
    fail(404, 'This game action is not available during the migration.');
  } catch (error) {
    const matchFailure = error instanceof Error && error.name === 'MatchActionError' && typeof (error as any).status === 'number';
    const known = error instanceof ApiError
      ? error
      : matchFailure
        ? new ApiError((error as any).status, error.message)
        : new ApiError(500, 'The game service could not complete this request. Please try again.');
    console.error('arena.failed', { action, status: known.status, message: known.message, stack: error instanceof Error ? error.stack : String(error) });
    return res.status(known.status).json({ error: known.message });
  }
}
