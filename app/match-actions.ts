import { boardResult, gameFromPgn, timeControl, type ArenaMatch } from './game-rules';

export const REQUEST_LIMIT = 3;
export const OFFER_LIFETIME_MS = 30_000;
export type BoardMove = { from: string; to: string; promotion?: string };
export type OfferKind = 'takeback' | 'draw';
export type MatchOffer = {
  id: string; kind: OfferKind; by: string; at: number; expires_at: number;
  pgn: string; plies: number;
};
export type GameMeta = {
  requests?: Record<string, { takeback: number; draw: number }>;
  pending?: MatchOffer | null;
  last?: { id: string; kind: OfferKind; by: string; outcome: 'accepted' | 'declined' | 'expired' | 'position-changed' };
  request_ids?: string[];
  move_ids?: string[];
};
export class MatchActionError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
const reject = (message: string, status = 409): never => { throw new MatchActionError(message, status); };
export function remainingRequests(match: ArenaMatch, actor: string, kind: OfferKind) {
  return Math.max(0, REQUEST_LIMIT - (match.game_meta?.requests?.[actor]?.[kind] ?? 0));
}
export function clearOffer(meta: GameMeta, outcome: 'expired' | 'position-changed'): GameMeta {
  if (!meta.pending) return meta;
  const { id, kind, by } = meta.pending;
  return { ...meta, pending: null, last: { id, kind, by, outcome } };
}
function requirePlayer(match: ArenaMatch, actor: string) {
  if (!actor || ![match.white_id, match.black_id].includes(actor)) reject('Only the two players may update this match.', 403);
}
function active(match: ArenaMatch) {
  if (match.status !== 'active') reject('This match is no longer active.');
}
function clockAt(match: ArenaMatch, at: number) {
  const game = gameFromPgn(match.pgn), whiteTurn = game.turn() === 'w';
  const elapsed = Math.max(0, at - match.last_tick);
  const white_ms = Math.max(0, match.white_ms - (whiteTurn ? elapsed : 0));
  const black_ms = Math.max(0, match.black_ms - (whiteTurn ? 0 : elapsed));
  return { game, whiteTurn, white_ms, black_ms, expired: (whiteTurn ? white_ms : black_ms) <= 0 };
}
function flag(match: ArenaMatch, at: number): ArenaMatch | null {
  const c = clockAt(match, at);
  if (!c.expired) return null;
  return { ...match, white_ms: c.white_ms, black_ms: c.black_ms, last_tick: at, server_now: at,
    status: 'finished', result: c.game.isInsufficientMaterial() ? 'draw' : c.whiteTurn ? 'black' : 'white',
    version: match.version + 1, game_meta: clearOffer(match.game_meta ?? {}, 'expired') };
}

