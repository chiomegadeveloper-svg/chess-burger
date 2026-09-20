"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { arena, ArenaRequestError } from './arena-client-v46';
import { gameFromPgn, type ArenaMatch } from './game-rules';
import { type BoardMove, type OfferKind } from './match-actions';
import { MatchSync } from './match-sync';
import { getSupabase, type PlayerProfile } from './supabase';
import { saveGame } from './game-history';
import MatchBoard from './match-board';
import MatchRequests from './match-requests';

type Props = { id: string; profile: PlayerProfile | null; onFinished: (match: ArenaMatch) => void; watch?: boolean };
export default function OnlineGame(props: Props) {
  return <LiveGame key={`${props.id}:${props.profile?.user_id}:${!!props.watch}`} {...props} />;
}
function LiveGame({ id, profile, onFinished, watch = false }: Props) {
  const [sync] = useState(() => new MatchSync(id, watch ? undefined : profile?.user_id));
  const { match, confirmed, pending, error } = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  const [live, setLive] = useState(false), [actionBusy, setActionBusy] = useState(false);
  const [premove, setPremove] = useState<BoardMove | null>(null);
  const mounted = useRef(false), reading = useRef<Promise<void> | null>(null), actionLock = useRef(false);
  const channel = useRef<RealtimeChannel | null>(null), finished = useRef(false);
  const lastTakeback = useRef<string | null>(null);
  const refresh = useCallback(() => {
    if (reading.current) return reading.current;
    const read = async () => {
      try {
        const response = await arena<{ match: ArenaMatch }>(watch ? 'watch' : 'match',
          { id, compact: !!sync.getSnapshot().confirmed?.white }, watch);
        if (mounted.current) sync.accept(response.match);
      } catch (e) { if (mounted.current) sync.setError((e as Error).message); }
      finally { reading.current = null; }
    };
    reading.current = read();
    return reading.current;
  }, [id, sync, watch]);
  const hint = useCallback(() => {
    // Public broadcasts are untrusted hints, never authoritative boards.
    void channel.current?.send({ type: 'broadcast', event: 'match-updated', payload: { id } });
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    window.addEventListener('focus', visible);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible); window.removeEventListener('focus', visible); };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    let current: RealtimeChannel | null = null;
    void getSupabase().then(client => {
      if (!client || !active) return;
      current = client.channel(`cb-match:${id}`, { config: { broadcast: { self: false } } })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cb_matches', filter: `id=eq.${id}` }, event => {
          if (active) sync.accept(event.new);
        })
        .on('broadcast', { event: 'match-updated' }, () => { if (active) void refresh(); })
        .subscribe(status => {
          if (!active) return;
          setLive(status === 'SUBSCRIBED');
          if (status === 'SUBSCRIBED') void refresh();
        });
      channel.current = current;
    }).catch(() => { if (active) setLive(false); });
    return () => { active = false; if (channel.current === current) channel.current = null; void current?.unsubscribe(); };
  }, [id, refresh, sync]);
  useEffect(() => {
    if (confirmed && !['active', 'waiting'].includes(confirmed.status) && confirmed.rating_applied) return;
    // Recovery only: no move waits for this interval before appearing locally.
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, live && !watch ? 5000 : 1000);
    return () => clearInterval(timer);
  }, [live, watch, refresh, confirmed?.status, confirmed?.rating_applied]);
  const move = useCallback(async (value: BoardMove) => {
    if (watch) return;
    const request = sync.begin(value, crypto.randomUUID());
    if (!request) return;
    // Publish the piece synchronously, before auth/session/network work starts.
    try {
      const response = await arena<{ match: ArenaMatch }>('move', { id, version: request.before.version,
        base_pgn: request.before.pgn, request_id: request.id, move: value });
      if (!mounted.current) return;
      sync.accept(response.match);
      hint();
    } catch (e) {
      if (!mounted.current || sync.getSnapshot().pending?.id !== request.id) return;
      if (!(e instanceof ArenaRequestError) || e.status >= 500) {
        // A lost reply is not proof of failure: first check the saved position.
        sync.setError('Connection interrupted. Checking the saved position…');
        await refresh();
      }
      sync.reject(request.id, (e as Error).message);
      void refresh();
    }
  }, [id, hint, refresh, sync, watch]);
  const action = useCallback(async (name: string, body: Record<string, unknown> = {}) => {
    const state = sync.getSnapshot();
    if (watch || actionLock.current || state.pending || !state.confirmed) return;
    actionLock.current = true; setActionBusy(true);
    try {
      const response = await arena<{ match: ArenaMatch }>(name, { id, version: state.confirmed.version, ...body });
      if (mounted.current) { sync.accept(response.match); hint(); }
    } catch (e) {
      if (mounted.current) { sync.setError((e as Error).message); void refresh(); }
    } finally { actionLock.current = false; if (mounted.current) setActionBusy(false); }
  }, [id, hint, refresh, sync, watch]);
  useEffect(() => {
    const decision = confirmed?.game_meta?.last;
    if (decision?.kind === 'takeback' && decision.outcome === 'accepted' && decision.id !== lastTakeback.current) {
      lastTakeback.current = decision.id; setPremove(null); return;
    }
    if (!confirmed || !premove || pending || watch) return;
    const game = gameFromPgn(confirmed.pgn);
    if (confirmed.status !== 'active' || (game.turn() === 'w' ? confirmed.white_id : confirmed.black_id) !== profile?.user_id) return;
    setPremove(null);
    void move(premove);
  }, [confirmed, premove, pending, actionBusy, watch, profile?.user_id, move]);
  useEffect(() => {
    if (!confirmed || confirmed.status !== 'active' || pending || actionBusy || watch) return;
    const game = gameFromPgn(confirmed.pgn), white = game.turn() === 'w';
    const remaining = (white ? confirmed.white_ms : confirmed.black_ms) - Math.max(0, Number(confirmed.server_now ?? Date.now()) - confirmed.last_tick);
    const timer = setTimeout(() => void action('timeout'), Math.max(50, remaining + 80));
    return () => clearTimeout(timer);
  }, [confirmed, pending, actionBusy, watch, action]);
  useEffect(() => {
    if (!confirmed || confirmed.status !== 'finished' || !confirmed.rating_applied || finished.current || watch) return;
    finished.current = true;
    try { saveGame({ id: confirmed.id, white: confirmed.white?.display_name ?? 'White', black: confirmed.black?.display_name ?? 'Black',
      pgn: confirmed.pgn, score: confirmed.result === 'draw' ? '½–½' : confirmed.result === 'white' ? '1–0' : '0–1',
      startedAt: new Date(confirmed.created_at).toISOString(), updatedAt: new Date().toISOString(), ratedAt: new Date().toISOString() }); } catch {}
    onFinished(confirmed);
  }, [confirmed, onFinished, watch]);
  if (!match) return <p className="cloud-panel" role="status">{error || 'Opening your board…'}</p>;
  return <>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <MatchBoard match={match} ownId={profile?.user_id} onMove={watch ? undefined : value => void move(value)}
      premove={premove} onPremove={watch ? undefined : setPremove}
      onResign={watch ? undefined : () => void action('resign')} onAbort={watch ? undefined : () => void action('abort')}
      onReact={watch ? undefined : async emote => { const response = await arena<{match:ArenaMatch}>('react', {id, emote}); if (mounted.current) { sync.accept(response.match); hint(); } }}
      connection={error ? 'Reconnecting…' : pending ? 'Syncing move…' : watch ? 'Spectating' : live ? 'Live · v46' : 'Connecting · v46'}
      matchActions={!watch && confirmed && profile?.user_id ? <div className="match-requests-top"><MatchRequests match={confirmed} ownId={profile.user_id}
        disabled={!!pending || actionBusy} onOffer={(kind: OfferKind) => void action('offer', { kind, request_id: crypto.randomUUID() })}
        onRespond={(request_id, accept) => { setPremove(null); void action('respond-offer', { request_id, accept }); }} /></div> : undefined}
    />
  </>;
}
