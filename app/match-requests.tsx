"use client";
import { useEffect, useState } from 'react';
import { Handshake, Undo2 } from 'lucide-react';
import { gameFromPgn, type ArenaMatch } from './game-rules';
import { remainingRequests, type OfferKind } from './match-actions';
export default function MatchRequests({ match, ownId, disabled, onOffer, onRespond }: {
  match: ArenaMatch; ownId: string; disabled: boolean;
  onOffer: (kind: OfferKind) => void; onRespond: (id: string, accept: boolean) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const candidate = match.game_meta?.pending;
  useEffect(() => {
    if (!candidate) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [candidate?.id]);
  if (match.status !== 'active' || ![match.white_id, match.black_id].includes(ownId)) return null;
  const pending = candidate && candidate.expires_at > now ? candidate : null;
  const takebacks = remainingRequests(match, ownId, 'takeback'), draws = remainingRequests(match, ownId, 'draw');
  const color = ownId === match.white_id ? 'w' : 'b';
  const canUndo = gameFromPgn(match.pgn).history({ verbose: true }).some(move => move.color === color);
  const last = match.game_meta?.last;
  return <section className="match-requests" aria-label="Match agreements">
    <div className="match-request-buttons">
      <button type="button" disabled={disabled || !!pending || !takebacks || !canUndo} onClick={() => onOffer('takeback')}>
        <Undo2 size={15} />Take back <small>{takebacks}/3 left</small>
      </button>
      <button type="button" disabled={disabled || !!pending || !draws} onClick={() => onOffer('draw')}>
        <Handshake size={15} />Offer draw <small>{draws}/3 left</small>
      </button>
    </div>
    {pending ? <div className="match-offer" role="status">
      <strong>{pending.by === ownId ? 'Waiting for your opponent' : pending.kind === 'draw' ? 'Your opponent offers a draw' : 'Your opponent requests a takeback'}</strong>
      <p>{pending.kind === 'takeback' ? 'Undo the requester’s last move and your reply, if played. Used time is not refunded.' : 'Accept to end this game as a draw.'}</p>
      {pending.by !== ownId && <div className="match-offer-actions">
        <button type="button" disabled={disabled} onClick={() => onRespond(pending.id, true)}>Accept {pending.kind}</button>
        <button type="button" disabled={disabled} onClick={() => onRespond(pending.id, false)}>Decline</button>
      </div>}
      <small>Expires in {Math.max(0, Math.ceil((pending.expires_at - now) / 1000))}s. The chess clocks keep running.</small>
    </div> : last ? <p role="status" className="match-offer-result">{last.kind === 'draw' ? 'Draw offer' : 'Takeback'} {last.outcome === 'position-changed' ? 'expired because a move was played' : last.outcome}.</p> : null}
    <p className="rules-caption">3 requests of each type per player, per match. Declined and expired requests count too.</p>
  </section>;
}
