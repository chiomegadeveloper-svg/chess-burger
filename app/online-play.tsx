"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Search, Copy, X } from "lucide-react";
import { arena } from "./arena-client";
import {
  TIME_CONTROLS,
  gameFromPgn,
  type ArenaMatch,
  type ArenaPlayer,
  timeControl,
} from "./game-rules";
import type { PlayerProfile } from "./supabase";
import { getSupabase } from "./supabase";
import TimePicker from "./time-picker";
import MatchBoard, { Avatar } from "./match-board";
import QrInput from "./qr-input";
import { saveGame } from "./game-history";
export function OnlineGame({
  id,
  profile,
  onFinished,
  watch = false,
}: {
  id: string;
  profile: PlayerProfile | null;
  onFinished: (match: ArenaMatch) => void;
  watch?: boolean;
}) {
  const [match, setMatch] = useState<ArenaMatch | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(false),
    [premove, setPremove] = useState<{
      from: string;
      to: string;
      promotion?: string;
    } | null>(null),
    [fairPlayNotice, setFairPlayNotice] = useState("");
  const finished = useRef(false),
    alive = useRef(true),
    latest = useRef(0),
    channel = useRef<any>(null),
    refresh = useRef<() => void>(() => {});
  function accept(m: ArenaMatch) {
    if (!alive.current || m.version < latest.current) return;
    latest.current = m.version;
    setMatch(m);
    setError("");
    if (m.status === "finished" && !finished.current) {
      finished.current = true;
      if (!watch) {
        try {
          saveGame({
            id: m.id,
            white: m.white?.display_name ?? "White",
            black: m.black?.display_name ?? "Black",
            pgn: m.pgn,
            score:
              m.result === "draw"
                ? "½–½"
                : m.result === "white"
                  ? "1–0"
                  : "0–1",
            startedAt: new Date(m.created_at).toISOString(),
            updatedAt: new Date().toISOString(),
            ratedAt: new Date().toISOString(),
          });
        } catch {}
        onFinished(m);
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const r = await arena<{ match: ArenaMatch }>(
          watch ? "watch" : "match",
          { id },
          watch,
        );
        accept(r.match);
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      } finally {
        pending = false;
      }
    };
    refresh.current = () => void poll();
    void poll();
    // Realtime broadcasts wake this authoritative read immediately. Polling is
    // retained only as a quiet recovery path when the channel is unavailable.
    const timer = setInterval(poll, live ? 8000 : 750);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [id, watch, live]);
  useEffect(() => {
    let active = true;
    setLive(false);
    void getSupabase()
      .then((client) => {
        if (!client || !active) return;
        const next = client
          .channel(`cb-match:${id}`, {
            config: { broadcast: { self: false, ack: true } },
          })
          .on("broadcast", { event: "match-updated" }, () => refresh.current())
          .subscribe((status) => {
            if (active) setLive(status === "SUBSCRIBED");
          });
        channel.current = next;
      })
      .catch(() => {
        if (active) setLive(false);
      });
    return () => {
      active = false;
      const current = channel.current;
      channel.current = null;
      if (current) void current.unsubscribe();
    };
  }, [id]);
  function announce() {
    void channel.current?.send({
      type: "broadcast",
      event: "match-updated",
      payload: { id },
    });
  }
  async function move(
    action: "move" | "resign" | "abort",
    move?: { from: string; to: string; promotion?: string },
  ) {
    if (!match || busy) return;
    const confirmed = match;
    setBusy(true);
    if (action === "move" && move) {
      try {
        const game = gameFromPgn(match.pgn);
        game.move(move);
        latest.current = match.version + 0.5;
        setMatch({ ...match, pgn: game.pgn() });
      } catch {}
    }
    try {
      const r = await arena<{
        match: ArenaMatch;
        fair_play?: { cooldown_until: number; total_aborts: number };
      }>(action, {
        id,
        version: confirmed.version,
        move,
      });
      accept(r.match);
      if (action === "abort") {
        const until = r.fair_play?.cooldown_until ?? 0;
        if (until > Date.now()) {
          const wait = Math.max(1, Math.ceil((until - Date.now()) / 1000));
          setFairPlayNotice(`Fair-play cooldown: you aborted 5 matches. You can play again in ${wait} seconds.`);
          window.setTimeout(
            () => setFairPlayNotice("Cooldown complete. To be fair to other players, please finish the matches you start."),
            until - Date.now() + 100,
          );
        } else {
          setFairPlayNotice("Match aborted. No CBR, Gold, or EXP was awarded to either player.");
        }
      }
      announce();
    } catch (e) {
      latest.current = confirmed.version;
      setMatch(confirmed);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function react(emote: string) {
    const response = await arena<{ match: ArenaMatch }>("react", { id, emote });
    accept(response.match);
    announce();
  }
  useEffect(() => {
    if (!match || !premove || busy || watch || !profile?.user_id) return;
    const game = gameFromPgn(match.pgn),
      myTurn =
        (game.turn() === "w" && match.white_id === profile.user_id) ||
        (game.turn() === "b" && match.black_id === profile.user_id);
    if (!myTurn || match.status !== "active") return;
    const queued = premove;
    setPremove(null);
    void move("move", queued);
  }, [match?.version, premove, busy, watch, profile?.user_id]);
  if (!match)
    return (
      <p className="cloud-panel" role="status">
        {error || "Opening your board…"}
      </p>
    );
  return (
    <>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {fairPlayNotice && (
        <div className="fair-play-popup" role="status">
          <strong>Fair play</strong>
          <p>{fairPlayNotice}</p>
          <button type="button" onClick={() => setFairPlayNotice("")}>Okay</button>
        </div>
      )}
      <MatchBoard
        match={match}
        ownId={profile?.user_id}
        onMove={watch ? undefined : (m) => void move("move", m)}
        premove={premove}
        onPremove={
          watch
            ? undefined
            : (queued) => {
                setPremove(queued);
              }
        }
        onResign={watch ? undefined : () => void move("resign")}
        onAbort={watch ? undefined : () => void move("abort")}
        onReact={watch ? undefined : react}
        busy={busy}
        connection={
          error
            ? "Reconnecting…"
            : watch
              ? "Spectating"
              : live
                ? "Live"
                : "Polling backup"
        }
      />
    </>
  );
}
export default function OnlinePlay({
  profile,
  onMatch,
  onLogin,
  target,
  challenge = false,
}: {
  profile: PlayerProfile | null;
  onMatch: (id: string) => void;
  onLogin: () => void;
  target?: ArenaPlayer | null;
  challenge?: boolean;
}) {
  const [control, setControl] = useState("10+0"),
    [searching, setSearching] = useState(false),
    [room, setRoom] = useState<ArenaMatch | null>(null),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<ArenaPlayer[]>([]),
    [selected, setSelected] = useState<ArenaPlayer | null>(target ?? null),
    [audience, setAudience] = useState<"username" | "anyone" | null>(target ? "username" : null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const cancelled = useRef(false),
    callback = useRef(onMatch);
  callback.current = onMatch;
  useEffect(() => {
    if (target) { setSelected(target); setAudience("username"); }
  }, [target?.user_id]);
  useEffect(() => {
    if (!challenge || audience !== "username" || selected || query.trim().length < 2) { setResults([]); return; }
    let live = true;
    const timer = setTimeout(() => {
      void arena<{players:ArenaPlayer[]}>("search-players", {query:query.trim()})
        .then(r => { if(live) setResults(r.players); })
        .catch(e => { if(live) setError((e as Error).message); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [challenge, audience, query, selected?.user_id]);
  useEffect(() => {
    if (!searching) return;
    cancelled.current = false;
    const category = timeControl(control).group;
    const queueControls = [
      control,
      ...TIME_CONTROLS.filter(
        (candidate) => candidate.group === category && candidate.id !== control,
      ).map((candidate) => candidate.id),
    ];
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        for (const candidateControl of queueControls) {
          const r = await arena<{ match: ArenaMatch | null }>("queue", {
            control: candidateControl,
          });
          if (cancelled.current) {
            await arena("cancel-queue");
            return;
          }
          if (r.match) {
            setSearching(false);
            callback.current(r.match.id);
            return;
          }
        }
      } catch (e) {
        setError((e as Error).message);
        setSearching(false);
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled.current = true;
      clearInterval(timer);
      void arena("cancel-queue").catch(() => {});
    };
  }, [searching, control]);
  useEffect(() => {
    if (!room) return;
    let active = true;
    const poll = async () => {
      try {
        const r = await arena<{ match: ArenaMatch }>("match", { id: room.id });
        if (active && r.match.status === "active") callback.current(r.match.id);
        else if (
          active &&
          (r.match.status === "cancelled" ||
            Date.now() - r.match.created_at > 120000)
        ) {
          setRoom(null);
            setError("Invitation expired. Create another room.");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [room?.id]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await arena<{ match: ArenaMatch }>("room", {
        control,
        target: challenge ? selected?.user_id : target?.user_id,
        publicChallenge: challenge && audience === "anyone",
      });
      setRoom(r.match);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join(value: string) {
    setBusy(true);
    setError("");
    try {
      let code = value.trim();
      try {
        const link = new URL(value);
        code = new URLSearchParams(link.hash.slice(1)).get("match") ?? value;
      } catch {}
      const r = await arena<{ match: ArenaMatch }>("join", { code });
      onMatch(r.match.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!profile || profile.user_id === "guest-device")
    return (
      <section className="cloud-panel login-prompt">
        <h1>Play Online</h1>
        <p>Sign in and save your player profile to find an opponent.</p>
        <button className="gold-button" onClick={onLogin}>
          Sign in
        </button>
      </section>
    );
  return (
    <section className="match-setup">
      <div className="page-heading">
        <h1>{challenge ? "Challenge a Player" : target ? "Invite to a match" : "Play Online"}</h1>
        <span className="sample-label">{profile.cbr} CBR</span>
      </div>
      {target && !challenge ? (
        <div className="invite-player cloud-panel">
          <Avatar player={target} />
          <span>
            <strong>{target.display_name}</strong>
            <small>{target.cbr} CBR · You host this match</small>
          </span>
        </div>
      ) : (
        !challenge && <p className="page-caption">
          Prioritizes players within ±20 CBR, then selects the closest available
          opponent.
        </p>
      )}
      {challenge && !room && <div className="cloud-panel challenge-options">
        <h2>Who do you want to challenge?</h2>
        <div className="challenge-audience">
          <button type="button" className={audience === "username" ? "chosen" : ""} aria-pressed={audience === "username"} onClick={() => {setAudience("username");setError("");}}>Challenge by username</button>
          <button type="button" className={audience === "anyone" ? "chosen" : ""} aria-pressed={audience === "anyone"} onClick={() => {setAudience("anyone");setSelected(null);setError("");}}>Challenge anyone</button>
        </div>
        {audience === "username" && <div className="challenge-search">
          {selected ? <div className="challenge-selected"><Avatar player={selected}/><span><strong>{selected.display_name}</strong><small>@{selected.username}</small></span><button type="button" onClick={() => {setSelected(null);setQuery("");}}>Change</button></div> : <>
            <label htmlFor="challenge-username">Search username or name</label>
            <input id="challenge-username" autoComplete="off" value={query} onChange={e => {setQuery(e.target.value);setError("");}} placeholder="Type at least 2 characters" />
            {query.trim().length >= 2 && <ul aria-label="Matching players" className="challenge-results">{results.map(player => <li key={player.user_id}><button type="button" onClick={() => {setSelected(player);setQuery("");setResults([]);}}><Avatar player={player}/><span><strong>{player.display_name}</strong><small>@{player.username} · {player.cbr} CBR</small></span></button></li>)}</ul>}
            {query.trim().length >= 2 && results.length === 0 && <p>No matches yet. Try a shorter name.</p>}
          </>}
        </div>}
        {audience === "anyone" && <p>Choose a game time below. Your challenge will be pinned in the community feed for 2 minutes.</p>}
      </div>}
      <div className="cloud-panel">
        <TimePicker
          value={control}
          onChange={setControl}
          disabled={searching || !!room || busy}
        />
        {searching && !challenge ? (
          <div className="search-status">
            <Search size={20} />
            <strong>
              Finding the closest available {timeControl(control).group} player…
            </strong>
            <p>
              Preferred: {Math.max(0, profile.cbr - 20)}–{profile.cbr + 20} CBR
              · checks every {timeControl(control).group} time control
            </p>
            <button onClick={() => setSearching(false)}>
              <X size={15} />
              Cancel search
            </button>
          </div>
        ) : (
          !room && (
            <button
              disabled={busy || (challenge && (!audience || (audience === "username" && !selected)))}
              className="gold-button wide"
              onClick={() => {
                setError("");
                target || challenge ? void create() : setSearching(true);
              }}
            >
              {challenge ? audience === "anyone" ? "Post challenge to feed" : "Send challenge" : target ? "Send match invitation" : "Find opponent"}
            </button>
          )
        )}
        <p className="rules-caption">
          Win +8 CBR · loss −10 · 4+ win streak +2. If the rating gap exceeds
          10, the winner also earns 10% of the opponent’s starting CBR, rounded
          down.
        </p>
      </div>
      {!challenge && !target && !searching && !room && (
        <div className="lobby-pair-grid">
          <div className="cloud-panel">
            <h2>Host with QR</h2>
            <p>Invite a friend with a QR or short code.</p>
            <button disabled={busy} onClick={() => void create()}>
              Create room
            </button>
          </div>
          <div className="cloud-panel">
            <h2>Join a room</h2>
            <QrInput label="Scan match QR" onValue={(v) => void join(v)} />
          </div>
        </div>
      )}
      {room && (
        <div className="cloud-panel room-waiting">
          <QRCodeSVG
            value={
              typeof window === "undefined"
                ? room.code
                : window.location.origin + "/#match=" + room.code
            }
            size={190}
            marginSize={3}
          />
          <strong className="room-code">{room.code}</strong>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(room.code)
                .catch(() => setError("Copy the displayed code manually."))
            }
          >
            <Copy size={15} />
            Copy code
          </button>
          <p>
            {challenge && audience === "anyone" ? "Your challenge is pinned in the feed" : selected || target
              ? "Invitation sent to " + (selected ?? target)?.display_name
              : "Waiting for your opponent"}{" "}
            · {timeControl(room.control).label}
          </p>
          <button
            onClick={() => {
              void arena("cancel-room", { id: room.id });
              setRoom(null);
            }}
          >
            Cancel invitation
          </button>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
