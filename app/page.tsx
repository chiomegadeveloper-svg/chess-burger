"use client";
const MAINTENANCE_MODE = false;
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Home,
  MapPin,
  Swords,
  Trophy,
  UserRound,
  Globe2,
  UsersRound,
  ChevronRight,
  ArrowLeft,
  Radio,
  CircleHelp,
  CreditCard,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import Offline from "./offline";
import SharedBoard from "./shared-board";
import Account from "./account";
import CommunityFeed from "./community-feed";
import RecentPlays from "./recent-plays";
import NearbyMap from "./nearby-map";
import LocalPairing from "./local-pairing";
import Cms from "./cms";
import Tournaments from "./tournaments";
import OnlinePlay, { OnlineGame } from "./online-play";
import Rankings from "./rankings";
import LiveChannel from "./live-channel";
import { SavedGame, saveGame } from "./game-history";
import { getSupabase, PlayerProfile } from "./supabase";
import { authStorage } from "./auth-storage";
import { arena } from "./arena-client";
import { useGpsPresence } from "./gps-presence";
import { useLivePresence } from "./live-presence";
import { type ArenaMatch, type ArenaPlayer, timeControl } from "./game-rules";
import { profileRequest } from "./profile-client";
import { FloatingChatButton, SocialHub, MatchResult, type MatchSummary } from "./social";
import PublicProfile from "./public-profile";
import InstallPrompt from "./install-prompt";

