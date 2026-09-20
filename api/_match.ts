import type { SupabaseClient } from '@supabase/supabase-js';
import { applyMatchAction, MatchActionError } from '../app/match-actions.ts';
import type { ArenaMatch } from '../app/game-rules.ts';

export const FAST_MATCH_ACTIONS = new Set(['match', 'move', 'resign', 'abort', 'timeout', 'offer', 'respond-offer']);
type Request = { headers: Record<string, string | string[] | undefined> };
type Body = Record<string, unknown>;
type Row = Record<string, any>;
function check(error: { message: string } | null) {
  if (error) throw new MatchActionError(/game_meta/.test(error.message)
    ? 'The gameplay upgrade needs supabase/0014_gameplay_v46.sql. Ask the owner to apply that non-destructive migration.'
    : error.message, 500);
}
function stamp(value: string | number) { return typeof value === 'number' ? value : Date.parse(value); }
function view(row: Row): ArenaMatch {
  return { ...row, version: Number(row.version), created_at: stamp(row.created_at), last_tick: stamp(row.last_tick),
    white_ms: Number(row.white_ms), black_ms: Number(row.black_ms), rating_applied: row.rating_applied ? 1 : 0,
    reactions: typeof row.reactions === 'string' ? row.reactions : JSON.stringify(row.reactions ?? {}),
    game_meta: row.game_meta ?? {}, server_now: Date.now() } as ArenaMatch;
}

/** Two network stages for a normal move: auth+read in parallel, then one CAS write.
 * The committed update goes to both players through Postgres Realtime. No HTTP
 * broadcast, duplicate SELECT, or profile hydration blocks the move response.
 */
export async function fastMatchAction(client: SupabaseClient, req: Request, action: string, body: Body,
  settle: (client: SupabaseClient, row: Row) => Promise<void>) {
  const startedAt = Date.now();
  const header = req.headers.authorization;
  const token = (Array.isArray(header) ? header[0] : header ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new MatchActionError('Please sign in again.', 401);
  const id = String(body.id ?? '');
  if (!/^[\w-]{1,80}$/.test(id)) throw new MatchActionError('Invalid match.', 400);
  const [auth, found] = await Promise.all([
    client.auth.getUser(token),
    client.from('cb_matches').select('*').eq('id', id).maybeSingle(),
  ]);
  if (auth.error || !auth.data.user) throw new MatchActionError('Please sign in again.', 401);
  check(found.error);
  if (!found.data) throw new MatchActionError('This match is no longer available.', 404);
  const actor = auth.data.user.id;
  if (![found.data.white_id, found.data.black_id].includes(actor)) throw new MatchActionError('Only the two players may access this match.', 403);
  let row: Row = found.data;
  if (action === 'match') {
    const match = view(row);
    if (!body.compact) {
      const people = await client.from('cb_profiles')
        .select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak')
        .in('user_id', [row.white_id, row.black_id].filter(Boolean));
      check(people.error);
      match.white = people.data?.find(player => player.user_id === row.white_id);
      match.black = people.data?.find(player => player.user_id === row.black_id);
    }
    return { match };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = view(row);
    // A move is timed at server arrival, not after backend round trips. Other
    // decisions use current server time and cannot revive an expired clock.
    const at = action === 'move' ? Math.max(startedAt, current.last_tick) : Date.now();
    const next = applyMatchAction(current, actor, action, body, at);
    if (next === current) return { match: current }; // duplicate request; no counter or move applied twice
    const patch = { pgn: next.pgn, white_ms: next.white_ms, black_ms: next.black_ms,
      last_tick: new Date(next.last_tick).toISOString(), status: next.status,
      result: next.result, version: next.version, game_meta: next.game_meta };
    const changed = await client.from('cb_matches').update(patch).eq('id', id)
      .eq('version', row.version).eq('status', 'active').select('*').maybeSingle();
    check(changed.error);
    if (changed.data) {
      row = changed.data;
      if (row.status === 'finished') {
        await settle(client, row);
        const rated = await client.from('cb_matches').select('*').eq('id', id).single();
        check(rated.error);
        row = rated.data;
      }
      console.info('arena.match-timing', { action, matchId: id, version: row.version,
        elapsed_ms: Date.now() - startedAt, cas_retries: attempt });
      return { match: view(row) };
    }
    // A reaction/request can race a move. Retry only after re-reading and
    // revalidating the entire action; a changed PGN is never blindly retried.
    const latest = await client.from('cb_matches').select('*').eq('id', id).single();
    check(latest.error);
    row = latest.data;
  }
  throw new MatchActionError('The match changed. Please retry your action.');
}
