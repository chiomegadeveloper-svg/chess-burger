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
  PackageOpen,
  Castle,
  Bot,
  GraduationCap,
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
import { FloatingChatButton, SocialHub, MatchResult, openSocial, type MatchSummary } from "./social";
import PublicProfile from "./public-profile";
import InstallPrompt from "./install-prompt";
import { BagPage, ShopPage } from "./shop";
import { isProfileComplete } from "./profile-completion";
import Testimonials from "./testimonials";
import CpuGame from "./cpu-game";
import Puzzles from "./puzzles";
import GrandArena from "./grand-arena";
import Classroom from "./classroom";
import GuildPage from "./guild";
import NotificationBell from "./notifications";
import "./play-selection-tournament.css";

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
  { key: "guild", label: "Guild", Icon: Castle },
  { key: "play", label: "Play", Icon: Swords },
  { key: "shop", label: "Shop", Icon: ShoppingBag },
  { key: "bag", label: "Bag", Icon: PackageOpen },
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
  const [feedTarget, setFeedTarget] = useState<"recent" | "announcement" | "rewards">("recent");
  const [tab, setTab] = useState("profile"),
    [profile, setProfile] = useState<PlayerProfile | null>(null),
    [replayGame, setReplayGame] = useState<SavedGame | null>(null),
    [showSplash, setShowSplash] = useState(true),
    [showWelcome, setShowWelcome] = useState(false),
    [member, setMember] = useState<boolean | null>(null);
  const [matchId, setMatchId] = useState(""),
    [target, setTarget] = useState<ArenaPlayer | null>(null),
    [viewedUserId, setViewedUserId] = useState(""),
    [portfolioNotification, setPortfolioNotification] = useState<{ slot: number; id: number } | null>(null),
    [profileBackTab, setProfileBackTab] = useState("home"),
    [invites, setInvites] = useState<Invite[]>([]),
    [respondingInvite, setRespondingInvite] = useState(""),
    [activeId, setActiveId] = useState(""),
    [sharedId, setSharedId] = useState(""),
    [pairingOpened, setPairingOpened] = useState(false),
    [localMatchActive, setLocalMatchActive] = useState(false),
    [offlineControl, setOfflineControl] = useState("10+0");
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const shownResults = useRef(new Set<string>());
  const welcomeDecision = useRef(false);
  const finishWelcome = (nextTab?:string) => {
    setShowWelcome(false);
    if(nextTab)setTab(nextTab);
  };
  const showOnlineResult = useCallback(
    (m: ArenaMatch) => {
      const ownId = profile?.user_id;
      if (
        !ownId ||
        !["finished", "cancelled"].includes(m.status) ||
        ![m.white_id, m.black_id].includes(ownId)
      )
        return;
      const aborted = m.status === "cancelled";
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
        outcome: aborted
          ? "aborted"
          :
          m.result === "draw" ? "draw" : m.result === side ? "win" : "loss",
        aborted,
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
    gps = useGpsPresence(member === true ? profile?.user_id : undefined);
  useLivePresence(member === true ? profile?.user_id : undefined, !!gps.enabled && !!gps.position, activeId, profile?.cbr ?? 88);
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
      const complete = isProfileComplete(current);
      setMember(complete);
      if (!complete) setTab("profile");
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
    const complete = isProfileComplete(p);
    setMember(complete);
    setProfile(p);
    setLocalOcbr(p.ocbr ?? 88);
    window.dispatchEvent(new Event("cb-profile-saved"));
    void refreshProfile();
    setTab(complete ? "home" : "profile");
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
    if (member && isProfileComplete(profile)) {
      setShowWelcome(true);
      return;
    }
    setShowWelcome(false);
    setTab("profile");
  }, [showSplash, member, profile]);
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
    // Realtime delivery can be delayed or unavailable on some mobile sessions.
    // Keep a lightweight inbox poll so targeted and KING challenges arrive
    // without requiring the recipient to restart the app.
    const stateTimer = window.setInterval(() => void refreshState(), 2000);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshState(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      live = false;
      window.clearInterval(stateTimer);
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
    "play-select",
    "offline",
    "pairing",
    "online",
    "challenge",
    "game",
    "watch",
    "channel",
    "replay",
    "tournaments",
    "cpu",
    "puzzles",
    "grand-arena",
    "classroom",
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
  const openNotification = (target: string) => {
    if (target.startsWith("chat-personal:")) return openSocial("chat", target.slice("chat-personal:".length), "personal");
    if (target.startsWith("chat-group:")) return openSocial("chat", target.slice("chat-group:".length), "group");
    if (target.startsWith("portfolio:")) {
      const slot = Number(target.slice("portfolio:".length));
      if (Number.isInteger(slot) && slot >= 0 && slot < 8) {
        setPortfolioNotification({ slot, id: Date.now() });
        navigate("profile");
        return;
      }
    }
    if (target === "chat-personal") return openSocial("chat", undefined, "personal");
    if (target === "chat-community") return openSocial("chat", undefined, "community");
    if (target === "chat-group") return openSocial("chat", undefined, "group");
    if (target === "friend-requests") return openSocial("friends", undefined, "requests");
    if (target === "followers") return openSocial("followers");
    if (target === "rewards" || target === "announcements" || target === "home") {
      setFeedTarget(target === "rewards" ? "rewards" : target === "announcements" ? "announcement" : "recent");
      navigate("home");
      return;
    }
    navigate(target);
  };
  let content;
  if (tab === "home")
    content = (
      <CommunityFeed
        key={feedTarget}
        initialTab={feedTarget}
        onMatch={openMatch}
        onArena={() => setTab("grand-arena")}
        onChallenge={(player) => {
          setTarget(player);
          setTab("challenge");
        }}
        onOpenProfile={(userId) => {
          setViewedUserId(userId);
          setProfileBackTab("home");
          setTab("public-profile");
        }}
      />
    );
  else if (tab === "public-profile")
    content = (
      <PublicProfile
        currentUserId={profile?.user_id}
        userId={viewedUserId}
        onClose={() => setTab(profileBackTab)}
        onChallenge={(player) => { setTarget(player); setTab("challenge"); }}
      />
    );
  else if (tab === "play-select")
    content = (
      <section className="play-select-page" aria-labelledby="play-select-title">
        <div className="play-select-heading"><span>Choose your destination</span><h1 id="play-select-title">Play Chess Burger</h1><p>Choose matches, enter the Arena, explore tournaments, or train with Coach Patty.</p></div>
        <div className="play-select-grid">
          <button className="play-destination lobby" type="button" onClick={() => setTab("play")}><img src="/play-selection/match-lobby.webp" alt="Colorful Chess Burger Match Lobby"/><span><strong>Match Lobby</strong><small>Online, CPU, nearby and offline matches</small><b>Enter Lobby <ChevronRight size={17}/></b></span></button>
          <button className="play-destination arena arena-live" type="button" onClick={() => setTab("grand-arena")}><img src="/play-selection/grand-arena.webp" alt="Chess Burger Grand Arena entrance"/><span><strong>Grand Arena</strong><small>Timed elimination battles with live standings</small><b>Enter Arena <ChevronRight size={17}/></b></span></button>
          <button className="play-destination puzzles" type="button" onClick={() => setTab("puzzles")}><img src="/play-selection/puzzle-quest.webp" alt="Chess Burger puzzle maze arena"/><span><strong>Puzzle Quest</strong><small>100 puzzles, Coach Patty and Gold rewards</small><b>Enter Puzzles <ChevronRight size={17}/></b></span></button>
          <button className="play-destination tournament" type="button" onClick={() => setTab("tournament-preview")}><img src="/play-selection/tournament.webp" alt="Cute chess characters competing for a gold tournament trophy"/><span><strong>Tournament</strong><small>Championships, friendly competition and chess glory</small><b>Explore Tournament <ChevronRight size={17}/></b></span></button>
        </div>
      </section>
    );
  else if (tab === "tournament-preview")
    content = <section className="tournament-coming-page"><button className="back-button" type="button" onClick={() => setTab("play-select")}><ArrowLeft size={16}/>Play destinations</button><div className="tournament-coming-card"><img src="/play-selection/tournament.webp" alt="Cute Chess Burger tournament characters and trophy"/><div><span>CHESS BURGER TOURNAMENT</span><h1>Tournament Coming Very Soon</h1><p>Get ready to compete with fellow chess players for the championship trophy.</p><button type="button" onClick={() => setTab("play-select")}>Back to Play destinations</button></div></div></section>;
  else if (tab === "play")
    content = (
      <section className="play-page">
        <button className="back-button" type="button" onClick={() => setTab("play-select")}><ArrowLeft size={15}/>Play selection</button>
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
        <button className="match-row available cpu-lobby-link" onClick={() => setTab("cpu")}>
          <span className="mode-symbol"><Bot size={21}/></span>
          <span className="mode-copy"><strong>Play with CPU</strong><small>Challenge 10 Chess Burger AI strength levels</small></span>
          <span className="mode-meta">Levels 1–10</span><ChevronRight size={15}/>
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
          setProfileBackTab("map");
          setTab("public-profile");
        }}
        onClaimed={() => void refreshProfile()}
      />
    );
  else if (tab === "rank") content = <Rankings profile={profile} onOpenProfile={(userId) => {setViewedUserId(userId);setProfileBackTab("rank");setTab("public-profile")}} />;
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
  else if (tab === "grand-arena") content = <GrandArena onBack={() => setTab("play-select")} onMatch={openMatch} onShop={() => setTab("shop")}/>;
  else if (tab === "classroom") content = <Classroom onBack={() => setTab("play-select")} onOpenShop={() => setTab("shop")}/>;
  else if (tab === "cpu" && profile) content = <CpuGame player={profile} onClose={() => setTab("play")} onReward={() => void refreshProfile()}/>;
  else if (tab === "puzzles" && profile) content = <Puzzles onClose={() => setTab("play")} onReward={() => void refreshProfile()}/>;
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
  else if (tab === "shop") content = <ShopPage profile={profile} onChanged={() => void refreshProfile()} />;
  else if (tab === "bag") content = <BagPage onChanged={() => void refreshProfile()} />;
  else if (tab === "guild") content = <GuildPage profile={profile} onChanged={() => void refreshProfile()} />;
  else if (tab === "cms" && staff)
    content = <Cms profile={profile} onClose={() => setTab("profile")} />;
  else
    content = (
      <section className="profile-page">
        <div className="page-heading">
          <h1>Player profile</h1>
        </div>
        <Account
          portfolioNotification={portfolioNotification}
          onLoaded={setProfile}
          onSaved={onSaved}
          onOpenCms={() => setTab("cms")}
          onMembershipChange={(m) => {
            setMember(m);
            if (!m) setTab("profile");
          }}
        />
        {member === true && (
          <><RecentPlays
            onReplay={(g) => {
              setReplayGame(g);
              setTab("replay");
            }}
          /><Testimonials profileId={profile?.user_id ?? ""} currentUserId={profile?.user_id}/></>
        )}
      </section>
    );
  if ((member !== true || !isProfileComplete(profile)) && !showSplash)
    return (
      <main className="app-shell registration-locked-shell">
        <header className="app-header">
          <div className="brand">
            <img src="/cburger_logo.png" alt="Chess Burger" />
            <span>CHESS <b>BURGER</b></span>
          </div>
        </header>
        <div className="scroll-area">
          <section className="profile-page registration-gate">
            <div className="page-heading">
              <h1>Complete your registration</h1>
              <p>Your name, username, country, and profile photo are required before you can enter Chess Burger.</p>
            </div>
            <Account
              registrationOnly
              onLoaded={setProfile}
              onSaved={onSaved}
              onMembershipChange={setMember}
            />
          </section>
        </div>
        <Toaster theme="light" position="top-center" richColors closeButton />
      </main>
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
                  finishWelcome("map");
                }}
              >
                <img src="/welcome/invasion.webp" alt="Chess pieces invading a territory map" />
                <strong>INVASION</strong>
              </button>
              <button
                className="welcome-card online"
                onClick={() => {
                  finishWelcome("play-select");
                }}
              >
                <img src="/welcome/play-online.webp" alt="Chess characters playing online" />
                <strong>PLAY ONLINE</strong>
              </button>
              <button
                className="welcome-card classroom"
                onClick={() => finishWelcome("classroom")}
              >
                <img src="/welcome/classroom.webp" alt="Chess classroom" />
                <strong>CLASS ROOM</strong>
              </button>
              <button className="welcome-card guild" onClick={() => finishWelcome("guild")}>
                <img src="/welcome/guild.webp" alt="Chess Burger guild tavern" />
                <strong>GUILD</strong>
              </button>
              <button className="welcome-card home" onClick={() => finishWelcome("home")}>
                <img src="/welcome/home.webp" alt="Chess Burger kingdom" />
                <strong>HOME</strong>
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
            className="header-classroom-button"
            aria-label="Open Classroom"
            onClick={() => navigate("classroom")}
          >
            <GraduationCap size={17} />
            <span>Classroom</span>
          </button>
          <NotificationBell userId={member === true && profile?.user_id !== "guest-device" ? profile?.user_id : undefined} invites={invites} onNavigate={openNotification} />
          <button
            className="header-about-button"
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
                <strong>{i.match_kind === "invasion" ? `${i.host_name} challenged your kingdom` : i.play_mode === "wager" ? `${i.host_name} offered a ${i.wager_gold} Gold bet` : `${i.host_name} invited you`}</strong>
                <span>
                  {timeControl(i.control).group} ·{" "}
                  {timeControl(i.control).label}
                  {i.play_mode === "wager" ? ` · Match ${i.wager_gold} Gold to play` : ""}
                </span>
                <button
                  className="gold-button"
                  disabled={respondingInvite === i.id || (i.play_mode === "wager" && Number(profile?.gold_points ?? 0) < Number(i.wager_gold ?? 0))}
                  onClick={() => {
                    setRespondingInvite(i.id);
                    void arena<{ match: ArenaMatch }>("join", { code: i.code })
                      .then((r) => openMatch(r.match.id))
                      .catch((e) => toast.error(e.message))
                      .finally(() => setRespondingInvite(""));
                  }}
                >
                  {respondingInvite === i.id ? "Processing…" : i.play_mode === "wager" && Number(profile?.gold_points ?? 0) < Number(i.wager_gold ?? 0) ? `Need ${i.wager_gold} Gold` : i.play_mode === "wager" ? "Accept Bet" : "Accept"}
                </button>
                <button
                  disabled={respondingInvite === i.id}
                  onClick={() => {
                    setRespondingInvite(i.id);
                    void arena("decline-room", { id: i.id })
                      .then(() => setInvites((v) => v.filter((m) => m.id !== i.id)))
                      .catch((e) => toast.error(e.message))
                      .finally(() => setRespondingInvite(""));
                  }}
                >
                  {i.play_mode === "wager" ? "Reject Bet" : "Decline"}
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
            onClick={() => { if (key === "home") setFeedTarget("recent"); if (key === "profile") setTab(key); else navigate(key === "play" ? "play-select" : key); }}
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
          summary && !summary.local && !summary.aborted
            ? () => {
                setSummary(null);
                setActiveId("");
                setMatchId(summary.id);
                setTab("watch");
              }
            : undefined
        }
        onLobby={() => {
          const arenaMatch = summary?.playMode === "arena";
          setSummary(null);
          setMatchId("");
          setActiveId("");
          setTab(arenaMatch ? "grand-arena" : "play");
        }}
      />
      <SocialHub
        profile={profile}
        onOpenProfile={(id) => {
          setViewedUserId(id);
          setProfileBackTab(tab);
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
