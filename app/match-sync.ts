import { gameFromPgn, timeControl, type ArenaMatch } from './game-rules.ts';
import type { BoardMove } from './match-actions.ts';

export type PendingMove = { id: string; before: ArenaMatch; preview: ArenaMatch; move: BoardMove };
export type MatchSnapshot = { match: ArenaMatch | null; confirmed: ArenaMatch | null; pending: PendingMove | null; error: string };
const timestamp = (value: unknown) => typeof value === 'number' ? value : Date.parse(String(value));
export function normalizeMatch(row: ArenaMatch | Record<string, unknown>, previous?: ArenaMatch | null, receivedAt = Date.now()): ArenaMatch {
  return { ...previous, ...row, version: Number(row.version),
    created_at: timestamp(row.created_at), last_tick: timestamp(row.last_tick),
    white_ms: Number(row.white_ms), black_ms: Number(row.black_ms),
    rating_applied: row.rating_applied ? 1 : 0,
    reactions: typeof row.reactions === 'string' ? row.reactions : JSON.stringify(row.reactions ?? {}),
    server_now: Number(row.server_now ?? receivedAt),
    white: row.white ?? previous?.white, black: row.black ?? previous?.black,
  } as ArenaMatch;
}

/** Confirmed board and local preview stay separate. A delayed reply cannot
 * invent a version or roll a piece back after a later committed update. */
export class MatchSync {
  private state: MatchSnapshot = { match: null, confirmed: null, pending: null, error: '' };
  private receivedAt = 0;
  private listeners = new Set<() => void>();
  readonly id: string;
  readonly ownId?: string;
  constructor(id: string, ownId?: string) { this.id = id; this.ownId = ownId; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: MatchSnapshot) { this.state = state; for (const listener of this.listeners) listener(); }
  setError(error: string) { this.publish({ ...this.state, error }); }
  accept(row: ArenaMatch | Record<string, unknown>, at = Date.now()) {
    const old = this.state.confirmed;
    if (row.id !== this.id || !Number.isInteger(Number(row.version)) || (old && Number(row.version) < old.version)) return false;
    const serverNow = row.server_now ?? (old ? Number(old.server_now ?? this.receivedAt) + at - this.receivedAt : at);
    const confirmed = normalizeMatch({ ...row, server_now: serverNow }, old, at);
    let pending = this.state.pending;
    if (pending && (confirmed.status !== 'active' || confirmed.game_meta?.move_ids?.includes(pending.id)
      || confirmed.pgn !== pending.before.pgn)) pending = null;
    this.receivedAt = at;
    this.publish({ confirmed, pending, error: '', match: pending
      ? { ...confirmed, ...pending.preview, version: confirmed.version, game_meta: confirmed.game_meta, reactions: confirmed.reactions }
      : confirmed });
    return true;
  }
  begin(move: BoardMove, id: string, at = Date.now()): PendingMove | null {
    const before = this.state.confirmed;
    if (!before || this.state.pending || before.status !== 'active' || !this.ownId) return null;
    const game = gameFromPgn(before.pgn), whiteTurn = game.turn() === 'w';
    if ((whiteTurn ? before.white_id : before.black_id) !== this.ownId) return null;
    try { game.move({ ...move, promotion: move.promotion ?? 'q' }); }
    catch { this.setError('That move is not legal in the current position.'); return null; }
    const serverNow = Number(before.server_now ?? this.receivedAt) + Math.max(0, at - this.receivedAt);
    const elapsed = Math.max(0, serverNow - before.last_tick), increment = timeControl(before.control).increment * 1000;
    const preview: ArenaMatch = { ...before, pgn: game.pgn(),
      white_ms: whiteTurn ? Math.max(0, before.white_ms - elapsed) + increment : before.white_ms,
      black_ms: whiteTurn ? before.black_ms : Math.max(0, before.black_ms - elapsed) + increment,
      last_tick: serverNow, server_now: serverNow, status: 'active', result: null };
    const pending = { id, before, preview, move };
    this.publish({ ...this.state, pending, match: preview, error: '' });
    return pending;
  }
  reject(id: string, error: string) {
    if (this.state.pending?.id !== id) return;
    this.publish({ ...this.state, pending: null, match: this.state.confirmed, error });
  }
}