const modes = [
  {
    name: "Play Online",
    sub: "Closest available CBR opponent",
    meta: "Find match",
    Icon: Globe2,
    key: "online",
  },
  {
    name: "Nearby Match",
    sub: "See GPS-active players on the map",
    meta: "Open map",
    Icon: MapPin,
    key: "map",
  },
  {
    name: "Offline Board",
    sub: "Local Wi-Fi · QR & pairing code",
    meta: "Pair devices",
    Icon: UsersRound,
    key: "pairing",
  },
];
const navigation = [
  { key: "home", label: "Home", Icon: Home },
  { key: "map", label: "Map", Icon: MapPin },
  { key: "card", label: "Card", Icon: CreditCard },
  { key: "play", label: "Play", Icon: Swords },
  { key: "shop", label: "Shop", Icon: ShoppingBag },
  { key: "rank", label: "Rank", Icon: Trophy },
  { key: "profile", label: "Profile", Icon: UserRound },
];
type Invite = ArenaMatch & { host_name: string; host_avatar: string };
const activeMatchKey = (userId: string) => `cb-active-match:${userId}`;
function savedSharedBoard(userId: string) {
  try {
    const raw = localStorage.getItem(`cb-shared-board:${userId}`);
    const match = raw ? JSON.parse(raw) as ArenaMatch : null;
    return match?.white_id === userId && match.status === "active" ? match.id : "";
  } catch { return ""; }
}
function AppPage() {
  const [tab, setTab] = useState("profile"),
    [profile, setProfile] = useState<PlayerProfile | null>(null),
    [replayGame, setReplayGame] = useState<SavedGame | null>(null),
    [showSplash, setShowSplash] = useState(true),
    [showWelcome, setShowWelcome] = useState(false),
    [member, setMember] = useState<boolean | null>(null);
  const [matchId, setMatchId] = useState(""),
    [target, setTarget] = useState<ArenaPlayer | null>(null),
    [viewedUserId, setViewedUserId] = useState(""),
    [invites, setInvites] = useState<Invite[]>([]),
    [activeId, setActiveId] = useState(""),
    [sharedId, setSharedId] = useState(""),
    [pairingOpened, setPairingOpened] = useState(false),
    [localMatchActive, setLocalMatchActive] = useState(false),
    [offlineControl, setOfflineControl] = useState("10+0");
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const shownResults = useRef(new Set<string>());
  const welcomeDecision = useRef(false);
  const showOnlineResult = useCallback(
    (m: ArenaMatch) => {
      const ownId = profile?.user_id;
      if (
        !ownId ||
        m.status !== "finished" ||
        ![m.white_id, m.black_id].includes(ownId)
      )
        return;
      const key = ownId + ":" + m.id,
        storageKey = "cb-shown-match-results:" + ownId;
      let saved: string[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      } catch {}
      if (shownResults.current.has(key) || saved.includes(m.id)) return;
      const side = m.white_id === ownId ? "white" : "black",
        matchPlayer = side === "white" ? m.white : m.black,
        opponent = side === "white" ? m.black : m.white;
      const player = matchPlayer ?? {
        user_id: ownId,
        display_name: profile.display_name,
        username: profile.username,
        avatar_url: profile.avatar_url,
        cbr: profile.cbr,
        gold_points: profile.gold_points,
        wins: profile.wins,
        losses: profile.losses,
        win_streak: profile.win_streak,
      };
      shownResults.current.add(key);
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(
            [...saved.filter((id) => id !== m.id), m.id].slice(-50),
          ),
        );
      } catch {}
      setSummary({
        id: m.id,
        outcome:
          m.result === "draw" ? "draw" : m.result === side ? "win" : "loss",
        player,
        delta:
          m.rating_changes?.[ownId] ??
          player.cbr - (side === "white" ? m.white_cbr : m.black_cbr),
        goldDelta: m.gold_changes?.[ownId] ?? 0,
        goldPayout: m.gold_payouts?.[ownId] ?? 0,
        playMode: m.play_mode ?? "normal",
        wagerGold: Number(m.wager_gold ?? 0),
        control: m.control,
        opponent,
      });
    },
    [profile],
  );
  const [localOcbr, setLocalOcbr] = useState(88);
  const scroller = useRef<HTMLDivElement>(null),
    gps = useGpsPresence(profile?.user_id);
  useLivePresence(profile?.user_id, !!gps.enabled && !!gps.position, activeId, profile?.cbr ?? 88);
  const refreshProfile = useCallback(async () => {
    try {
      const c = await getSupabase();
      if (!c) return;
      const {
        data: { session },
      } = await c.auth.getSession();
      if (!session) return;
      let data = await profileRequest(c);
      // Earlier versions kept the completed profile on the device. Rehydrate
      // a missing or newly generated default row from that same user's cache.
      // Only editable profile fields are restored; server-owned ratings,
      // balances, roles, wins and losses remain untouched.
      const generatedSuffix = `_${session.user.id.replace(/-/g, "").slice(0, 6)}`;
      const generatedDefault = !!data?.username?.endsWith(generatedSuffix) && Number(data.cbr ?? 88) === 88 && Number(data.wins ?? 0) === 0 && Number(data.losses ?? 0) === 0;
      if (!data || generatedDefault) {
        try {
          const cached = JSON.parse(authStorage.getItem("cb-staff-profile") ?? "null") as PlayerProfile | null;
          if (cached?.user_id === session.user.id && cached.username && cached.display_name) {
            data = await profileRequest(c, "PUT", cached);
          }
        } catch {}
      }
      if (!data) {
        setMember(false);
        setTab("profile");
        return;
      }
      let current = data;
      try {
        const live = await arena<{ profile: PlayerProfile }>("me");
        current = live.profile;
      } catch {}
      const hasRequiredPhoto=!!current.avatar_url?.trim();
      setMember(hasRequiredPhoto);
      if(!hasRequiredPhoto)setTab("profile");
      const stored = localStorage.getItem("cb-local-ocbr:" + current.user_id);
      if (stored)
        current = { ...current, ocbr: Math.max(0, Number(stored) || 88) };
      setProfile(current);
      setLocalOcbr(current.ocbr ?? 88);
      authStorage.setItem("cb-staff-profile", JSON.stringify(current));
    } catch {}
  }, []);
  const openMatch = (id: string) => {
    setMatchId(id);
    setActiveId(id);
    if (profile?.user_id && profile.user_id !== "guest-device")
      localStorage.setItem(activeMatchKey(profile.user_id), id);
    setTab("game");
  };
  useEffect(() => {
    if (tab === "pairing") setPairingOpened(true);
  }, [tab]);
  useEffect(() => {
    const userId = profile?.user_id;
    if (!userId) { setSharedId(""); return; }
    const update = () => setSharedId(savedSharedBoard(userId));
    update();
    window.addEventListener("cb-games-changed", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("cb-games-changed", update); window.removeEventListener("storage", update); };
  }, [profile?.user_id]);
  useEffect(() => {
    if (!localMatchActive) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [localMatchActive]);
  const onSaved = (p: PlayerProfile) => {
    setMember(!!p.avatar_url?.trim());
    setProfile(p);
    setLocalOcbr(p.ocbr ?? 88);
    window.dispatchEvent(new Event("cb-profile-saved"));
    void refreshProfile();
    setTab("home");
  };
  function rateLocal(result: "win" | "loss" | "draw", gameId: string) {
    const ledgerKey = "cb-local-rated-" + (profile?.user_id ?? "guest-device"),
      ledger = JSON.parse(localStorage.getItem(ledgerKey) ?? "[]") as string[];
    if (ledger.includes(gameId)) return null;
    const delta =
        result === "win" ? 6 : result === "loss" ? -Math.min(9, localOcbr) : 0,
      next = Math.max(0, localOcbr + delta);
    setLocalOcbr(next);
    localStorage.setItem(
      "cb-local-ocbr:" + String(profile?.user_id ?? "guest-device"),
      String(next),
    );
    localStorage.setItem(ledgerKey, JSON.stringify([...ledger, gameId]));
    if (profile) {
      const updated = { ...profile, ocbr: next };
      setProfile(updated);
      if (profile.user_id === "guest-device")
        localStorage.setItem("cb-guest-profile", JSON.stringify(updated));
      else authStorage.setItem("cb-staff-profile", JSON.stringify(updated));
    }
    toast.success("Offline OCBR " + (delta >= 0 ? "+" : "") + delta);
    return delta;
  }
  function localResult(m: ArenaMatch, id: string) {
    const side = id === m.white_id ? "white" : "black",
      result =
        m.result === "draw" ? "draw" : m.result === side ? "win" : "loss";
    const delta = rateLocal(result, m.id);
    if (delta === null) return;
    setSummary({
      id: m.id,
      outcome: result,
      delta,
      player: profile ?? { cbr: 88, gold_points: 88, wins: 0, losses: 0, win_streak: 0 },
      ratingLabel: "OCBR",
      ratingValue: Math.max(0, localOcbr + delta),
      opponent: side === "white" ? m.black : m.white,
      local: true,
    });
    saveGame({
      id: m.id,
      white: m.white?.display_name ?? "White",
      black: m.black?.display_name ?? "Black",
      pgn: m.pgn,
      score: m.result === "draw" ? "½–½" : m.result === "white" ? "1–0" : "0–1",
      startedAt: new Date(m.created_at).toISOString(),
      updatedAt: new Date().toISOString(),
      ratedAt: new Date().toISOString(),
      ratingDelta: delta,
    });
  }
  useEffect(() => {
    const clockTap = new Audio("/audio/chess-clock-tap.wav");
    clockTap.volume = 0.65;
    clockTap.preload = "auto";
    void clockTap.play().catch(() => {});
    const splash = setTimeout(() => {
      setShowSplash(false);
    }, 6000);
    if ("serviceWorker" in navigator) {
      const updating = !!navigator.serviceWorker.controller;
      let reloaded = false;
      if (updating)
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            if (reloaded) return;
            reloaded = true;
            location.reload();
          },
          { once: true },
        );
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (reg) => {
          await reg.update();
          const ready = await navigator.serviceWorker.ready;
          (ready.active ?? navigator.serviceWorker.controller)?.postMessage({
            type: "CACHE_ASSETS",
            paths: performance.getEntriesByType("resource").map((e) => e.name),
          });
        })
        .catch(() => {});
    }
    try {
      const raw = !navigator.onLine
        ? (authStorage.getItem("cb-staff-profile") ??
          localStorage.getItem("cb-guest-profile"))
        : localStorage.getItem("cb-guest-profile");
      if (raw) {
        const cached = JSON.parse(raw);
        setProfile(cached);
        const rating = localStorage.getItem(
          "cb-local-ocbr:" + String(cached.user_id ?? "guest-device"),
        );
        setLocalOcbr(
          rating ? Math.max(0, Number(rating) || 88) : (cached.ocbr ?? 88),
        );
      }
    } catch {}
    window.addEventListener("online", refreshProfile);
    void refreshProfile();
    let unsubscribe = () => {};
    void getSupabase()
      .then((c) => {
        if (!c) return;
        const { data } = c.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_IN") setTimeout(() => void refreshProfile(), 0);
          if (event === "SIGNED_OUT")
            setTimeout(
              () => window.dispatchEvent(new Event("cb-signed-out")),
              0,
            );
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() => {});
    const hash = () => {
      const params = new URLSearchParams(location.hash.slice(1));
      if (params.has("tournament")) setTab("tournaments");
      if (params.has("match")) {
        const code = params.get("match")!;
        void arena<{ match: ArenaMatch }>("join", { code })
          .then((d) => openMatch(d.match.id))
          .catch((e) => {
            toast.info((e as Error).message);
            setTab("online");
          });
      }
    };
    hash();
    window.addEventListener("hashchange", hash);
    const clear = () => {
      setMember(false);
      setProfile(null);
      setSummary(null);
      setActiveId("");
      setSharedId("");
      setInvites([]);
      setLocalOcbr(88);
      setTab("profile");
    };
    window.addEventListener("cb-signed-out", clear);
    return () => {
      clearTimeout(splash);
      clockTap.pause();
      unsubscribe();
      window.removeEventListener("online", refreshProfile);
      window.removeEventListener("cb-signed-out", clear);
      window.removeEventListener("hashchange", hash);
    };
  }, [refreshProfile]);
  useEffect(() => {
    if (showSplash || member === null || welcomeDecision.current) return;
    welcomeDecision.current = true;
    if (member) {
      setShowWelcome(true);
      return;
    }
    setShowWelcome(false);
    setTab("profile");
  }, [showSplash, member]);
  useEffect(() => {
    if (!profile || profile.user_id === "guest-device") return;
    const userId = profile.user_id;
    const remembered = localStorage.getItem(activeMatchKey(userId));
    setActiveId(remembered ?? "");
    let live = true,
      pending = false,
      channel: RealtimeChannel | null = null;
    const refreshState = async () => {
      if (pending || !navigator.onLine) return;
      pending = true;
      try {
        const d = await arena<{ invites: Invite[]; match: ArenaMatch | null }>(
          "state",
        );
        if (live) {
          setInvites(d.invites);
          const currentId = d.match?.status === "active" ? d.match.id : "";
          setActiveId(currentId);
          if (currentId) localStorage.setItem(activeMatchKey(userId), currentId);
          else localStorage.removeItem(activeMatchKey(userId));
        }
      } catch {
      } finally {
        pending = false;
      }
    };
    void refreshState();
    void getSupabase().then((client) => {
      if (!client || !live) return;
      channel = client.channel(`cb-user-state:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "cb_matches" }, () => void refreshState())
        .subscribe((status) => { if (status === "SUBSCRIBED") void refreshState(); });
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refreshState(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      live = false;
      if (channel) void channel.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [profile?.user_id]);
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [tab]);
  const active = [
    "offline",
    "pairing",
    "online",
    "challenge",
    "game",
    "watch",
    "channel",
    "replay",
    "tournaments",
  ].includes(tab)
    ? "play"
    : tab === "cms"
      ? "profile"
      : tab;
  const back = (
    <button className="back-button" onClick={() => setTab("play")}>
      <ArrowLeft size={15} />
      Match Lobby
    </button>
  );
  const staff = profile && ["owner", "admin"].includes(profile.role);
  const navigate = (next: string) => {
    if (!member) {
      setTab("profile");
      toast.info("Register and save your profile to unlock Chess Burger.");
      return;
    }
    setTab(next);
  };
  let content;
  if (tab === "home")
    content = (
      <CommunityFeed
        onMatch={openMatch}
        onChallenge={(player) => {
          setTarget(player);
          setTab("challenge");
        }}
        onOpenProfile={(userId) => {
          setViewedUserId(userId);
          setTab("public-profile");
        }}
      />
    );
  else if (tab === "public-profile")
    content = (
      <PublicProfile
        currentUserId={profile?.user_id}
        userId={viewedUserId}
        onClose={() => setTab("home")}
        onChallenge={(player) => { setTarget(player); setTab("challenge"); }}
      />
    );
  else if (tab === "play")
    content = (
      <section className="play-page">
        <div className="page-heading">
          <h1>Match Lobby</h1>
          <button className="text-button" onClick={() => setTab("channel")}>
            <Radio size={15} />
            Channel
          </button>
        </div>
        <p className="page-caption">Choose your board.</p>
        <button className="match-row available challenge-lobby-link" onClick={() => { setTarget(null); setTab("challenge"); }}>
          <span className="mode-symbol"><Swords size={21}/></span>
          <span className="mode-copy"><strong>Challenge a Player</strong><small>Search by username or challenge anyone in the feed</small></span>
          <span className="mode-meta">Invite</span><ChevronRight size={15}/>
        </button>
        <div className="mode-list">
          {modes.map(({ name, sub, meta, Icon, key }) => (
            <button
              key={key}
              className="match-row available"
              onClick={() => {
                setTarget(null);
                setTab(key);
              }}
            >
              <span className="mode-symbol">
                <Icon size={21} />
              </span>
              <span className="mode-copy">
                <strong>{name}</strong>
                <small>{sub}</small>
              </span>
              <span className="mode-meta">{meta}</span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
        <div className="lobby-pair-grid lobby-shortcuts">
          <button className="cloud-panel" onClick={() => setTab("pairing")}>
            <CreditCard />
            <strong>Offline QR pairing</strong>
            <span>Host or scan a local board</span>
          </button>
          <button
            className="cloud-panel"
            onClick={() => {
              setTarget(null);
              setTab("online");
            }}
          >
            <Swords />
            <strong>Code & join</strong>
            <span>Open a friend’s online room</span>
          </button>
        </div>
        <p className="lobby-footnote">
          Online games use CBR. Fully offline games use the separate OCBR rating
          and sync when you reconnect.
        </p>
      </section>
    );
  else if (tab === "online" || tab === "challenge")
    content = (
      <>
        {back}
        <OnlinePlay
          key={`${tab}:${target?.user_id ?? 'anyone'}`}
          profile={profile}
          target={target}
          challenge={tab === "challenge"}
          onMatch={openMatch}
          onLogin={() => setTab("profile")}
        />
      </>
    );
  else if (tab === "game" || tab === "watch")
    content = (
      <>
        {back}
        <OnlineGame
          key={matchId + tab}
          id={matchId}
          profile={profile}
          watch={tab === "watch"}
          onFinished={(m) => {
            if (profile?.user_id && localStorage.getItem(activeMatchKey(profile.user_id)) === m.id)
              localStorage.removeItem(activeMatchKey(profile.user_id));
            setActiveId(current => current === m.id ? "" : current);
            showOnlineResult(m);
            void refreshProfile();
            window.dispatchEvent(new Event("cb-profile-saved"));
          }}
        />
      </>
    );
  else if (tab === "pairing") content = null;
  else if (tab === "offline")
    content = (
      <>
        {back}
        <SharedBoard
          profile={profile}
          control={offlineControl}
          onResult={localResult}
        />
      </>
    );
  else if (tab === "replay")
    content = (
      <>
        {back}
        <Offline
          key={replayGame?.id}
          replayGame={replayGame}
          playerName={profile?.display_name}
          onClose={() => setTab("profile")}
        />
      </>
    );
  else if (tab === "map")
    content = (
      <NearbyMap
        {...gps}
        onInvite={(p) => {
          setTarget(p);
          setTab("online");
        }}
        onOpenProfile={(userId) => {
          setViewedUserId(userId);
          setTab("public-profile");
        }}
        onClaimed={() => void refreshProfile()}
      />
    );
  else if (tab === "rank") content = <Rankings profile={profile} />;
  else if (tab === "channel")
    content = (
      <>
        {back}
        <LiveChannel
          onWatch={(id) => {
            setMatchId(id);
            setTab("watch");
          }}
        />
      </>
    );
  else if (tab === "tournaments") content = <Tournaments profile={profile} />;
  else if (tab === "card")
    content = (
      <section className="profile-page card-only-view">
        <div className="page-heading">
          <h1>User card</h1>
          <span className="sample-label">Player identity</span>
        </div>
        <Account
          cardOnly
          onLoaded={setProfile}
          onSaved={onSaved}
          onMembershipChange={setMember}
        />
      </section>
    );
  else if (tab === "shop")
    content = (
      <section className="shop-page">
        <div className="page-heading">
          <h1>Chess Burger shop</h1>
          <span className="sample-label">{profile?.gold_points ?? 0} Gold</span>
        </div>
        <div className="shop-grid">
          {[
            ["♞", "Avatar frames", "Decorative player-card frames."],
            ["♛", "Board themes", "Metallic boards and pieces."],
            ["♟", "Gold rewards", "Reward items for your collection."],
          ].map(([icon, name, desc]) => (
            <article key={name}>
              <span className="shop-icon">{icon}</span>
              <div>
                <h2>{name}</h2>
                <p>{desc}</p>
              </div>
              <span className="shop-status">Coming soon</span>
            </article>
          ))}
        </div>
      </section>
    );
  else if (tab === "cms" && staff)
    content = <Cms profile={profile} onClose={() => setTab("profile")} />;
  else
    content = (
      <section className="profile-page">
        <div className="page-heading">
          <h1>Player profile</h1>
        </div>
        <Account
          onLoaded={setProfile}
          onSaved={onSaved}
          onOpenCms={() => setTab("cms")}
          onMembershipChange={(m) => {
            setMember(m);
            if (!m) setTab("profile");
          }}
        />
        {member === true && (
          <RecentPlays
            onReplay={(g) => {
              setReplayGame(g);
              setTab("replay");
            }}
          />
        )}
      </section>
    );
  if (member === false && tab !== "profile" && !(tab === "pairing" && localMatchActive))
    content = (
      <section className="profile-page registration-gate">
        <div className="page-heading">
          <h1>Create your player profile</h1>
        </div>
        <Account
          onLoaded={setProfile}
          onSaved={onSaved}
          onMembershipChange={setMember}
        />
      </section>
    );
  return (
    <main className="app-shell">
      {showSplash && (
        <div
          className="splash-screen"
          role="status"
          aria-label="Chess Burger is loading"
        >
          <div className="splash-brand-lockup">
            <img src="/splash/chess-burger-logo.webp" alt="" />
            <strong>CHESS <b>BURGER</b></strong>
          </div>
          <img
            className="splash-battle-art"
            src="/splash/chess-battle.webp"
            alt="Chess Burger pieces charging into battle"
          />
          <small>CHESS BURGER ALL RIGHTS RESERVED 2026</small>
        </div>
      )}
      {showWelcome && !showSplash && (
        <div className="welcome-menu-backdrop">
          <section
            className="welcome-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-menu-title"
          >
            <header className="welcome-menu-brand">
              <img src="/cburger_logo.png" alt="" />
              <h1 id="welcome-menu-title">
                CHESS <b>BURGER</b>
              </h1>
            </header>
            <div className="welcome-menu-options">
              <button
                className="welcome-card invasion"
                onClick={() => {
                  setShowWelcome(false);
                  setTab("map");
                }}
              >
                <img src="/welcome/invasion.webp" alt="Chess pieces invading a territory map" />
                <strong>INVASION</strong>
              </button>
              <button
                className="welcome-card online"
                onClick={() => {
                  setShowWelcome(false);
                  setTab("play");
                }}
              >
                <img src="/welcome/play-online.webp" alt="Chess characters playing online" />
                <strong>PLAY ONLINE</strong>
              </button>
              <button
                className="welcome-card classroom"
                onClick={() =>
                  toast.info("Class Room feature coming very soon")
                }
              >
                <img src="/welcome/classroom.webp" alt="Chess classroom" />
                <strong>CLASS ROOM</strong>
              </button>
            </div>
          </section>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <img src="/cburger_logo.png" alt="Chess Burger" />
          <span>
            CHESS <b>BURGER</b>
          </span>
        </div>
        <div className="header-actions">
          <button
            aria-label="About Chess Burger"
            onClick={() =>
              toast.info("Chess Burger", {
                description:
                  "Online, nearby, and local chess. Your next move starts here.",
              })
            }
          >
            <CircleHelp size={18} />
          </button>
          <button
            className="header-avatar"
            aria-label="Open profile"
            onClick={() => setTab("profile")}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} />
            ) : (
              (profile?.display_name?.[0]?.toUpperCase() ?? (
                <UserRound size={16} />
              ))
            )}
          </button>
        </div>
      </header>
      <div
        className={
          "scroll-area " +
          (["offline", "game", "watch", "replay"].includes(tab)
            ? "board-scroll "
            : "") +
          (tab === "rank" ? "rank-scroll" : "")
        }
        ref={scroller}
      >
        {activeId && tab !== "game" && (
          <button className="resume-match" onClick={() => openMatch(activeId)}>
            Return to online match <ChevronRight size={15} />
          </button>
        )}
        {localMatchActive && tab !== "pairing" && (
          <button className="resume-match" onClick={() => setTab("pairing")}>
            Return to QR-paired match <ChevronRight size={15} />
          </button>
        )}
        {sharedId && tab !== "offline" && (
          <button className="resume-match" onClick={() => setTab("offline")}>
            Return to shared-device match <ChevronRight size={15} />
          </button>
        )}
        {invites.length > 0 && tab !== "game" && (
          <div className="invite-inbox cloud-panel">
            {invites.map((i) => (
              <div key={i.id}>
                <strong>{i.host_name} invited you</strong>
                <span>
                  {timeControl(i.control).group} ·{" "}
                  {timeControl(i.control).label}
                </span>
                <button
                  className="gold-button"
                  onClick={() =>
                    void arena<{ match: ArenaMatch }>("join", { code: i.code })
                      .then((r) => openMatch(r.match.id))
                      .catch((e) => toast.error(e.message))
                  }
                >
                  Accept
                </button>
                <button
                  onClick={() =>
                    void arena("decline-room", { id: i.id })
                      .then(() => setInvites((v) => v.filter((m) => m.id !== i.id)))
                      .catch((e) => toast.error(e.message))
                  }
                >
                  Decline
                </button>
              </div>
            ))}
          </div>
        )}
        {content}
        {pairingOpened && <div hidden={tab !== "pairing"}>
          {tab === "pairing" && back}
          <LocalPairing
            profile={profile}
            startSameDevice={(c) => { setOfflineControl(c); setTab("offline"); }}
            startOnlineMatch={openMatch}
            onResult={localResult}
            onLocalMatchChange={setLocalMatchActive}
          />
        </div>}
      </div>
      <nav className="bottom-nav" aria-label="Main navigation">
        {navigation.map(({ key, label, Icon }) => (
          <button
            key={key}
            aria-current={active === key ? "page" : undefined}
            className={
              (active === key ? "active " : "") +
              (key === "play" ? "play-nav" : "")
            }
            onClick={() => (key === "profile" ? setTab(key) : navigate(key))}
          >
            <span className="nav-icon-shell">
              <Icon size={20} strokeWidth={1.7} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <MatchResult
        result={summary}
        onRematchStarted={(id) => {
          setSummary(null);
          setMatchId(id);
          setActiveId(id);
          setTab("game");
        }}
        onReplay={
          summary && !summary.local
            ? () => {
                setSummary(null);
                setActiveId("");
                setMatchId(summary.id);
                setTab("watch");
              }
            : undefined
        }
        onLobby={() => {
          setSummary(null);
          setMatchId("");
          setActiveId("");
          setTab("play");
        }}
      />
      <SocialHub
        profile={profile}
        onOpenProfile={(id) => {
          setViewedUserId(id);
          setTab("public-profile");
        }}
      />
      <FloatingChatButton visible={tab === "home"} />
      <InstallPrompt active={!showSplash} />
      <Toaster theme="light" position="top-center" richColors closeButton />
    </main>
  );
}

export default function Page() {
  if (MAINTENANCE_MODE) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          color: "#ffffff",
          padding: "24px",
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: "420px" }}>
          <img
            src="/cburger_logo.png"
            alt="Chess Burger"
            style={{
              width: "90px",
              height: "90px",
              objectFit: "contain",
              marginBottom: "20px",
            }}
          />

          <h1
            style={{
              fontSize: "28px",
              margin: "0 0 12px",
              fontWeight: 700,
            }}
          >
            Chess Burger
          </h1>

          <h2
            style={{
              fontSize: "20px",
              margin: "0 0 16px",
            }}
          >
            Temporarily Under Maintenance
          </h2>

          <p
            style={{
              fontSize: "15px",
              lineHeight: 1.6,
              opacity: 0.75,
              margin: 0,
            }}
          >
            Chess Burger is currently being updated.
            <br />
            Please check back soon.
          </p>
        </div>
      </main>
    );
  }

  return <AppPage />;
}
