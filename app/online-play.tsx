"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Search, Copy, Coins, Swords, X } from "lucide-react";
import { arena } from "./arena-client";
import { TIME_CONTROLS, type ArenaMatch, type ArenaPlayer, timeControl } from "./game-rules";
import type { PlayerProfile } from "./supabase";
import TimePicker from "./time-picker";
import { Avatar } from "./match-board";
import QrInput from "./qr-input";
export { default as OnlineGame } from "./online-game";
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
    [busy, setBusy] = useState(false),
    [modeOpen, setModeOpen] = useState(false),
    [playMode, setPlayMode] = useState<"normal"|"wager">("normal"),
    [wagerGold, setWagerGold] = useState(1);
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
            play_mode: playMode,
            wager_gold: playMode === "wager" ? wagerGold : 0,
          });
          if (cancelled.current) {
            await arena("cancel-queue");
            return;
          }
          if (r.match) {
            setSearching(false);
            if (r.match.status === "active") callback.current(r.match.id);
            else setRoom(r.match);
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
  }, [searching, control, playMode, wagerGold]);
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
            setError(r.match.play_mode === "wager" ? "The wager was rejected or expired. No Gold was deducted." : "Invitation expired. Create another room.");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [room?.id]);
  async function create(requestedMode: "normal" | "wager" = playMode) {
    setBusy(true);
    setError("");
    try {
      const r = await arena<{ match: ArenaMatch; challengePublished?: boolean }>("room", {
        control,
        target: challenge ? selected?.user_id : target?.user_id,
        publicChallenge: challenge && audience === "anyone",
        play_mode: requestedMode,
        wager_gold: requestedMode === "wager" ? wagerGold : 0,
      });
      if (challenge && audience === "anyone" && r.challengePublished !== true) {
        throw Error("The server did not confirm your public challenge. Please retry.");
      }
      setRoom(r.match);
      setModeOpen(false);
      if (challenge && audience === "anyone") {
        window.dispatchEvent(new Event("cb-profile-saved"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function confirmPlayMode() {
    setError("");
    if (target || challenge) {
      void create(playMode);
      return;
    }
    setModeOpen(false);
    setRoom(null);
    setSearching(true);
  }
  async function answerFoundWager(accept: boolean) {
    if (!room) return;
    setBusy(true);
    setError("");
    try {
      if (accept) {
        const r = await arena<{ match: ArenaMatch }>("join", { code: room.code });
        onMatch(r.match.id);
      } else {
        await arena("decline-room", { id: room.id });
        setRoom(null);
        setError("Bet rejected. No Gold was deducted.");
      }
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
      {modeOpen&&<div className="wager-overlay" role="presentation"><section className="wager-dialog" role="dialog" aria-modal="true" aria-labelledby="match-mode-title"><button className="wager-close" aria-label="Close match mode" onClick={()=>setModeOpen(false)}><X size={18}/></button><h2 id="match-mode-title">{target||challenge?"Choose invitation mode":"Choose Play Online mode"}</h2><p>{target||challenge?"Select how this invitation will be played before it is sent.":"Choose a regular match or find a player willing to match your Gold bet."}</p><div className="wager-mode-options"><button className={playMode==='normal'?'chosen':''} onClick={()=>setPlayMode('normal')}><Swords size={22}/><strong>Regular play</strong><small>No Gold stake · standard rewards</small></button><button className={playMode==='wager'?'chosen':''} onClick={()=>setPlayMode('wager')}><Coins size={22}/><strong>Wager play</strong><small>Both players stake equal Gold</small></button></div>{playMode==='wager'&&<label className="wager-amount">Your Gold bet<input type="number" inputMode="numeric" min={1} max={Math.min(10000,profile.gold_points)} value={wagerGold} onChange={e=>setWagerGold(Math.max(0,Math.floor(Number(e.target.value)||0)))}/><small>You have {profile.gold_points} Gold. The found opponent must accept or reject the {wagerGold||0}-Gold bet.</small></label>}<button className="gold-button wide" disabled={busy||(playMode==='wager'&&(wagerGold<1||wagerGold>profile.gold_points||wagerGold>10000))} onClick={confirmPlayMode}>{busy?'Please wait…':target||challenge?(playMode==='wager'?`Send ${wagerGold} Gold wager`:'Send regular invitation'):(playMode==='wager'?`Find ${wagerGold} Gold wager`:'Find regular opponent')}</button></section></div>}
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
              · {playMode === "wager" ? `${wagerGold} Gold wager · approval required` : "regular play · no stake"}
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
                setModeOpen(true);
              }}
            >
              {challenge ? audience === "anyone" ? "Post challenge to feed" : "Send challenge" : target ? "Send match invitation" : "Find opponent"}
            </button>
          )
        )}
        <p className="rules-caption">
          Regular pairing has no stake. In Wager play, the found opponent must accept before both equal stakes are deducted; rejecting costs nothing. Draws refund both players. Win +8 CBR · loss −10 · 4+ win streak +2. If the rating gap exceeds
          10, the winner also earns 10% of the opponent’s starting CBR, rounded
          down.
        </p>
      </div>
      {!challenge && !target && !searching && !room && (
        <div className="lobby-pair-grid">
          <div className="cloud-panel">
            <h2>Host with QR</h2>
            <p>Invite a friend with a QR or short code.</p>
            <button disabled={busy} onClick={() => void create("normal")}>
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
            {room.play_mode === "wager" && room.invite_to === profile.user_id
              ? `Opponent found · ${room.wager_gold} Gold wager. Accept the bet to start or reject it with no charge.`
              : room.play_mode === "wager"
                ? `Opponent found · waiting for them to accept your ${room.wager_gold} Gold wager`
                : challenge && audience === "anyone" ? "Your challenge is pinned in the feed" : selected || target
              ? "Invitation sent to " + (selected ?? target)?.display_name
              : "Waiting for your opponent"}{" "}
            · {timeControl(room.control).label}
          </p>
          {room.play_mode === "wager" && room.invite_to === profile.user_id ? <div className="wager-answer-actions"><button className="gold-button" disabled={busy} onClick={() => void answerFoundWager(true)}>{busy ? "Processing…" : `Accept ${room.wager_gold} Gold Bet`}</button><button disabled={busy} onClick={() => void answerFoundWager(false)}>Reject Bet</button></div> : <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void arena("cancel-room", { id: room.id })
                .then(() => setRoom(null))
                .catch((e) => setError((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Cancelling…" : room.play_mode === "wager" ? "Cancel wager" : "Cancel invitation"}
          </button>}
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
