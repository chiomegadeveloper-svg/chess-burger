"use client";

import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  Heart,
  ChevronLeft,
  ChevronRight,
  Swords,
  Search,
  X,
  Ticket,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { FeedEvent, getSupabase } from "./supabase";
import { arena } from "./arena-client";
import { SocialButtons } from "./social";
import { levelFor } from "./cbr";
import type { ArenaMatch, ArenaPlayer } from "./game-rules";
import { feedBanner } from "./feed-banner-catalog";
import DailyRewards from "./daily-rewards";
import "./arena-champion-feed.css";
type CommunityEvent = FeedEvent & { origin?: "arena" };
type OnlinePlayer = ArenaPlayer & { available: boolean };

type FeedTab =
  "recent" | "popular" | "first_blood" | "announcement" | "online" | "rewards";
const PAGE_SIZE = 10,
  ONLINE_PAGE_SIZE = 60;
const labels: Record<string, string> = {
  profile_created: "New player",
  profile_updated: "Profile",
  win: "Win",
  first_blood: "First blood",
  new_reward: "Reward",
  top10: "Top 10 reward",
  announcement: "Announcement",
};
const cardStyles: Record<string, CSSProperties> = {
  shell: {
    position: "fixed",
    zIndex: 2147483000,
    top: "50%",
    left: "50%",
    width: "min(390px,calc(100vw - 24px))",
    maxHeight: "calc(100dvh - 32px)",
    padding: "clamp(13px,3vw,18px)",
    transform: "translate(-50%,-50%)",
    overflowY: "auto",
    boxSizing: "border-box",
    border: "2px solid #c8a842",
    borderRadius: 18,
    background: "linear-gradient(115deg,#293238,#0e171b 56%,#243138)",
    boxShadow:
      "inset 0 0 0 2px #11181c,inset 0 0 0 3px #786b35,0 18px 48px #000e",
    color: "#f4f7f8",
    fontFamily: "Poppins,sans-serif",
    isolation: "isolate",
  },
  logo: {
    display: "block",
    width: 34,
    height: 34,
    maxWidth: 34,
    maxHeight: 34,
    margin: "0 auto 12px",
    border: "1px solid #d9b84e",
    borderRadius: "50%",
    objectFit: "cover",
  },
  identity: {
    display: "grid",
    gridTemplateColumns:
      "clamp(62px,18vw,78px) minmax(0,1fr) clamp(44px,13vw,56px)",
    gap: "clamp(8px,2.5vw,13px)",
    alignItems: "center",
    minWidth: 0,
  },
  portrait: {
    display: "grid",
    placeItems: "center",
    width: "clamp(62px,18vw,78px)",
    height: "clamp(62px,18vw,78px)",
    minWidth: 0,
    padding: 0,
    overflow: "hidden",
    boxSizing: "border-box",
    border: "3px solid #5ee4ee",
    outline: "2px solid #d7b44d",
    borderRadius: "50%",
    background: "#244e59",
    color: "#fff",
    fontSize: 24,
    boxShadow: "0 0 16px #43dce955",
    cursor: "pointer",
  },
  portraitImage: {
    display: "block",
    width: "100%",
    height: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "cover",
    objectPosition: "center",
    borderRadius: "50%",
  },
  copy: { minWidth: 0, textAlign: "left" },
  handle: {
    display: "block",
    overflow: "hidden",
    color: "#55dce9",
    fontSize: "clamp(8px,2.4vw,10px)",
    lineHeight: 1.4,
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  name: {
    display: "block",
    margin: "3px 0",
    overflow: "hidden",
    fontSize: "clamp(15px,4.4vw,20px)",
    lineHeight: 1.16,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  status: { display: "block", color: "#42e98a", fontSize: 10, fontWeight: 700 },
  levelName: {
    display: "block",
    marginTop: 2,
    color: "#b5c9cf",
    fontSize: 9,
    lineHeight: 1.4,
  },
  emblem: {
    display: "block",
    width: "clamp(44px,13vw,56px)",
    height: "clamp(52px,16vw,68px)",
    maxWidth: 56,
    maxHeight: 68,
    objectFit: "contain",
    filter: "drop-shadow(0 4px 6px #000c)",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(4,minmax(0,1fr))",
    marginTop: 15,
    paddingTop: 11,
    borderTop: "1px solid #56c7d2",
    textAlign: "center",
  },
  stat: { minWidth: 0, padding: "0 4px" },
  statValue: {
    display: "block",
    overflow: "hidden",
    fontSize: "clamp(14px,4vw,18px)",
    lineHeight: 1.15,
    textOverflow: "ellipsis",
  },
  statLabel: {
    display: "block",
    marginTop: 3,
    color: "#aebfc5",
    fontSize: "clamp(7px,2vw,8px)",
    textTransform: "uppercase",
  },
  actions: {
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 8,
    marginTop: 13,
  },
  action: {
    display: "inline-flex",
    flex: "1 1 0",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 34,
    padding: "7px 10px",
    boxSizing: "border-box",
    border: "1px solid #4d5b63",
    borderRadius: 9,
    background: "#202c32",
    color: "#dbe7ea",
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
  },
  challenge: {
    border: "1px solid #b89035",
    background: "linear-gradient(145deg,#e8c66c,#9e7022)",
    color: "#171107",
    fontWeight: 800,
  },
  state: {
    display: "inline-flex",
    flex: "1 1 0",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    padding: "7px 10px",
    boxSizing: "border-box",
    border: "1px solid #4d5b63",
    borderRadius: 9,
    background: "#202c32",
    color: "#dbe7ea",
    fontSize: 10,
  },
};

export default function CommunityFeed({
  onOpenProfile,
  onMatch,
  onChallenge,
  onArena,
}: {
  onOpenProfile: (userId: string) => void;
  onMatch: (id: string) => void;
  onChallenge: (player: ArenaPlayer) => void;
  onArena: () => void;
}) {
  const [tab, setTab] = useState<FeedTab>("recent"),
    [page, setPage] = useState(1),
    [events, setEvents] = useState<CommunityEvent[]>([]);
  const [challenges, setChallenges] = useState<CommunityEvent[]>([]),
    [accepting, setAccepting] = useState<string | null>(null);
  const [arenaOpen, setArenaOpen] = useState<{ content: string } | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlinePlayer[]>([]),
    [onlineSearch, setOnlineSearch] = useState(""),
    [onlineCard, setOnlineCard] = useState<string | null>(null),
    [onlinePage, setOnlinePage] = useState(1);
  const request = useRef(0),
    onlineCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [total, setTotal] = useState(0),
    [status, setStatus] = useState("Loading activity…"),
    [userId, setUserId] = useState<string | null>(null),
    [reacted, setReacted] = useState<Set<string>>(new Set());
  const refresh = useCallback(async () => {
    const seq = ++request.current;
    if (tab === "rewards") {
      setTotal(0);
      setEvents([]);
      setStatus("");
      return;
    }
    const [localFeed, online, me, arenaWindow] = await Promise.allSettled([
      arena<{ events: CommunityEvent[] }>("feed", {}, true),
      arena<{ users: OnlinePlayer[]; count: number }>("online-users", {}, true),
      arena<{ profile: ArenaPlayer }>("me"),
      fetch("/api/grand-arena?action=window", { cache: "no-store" }).then(
        (response) => response.json(),
      ),
    ]);
    if (seq !== request.current) return;
    const users: OnlinePlayer[] =
      online.status === "fulfilled" ? [...online.value.users] : [];
    if (
      me.status === "fulfilled" &&
      me.value.profile?.user_id &&
      !users.some((player) => player.user_id === me.value.profile.user_id)
    ) {
      users.unshift({ ...me.value.profile, available: true });
    }
    setOnlineUsers(users);
    setArenaOpen(
      arenaWindow.status === "fulfilled" && arenaWindow.value?.open
        ? {
            content: `The ${arenaWindow.value.current?.slot === 1 ? "7–9 PM" : "10 PM–12 MN"} Grand Arena is open. Use 1 Arena Ticket to enter.`,
          }
        : null,
    );
    const ownProfile =
      me.status === "fulfilled"
        ? (me.value.profile as ArenaPlayer & { active_feed_banner?: string })
        : null;
    const all = [
      ...(localFeed.status === "fulfilled" ? localFeed.value.events : []),
    ]
      .map((event) =>
        event.feed_banner || !ownProfile || event.user_id !== ownProfile.user_id
          ? event
          : { ...event, feed_banner: ownProfile.active_feed_banner ?? "" },
      )
      .filter((e) => !e.expires_at || Date.parse(e.expires_at) > Date.now());
    setChallenges(
      all
        .filter((e) => e.kind === "challenge")
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    );
    let rows = all
      .filter((e) => e.kind !== "challenge")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 50);
    if (tab === "first_blood")
      rows = rows.filter((e) => e.kind === "first_blood");
    if (tab === "announcement")
      rows = rows.filter((e) => e.kind === "announcement");
    if (tab === "popular")
      rows.sort(
        (a, b) =>
          b.heart_count - a.heart_count ||
          Date.parse(b.created_at) - Date.parse(a.created_at),
      );
    if (tab === "recent")
      rows.sort(
        (a, b) =>
          Number(b.kind === "announcement") -
            Number(a.kind === "announcement") ||
          Date.parse(b.created_at) - Date.parse(a.created_at),
      );
    if (tab === "online") {
      setTotal(users.length);
      setEvents([]);
      setStatus(
        users.length
          ? ""
          : online.status === "rejected"
            ? "Online players are temporarily unavailable."
            : "No players are online right now.",
      );
    } else {
      setTotal(rows.length);
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (page > pages) {
        setPage(pages);
        return;
      }
      setEvents(rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      setStatus(
        rows.length || all.some((e) => e.kind === "challenge")
          ? ""
          : localFeed.status === "rejected"
            ? "Community activity is temporarily unavailable."
            : "No activity in this view yet.",
      );
    }
    try {
      const c = await getSupabase(),
        session = c ? (await c.auth.getSession()).data.session : null;
      if (seq !== request.current) return;
      setUserId(session?.user.id ?? null);
      if (c && session) {
        const [supHearts, gameHearts] = await Promise.allSettled([
          c
            .from("cb_feed_reactions")
            .select("feed_id")
            .eq("user_id", session.user.id),
          arena<{ ids: string[] }>("hearts"),
        ]);
        if (seq === request.current)
          setReacted(
            new Set([
              ...(supHearts.status === "fulfilled"
                ? (supHearts.value.data ?? [])
                : []
              ).map((r) => r.feed_id as string),
              ...(gameHearts.status === "fulfilled"
                ? gameHearts.value.ids
                : []),
            ]),
          );
      } else setReacted(new Set());
    } catch {}
  }, [page, tab]);
  useEffect(() => {
    let active = true;
    const load = () =>
      void refresh().catch(() => {
        if (active) setStatus("Community activity is temporarily unavailable.");
      });
    load();
    const timer = setInterval(load, tab === "online" ? 5000 : 10000);
    const expiry = setInterval(() => {
      setEvents((rows) =>
        rows.filter(
          (e) => !e.expires_at || Date.parse(e.expires_at) > Date.now(),
        ),
      );
      setChallenges((rows) =>
        rows.filter(
          (e) => !e.expires_at || Date.parse(e.expires_at) > Date.now(),
        ),
      );
    }, 1000);
    window.addEventListener("cb-profile-saved", load);
    return () => {
      active = false;
      request.current++;
      clearInterval(timer);
      clearInterval(expiry);
      window.removeEventListener("cb-profile-saved", load);
    };
  }, [refresh]);
  const pendingHearts = useRef(new Set<string>());
  async function toggleHeart(event: CommunityEvent) {
    if (!userId) {
      toast.info("Sign in from Profile to react.");
      return;
    }
    if (pendingHearts.current.has(event.id)) return;
    pendingHearts.current.add(event.id);
    const has = reacted.has(event.id);
    setReacted((prev) => {
      const next = new Set(prev);
      if (has) next.delete(event.id);
      else next.add(event.id);
      return next;
    });
    setEvents((prev) =>
      prev.map((item) =>
        item.id === event.id
          ? {
              ...item,
              heart_count: Math.max(0, item.heart_count + (has ? -1 : 1)),
            }
          : item,
      ),
    );
    try {
      await arena("heart", { id: event.id, liked: !has });
    } catch {
      toast.error("Reaction was not saved.");
      await refresh();
    } finally {
      pendingHearts.current.delete(event.id);
    }
  }
  async function acceptChallenge(event: CommunityEvent) {
    if (!userId) {
      toast.info("Sign in to accept this challenge.");
      return;
    }
    if (accepting) return;
    setAccepting(event.id);
    try {
      const r = await arena<{ match: ArenaMatch }>("accept-challenge", {
        id: event.id.slice("challenge:".length),
      });
      onMatch(r.match.id);
    } catch (e) {
      toast.error((e as Error).message);
      void refresh();
    } finally {
      setAccepting(null);
    }
  }
  function keepOnlineCard(id: string) {
    if (onlineCloseTimer.current) clearTimeout(onlineCloseTimer.current);
    onlineCloseTimer.current = null;
    setOnlineCard(id);
  }
  function closeOnlineCard(delay = 700) {
    if (onlineCloseTimer.current) clearTimeout(onlineCloseTimer.current);
    onlineCloseTimer.current = setTimeout(() => setOnlineCard(null), delay);
  }
  useEffect(
    () => () => {
      if (onlineCloseTimer.current) clearTimeout(onlineCloseTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!onlineCard) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !target.closest(".cb-online-player-card") &&
        !target.closest(`[data-online-player="${onlineCard}"]`)
      )
        setOnlineCard(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [onlineCard]);
  function selectTab(next: FeedTab) {
    request.current++;
    setEvents([]);
    setExpandedImage(null);
    setOnlineCard(null);
    setStatus("Loading activity…");
    setTab(next);
    setPage(1);
    setOnlinePage(1);
  }
  const pages = Math.max(1, Math.min(5, Math.ceil(total / PAGE_SIZE)));
  const search = onlineSearch.trim().toLowerCase();
  const shownOnline = onlineUsers.filter(
    (player) =>
      !search ||
      player.display_name.toLowerCase().includes(search) ||
      player.username.toLowerCase().includes(search),
  );
  const onlinePages = Math.max(
    1,
    Math.ceil(shownOnline.length / ONLINE_PAGE_SIZE),
  );
  const visibleOnline = shownOnline.slice(
    (onlinePage - 1) * ONLINE_PAGE_SIZE,
    onlinePage * ONLINE_PAGE_SIZE,
  );
  return (
    <section className="feed-page">
      <div className="page-heading">
        <h1>
          {tab === "announcement"
            ? "Announcements"
            : tab === "online"
              ? "Online players"
              : tab === "rewards"
                ? "Daily Rewards"
                : "Community feed"}
        </h1>
        <span className="sample-label">
          {tab === "announcement"
            ? "Official updates"
            : tab === "online"
              ? `${onlineUsers.length} online`
              : tab === "rewards"
                ? "7-day login streak"
                : "Latest 50"}
        </span>
      </div>
      <div
        className="feed-tabs community-feed-tabs"
        role="tablist"
        aria-label="Community feed views"
      >
        <button
          role="tab"
          aria-label="Recent feed"
          aria-selected={tab === "recent"}
          onClick={() => selectTab("recent")}
        >
          <span className="tab-label-full">Recent feed</span>
          <span className="tab-label-short">Feed</span>
        </button>
        <button
          className="online-feed-tab"
          role="tab"
          aria-selected={tab === "online"}
          onClick={() => selectTab("online")}
        >
          Online{" "}
          <span
            className="online-count-badge"
            aria-label={`${onlineUsers.length} users online`}
          >
            {onlineUsers.length}
          </span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "popular"}
          onClick={() => selectTab("popular")}
        >
          Popular
        </button>
        <button
          role="tab"
          aria-label="First blood"
          aria-selected={tab === "first_blood"}
          onClick={() => selectTab("first_blood")}
        >
          <span className="tab-label-full">First blood</span>
          <span className="tab-label-short">First</span>
        </button>
        <button
          role="tab"
          aria-label="Announcements"
          aria-selected={tab === "announcement"}
          onClick={() => selectTab("announcement")}
        >
          <span className="tab-label-full">Announcements</span>
          <span className="tab-label-short">News</span>
        </button>
        <button
          className="rewards-feed-tab"
          role="tab"
          aria-selected={tab === "rewards"}
          onClick={() => selectTab("rewards")}
        >
          Rewards
        </button>
      </div>
      {tab === "rewards" && <DailyRewards />}
      {tab === "recent" && arenaOpen && (
        <button type="button" className="arena-feed-invite" onClick={onArena}>
          <span className="arena-feed-art">
            <img src="/play-selection/grand-arena.webp" alt="Grand Arena" />
          </span>
          <span>
            <small>GRAND ARENA IS OPEN</small>
            <strong>Enter the live competition</strong>
            <em>{arenaOpen.content}</em>
          </span>
          <b>
            <Ticket size={14} />
            Enter Arena
          </b>
        </button>
      )}
      {tab === "recent" && challenges.length > 0 && (
        <section className="pinned-challenges" aria-label="Open challenges">
          <h2>Open challenges</h2>
          {challenges.map((event) => (
            <article className="pinned-challenge" key={event.id}>
              <span className="challenge-glow" aria-hidden="true" />
              <span className="challenge-info">
                <Swords size={19} />
                <span>
                  <strong>{event.display_name}</strong>
                  <small>
                    {event.content
                      .replace(/^is looking for a /, "")
                      .replace(/^is looking for /, "")}
                  </small>
                </span>
              </span>
              <button
                className="gold-button"
                disabled={accepting !== null || event.user_id === userId}
                onClick={() => void acceptChallenge(event)}
              >
                {event.user_id === userId
                  ? "Your challenge"
                  : accepting === event.id
                    ? "Joining…"
                    : "Accept challenge"}
              </button>
            </article>
          ))}
        </section>
      )}
      {status && (
        <p className="account-note" role="status">
          {status}
        </p>
      )}
      {tab === "online" && (
        <section className="online-directory" aria-label="Online players">
          <p
            className="online-description"
            style={{
              maxWidth: "560px",
              margin: "0 auto 14px",
              textAlign: "center",
            }}
          >
            Tap and challenge a player.
          </p>
          <label
            className="online-search"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "min(100%,420px)",
              margin: "0 auto 22px",
              padding: "0 12px",
              boxSizing: "border-box",
            }}
          >
            <Search size={16} />
            <input
              style={{
                display: "block",
                flex: "1 1 auto",
                width: "100%",
                minWidth: 0,
                textAlign: "left",
              }}
              value={onlineSearch}
              onChange={(event) => {
                setOnlineSearch(event.target.value);
                setOnlinePage(1);
              }}
              placeholder="Search online players"
              aria-label="Search online players"
            />
            <button
              type="button"
              aria-label="Clear online player search"
              disabled={!onlineSearch}
              onClick={() => setOnlineSearch("")}
            >
              <X size={14} />
            </button>
          </label>
          {visibleOnline.length > 0 && (
            <div
              className="online-avatars"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6,minmax(0,1fr))",
                alignItems: "start",
                justifyItems: "center",
                gap: "18px 10px",
                width: "100%",
                maxWidth: "720px",
                margin: "0 auto",
              }}
            >
              {visibleOnline.map((player) => {
                const open = onlineCard === player.user_id,
                  own = player.user_id === userId,
                  level = levelFor(player.cbr),
                  games = player.wins + player.losses,
                  winRate = games ? Math.round((player.wins / games) * 100) : 0;
                return (
                  <div
                    className="online-player"
                    style={{
                      position: "relative",
                      display: "grid",
                      placeItems: "center",
                      width: "100%",
                      minWidth: 0,
                    }}
                    key={player.user_id}
                    onMouseEnter={() => keepOnlineCard(player.user_id)}
                    onMouseLeave={() => closeOnlineCard()}
                  >
                    <button
                      className="online-avatar-button"
                      data-online-player={player.user_id}
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: "clamp(44px,6vw,60px)",
                        height: "clamp(44px,6vw,60px)",
                        padding: 0,
                        border: 0,
                        borderRadius: "50%",
                        background: "transparent",
                        boxShadow: "none",
                        cursor: "pointer",
                      }}
                      type="button"
                      onFocus={() => keepOnlineCard(player.user_id)}
                      onBlur={() => closeOnlineCard()}
                      onClick={() =>
                        onlineCard === player.user_id
                          ? setOnlineCard(null)
                          : keepOnlineCard(player.user_id)
                      }
                      aria-expanded={open}
                      aria-label={`Open ${player.display_name}'s player card`}
                    >
                      <span
                        className="online-avatar"
                        style={{
                          display: "grid",
                          placeItems: "center",
                          width: "clamp(42px,5.5vw,56px)",
                          height: "clamp(42px,5.5vw,56px)",
                          aspectRatio: "1",
                          border: "2px solid #e7bd62",
                          borderRadius: "50%",
                          overflow: "hidden",
                          flex: "0 0 auto",
                          background: "#24323a",
                          boxShadow: "0 0 0 3px #20262d,0 5px 14px #0008",
                        }}
                      >
                        {player.avatar_url ? (
                          <img
                            src={player.avatar_url}
                            alt=""
                            style={{
                              display: "block",
                              width: "100%",
                              height: "100%",
                              maxWidth: "100%",
                              objectFit: "cover",
                              objectPosition: "center",
                              borderRadius: "50%",
                            }}
                          />
                        ) : (
                          player.display_name.charAt(0)
                        )}
                      </span>
                      <i className="online-presence-dot" aria-hidden="true" />
                    </button>
                    {open &&
                      typeof document !== "undefined" &&
                      createPortal(
                        <article
                          className="cb-online-player-card"
                          style={cardStyles.shell}
                          role="dialog"
                          aria-modal="false"
                          aria-label={`${player.display_name} player card`}
                          onMouseEnter={() => keepOnlineCard(player.user_id)}
                          onMouseLeave={() => closeOnlineCard()}
                        >
                          <img
                            src="/cburger_logo.png"
                            alt="Chess Burger"
                            style={cardStyles.logo}
                          />
                          <div style={cardStyles.identity}>
                            <button
                              type="button"
                              style={cardStyles.portrait}
                              onClick={() => onOpenProfile(player.user_id)}
                              aria-label={`View ${player.display_name}'s profile`}
                            >
                              {player.avatar_url ? (
                                <img
                                  src={player.avatar_url}
                                  alt=""
                                  style={cardStyles.portraitImage}
                                />
                              ) : (
                                player.display_name.charAt(0)
                              )}
                            </button>
                            <div style={cardStyles.copy}>
                              <small style={cardStyles.handle}>
                                @{player.username} · {player.country_code}
                              </small>
                              <strong style={cardStyles.name}>
                                {player.display_name}
                              </strong>
                              <span style={cardStyles.status}>● Online</span>
                              <small style={cardStyles.levelName}>
                                Level {level.level} · {level.name}
                              </small>
                            </div>
                            <img
                              src={`/levels/level-${String(level.level - 1).padStart(2, "0")}.png`}
                              alt={level.name}
                              style={cardStyles.emblem}
                            />
                          </div>
                          <div style={cardStyles.stats}>
                            {[
                              [player.cbr, "CBR"],
                              [player.ocbr ?? 88, "OCBR"],
                              [player.gold_points, "Gold"],
                              [`${winRate}%`, "Win rate"],
                            ].map(([value, label], index) => (
                              <div
                                key={label}
                                style={{
                                  ...cardStyles.stat,
                                  ...(index
                                    ? { borderLeft: "1px solid #8e7b43" }
                                    : {}),
                                }}
                              >
                                <b style={cardStyles.statValue}>{value}</b>
                                <small style={cardStyles.statLabel}>
                                  {label}
                                </small>
                              </div>
                            ))}
                          </div>
                          <div style={cardStyles.actions}>
                            <button
                              type="button"
                              style={cardStyles.action}
                              onClick={() => onOpenProfile(player.user_id)}
                            >
                              View profile
                            </button>
                            {own ? (
                              <span style={cardStyles.state}>This is you</span>
                            ) : player.available ? (
                              <button
                                type="button"
                                style={{
                                  ...cardStyles.action,
                                  ...cardStyles.challenge,
                                }}
                                onClick={() => onChallenge(player)}
                              >
                                <Swords size={14} />
                                Challenge
                              </button>
                            ) : (
                              <span style={cardStyles.state}>In a match</span>
                            )}
                          </div>
                        </article>,
                        document.body,
                      )}
                  </div>
                );
              })}
            </div>
          )}
          {!status && shownOnline.length === 0 && (
            <p className="account-note">
              No online player matches that search.
            </p>
          )}
          {onlinePages > 1 && (
            <nav
              className="feed-pagination online-pagination"
              aria-label="Online player pages"
            >
              <button
                disabled={onlinePage === 1}
                onClick={() => {
                  setOnlineCard(null);
                  setOnlinePage((value) => value - 1);
                }}
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <span>
                Page {onlinePage} of {onlinePages}
              </span>
              <button
                disabled={onlinePage >= onlinePages}
                onClick={() => {
                  setOnlineCard(null);
                  setOnlinePage((value) => value + 1);
                }}
              >
                Next
                <ChevronRight size={15} />
              </button>
            </nav>
          )}
        </section>
      )}
      <ol className="community-list">
        {events.map((event) => {
          const date = new Date(event.created_at),
            level = levelFor(event.cbr),
            announcement = event.kind === "announcement",
            arenaChampion = event.content.startsWith("won Grand Arena Session"),
            avatarUrl = announcement ? "/cburger_logo.png" : event.avatar_url,
            banner = feedBanner(event.feed_banner),
            bannerStyle = banner
              ? ({
                  "--feed-banner": banner.background,
                  "--feed-banner-ink": banner.ink,
                } as CSSProperties)
              : undefined;
          return (
            <li
              key={event.id}
              className={`feed-cloud kind-${event.kind}${banner ? " has-feed-banner" : ""}${arenaChampion ? " grand-arena-champion-feed" : ""}`}
              style={bannerStyle}
            >
              <button
                className="feed-player"
                disabled={announcement}
                onClick={() => !announcement && onOpenProfile(event.user_id)}
                aria-label={
                  announcement
                    ? "Chess Burger announcement"
                    : `Open ${event.display_name}'s profile`
                }
              >
                <span className="feed-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    event.display_name.charAt(0)
                  )}
                </span>
              </button>
              {!announcement && (
                <img
                  className="feed-level"
                  src={`/levels/level-${String(level.level - 1).padStart(2, "0")}.png`}
                  alt={`Level ${level.level}`}
                />
              )}
              <div className="feed-copy">
                {arenaChampion && (
                  <span className="arena-champion-ribbon">
                    <Crown size={13} /> GRAND ARENA CHAMPION
                  </span>
                )}
                <div className="feed-meta">
                  <span className="feed-kind">
                    {arenaChampion
                      ? "Champion"
                      : (labels[event.kind] ?? event.kind.replaceAll("_", " "))}
                  </span>
                  <time dateTime={event.created_at}>
                    {date.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {date.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>
                  {announcement ? (
                    <strong className="feed-name">Chess Burger</strong>
                  ) : (
                    <button
                      className="feed-name"
                      onClick={() => onOpenProfile(event.user_id)}
                    >
                      {event.display_name}
                    </button>
                  )}
                  <span className="feed-activity">
                    {" "}
                    {event.content || "shared an update."}
                  </span>
                </p>
                {announcement && (
                  <span className="announcement-pin">PINNED ANNOUNCEMENT</span>
                )}
                {event.image_url && (
                  <button
                    type="button"
                    className={
                      "announcement-image-button " +
                      (expandedImage === event.id ? "expanded" : "")
                    }
                    aria-expanded={expandedImage === event.id}
                    aria-label={
                      (expandedImage === event.id ? "Collapse" : "Expand") +
                      " announcement photo"
                    }
                    onClick={() =>
                      setExpandedImage((current) =>
                        current === event.id ? null : event.id,
                      )
                    }
                  >
                    <img
                      className="announcement-image"
                      src={event.image_url}
                      alt="Announcement attachment"
                    />
                  </button>
                )}
                <div className="feed-rewards">
                  {event.cbr_delta !== 0 && (
                    <span className="feed-detail">
                      {event.cbr_delta > 0 ? "+" : ""}
                      {event.cbr_delta} CBR
                    </span>
                  )}
                  {event.gold_delta !== 0 && (
                    <span className="feed-gold">
                  {arenaChampion ? "Champion Pot · " : ""}
                  {event.gold_delta > 0 ? "+" : ""}
                      {event.gold_delta} Gold
                    </span>
                  )}
                </div>
                {!announcement && userId && event.user_id !== userId && (
                  <SocialButtons
                    key={userId + ":" + event.user_id}
                    target={event.user_id}
                    compact
                  />
                )}
              </div>
              <button
                className={
                  "heart-button " + (reacted.has(event.id) ? "reacted" : "")
                }
                aria-label={
                  (reacted.has(event.id) ? "Remove" : "Add") + " heart reaction"
                }
                aria-pressed={reacted.has(event.id)}
                onClick={() => void toggleHeart(event)}
              >
                <Heart
                  size={17}
                  fill={reacted.has(event.id) ? "currentColor" : "none"}
                />
                <span>{event.heart_count}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {tab !== "online" && total > PAGE_SIZE && (
        <nav className="feed-pagination" aria-label="Feed pages">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={15} />
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight size={15} />
          </button>
        </nav>
      )}
    </section>
  );
}