/** Pure server rules, shared by the local tests. Never trust clocks, PGN, or counters from clients. */
export function applyMatchAction(match: ArenaMatch, actor: string, action: string, input: Record<string, unknown>, at: number): ArenaMatch {
  requirePlayer(match, actor);
  const meta = match.game_meta ?? {};
  if (action === 'move' && typeof input.request_id === 'string' && meta.move_ids?.includes(input.request_id)) return match;
  if (action === 'offer' && typeof input.request_id === 'string' && meta.request_ids?.includes(input.request_id)) return match;
  active(match);
  const expired = flag(match, at);
  if (expired) return expired;
  const c = clockAt(match, at);
  const next = { ...match, version: match.version + 1, server_now: at };
  const pending = meta.pending && meta.pending.expires_at > at ? meta.pending : null;
  const currentMeta = meta.pending && !pending ? clearOffer(meta, 'expired') : meta;
  if (action === 'timeout') reject('The clock is still running.');
  if (action === 'move') {
    if ((c.whiteTurn ? match.white_id : match.black_id) !== actor) reject('Wait for your opponent.', 403);
    // Metadata updates do not invalidate a move from the same position.
    if (typeof input.base_pgn === 'string' ? input.base_pgn !== match.pgn : Number(input.version) !== match.version)
      reject('The board changed. Please try your move again.');
    const move = input.move as BoardMove | undefined;
    if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') reject('Choose a legal move.', 400);
    try { c.game.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' }); }
    catch { reject('That move is not legal.', 400); }
    const increment = timeControl(match.control).increment * 1000, result = boardResult(c.game);
    const moveIds = [...(meta.move_ids ?? [])];
    if (typeof input.request_id === 'string' && input.request_id.length <= 80) moveIds.push(input.request_id);
    return { ...next, pgn: c.game.pgn(), white_ms: c.white_ms + (c.whiteTurn ? increment : 0),
      black_ms: c.black_ms + (c.whiteTurn ? 0 : increment), last_tick: at,
      status: result ? 'finished' : 'active', result,
      game_meta: { ...clearOffer(currentMeta, 'position-changed'), move_ids: moveIds } };
  }
  if (action === 'resign' || action === 'abort') return { ...next, white_ms: c.white_ms, black_ms: c.black_ms,
    last_tick: at, status: action === 'abort' ? 'cancelled' : 'finished',
    result: action === 'abort' ? null : actor === match.white_id ? 'black' : 'white',
    game_meta: clearOffer(currentMeta, 'position-changed') };
  if (action === 'offer') {
    const kind = input.kind as OfferKind, id = input.request_id;
    if (!['takeback', 'draw'].includes(kind) || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(id)) reject('Invalid match request.', 400);
    if (pending) reject('Answer the pending request first.');
    if (!remainingRequests(match, actor, kind)) reject(`You have used all 3 ${kind === 'draw' ? 'draw offers' : 'takeback requests'} in this match.`);
    let plies = 0;
    if (kind === 'takeback') {
      const history = c.game.history({ verbose: true });
      const color = actor === match.white_id ? 'w' : 'b';
      const ownLast = history.findLastIndex(move => move.color === color);
      if (ownLast < 0) reject('You have not made a move to take back.');
      plies = history.length - ownLast;
    }
    const used = currentMeta.requests?.[actor] ?? { takeback: 0, draw: 0 };
    return { ...next, game_meta: { ...currentMeta,
      requests: { ...currentMeta.requests, [actor]: { ...used, [kind]: used[kind] + 1 } },
      request_ids: [...(currentMeta.request_ids ?? []), id],
      pending: { id, kind, by: actor, at, expires_at: at + OFFER_LIFETIME_MS, pgn: match.pgn, plies } } };
  }
  if (action === 'respond-offer') {
    if (!pending || pending.id !== input.request_id) reject('This request expired or was already answered.');
    if (pending.by === actor) reject('Only your opponent can approve or decline your request.', 403);
    if (typeof input.accept !== 'boolean') reject('Choose Accept or Decline.', 400);
    if (pending.pgn !== match.pgn) reject('The position changed. This request is no longer valid.');
    const game_meta: GameMeta = { ...currentMeta, pending: null,
      last: { id: pending.id, kind: pending.kind, by: pending.by, outcome: input.accept ? 'accepted' : 'declined' } };
    if (!input.accept) return { ...next, game_meta };
    if (pending.kind === 'draw') return { ...next, game_meta, status: 'finished', result: 'draw',
      white_ms: c.white_ms, black_ms: c.black_ms, last_tick: at };
    let { white_ms, black_ms } = c;
    const increment = timeControl(match.control).increment * 1000;
    for (let index = 0; index < pending.plies; index++) {
      const undone = c.game.undo();
      if (!undone) reject('There is no move to take back.');
      // Do not refund thinking time or allow farming increment by takebacks.
      if (undone.color === 'w') white_ms = Math.max(0, white_ms - increment);
      else black_ms = Math.max(0, black_ms - increment);
    }
    const restored = { ...next, game_meta, pgn: c.game.pgn(), white_ms, black_ms, last_tick: at };
    return flag(restored, at) ?? restored;
  }
  reject('Unknown match action.', 400);
}
