"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { arena } from "./arena-client";
import { toast } from "sonner";
import type { PlayerProfile } from "./supabase";
import { levelFor } from "./cbr";
import type { ArenaPlayer } from "./game-rules";
import { MessageCircle, ShieldBan, Volume2, VolumeX, X } from "lucide-react";
export type SocialView = "friends" | "followers" | "chat";
type SocialOpenDetail = { view: SocialView; target?: string };
let socialOpenHandler: ((detail: SocialOpenDetail) => void) | null = null;
export function openSocial(view: SocialView, target?: string) {
  const detail = { view, target };
  if (socialOpenHandler) {
    socialOpenHandler(detail);
    return;
  }
  window.dispatchEvent(
    new CustomEvent("cb-social-open", { detail }),
  );
}
type Status = {
  blocked: boolean;
  blockedByMe: boolean;
  following: boolean;
  friendship: string | null;
};
type Person = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  cbr: number;
  seen_at: number;
  following: boolean;
  friendship: string | null;
  muted?: boolean;
  last_message?: string;
  last_at?: number;
};
type Listing = { users: Person[]; total: number; page: number; pages: number };
type Message = {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  display_name: string;
  body: string;
  created_at: number;
};
export function SocialButtons({
  target,
  onBlocked,
  compact = false,
}: {
  target: string;
  onBlocked?: () => void;
  compact?: boolean;
}) {
  const [state, setState] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++request.current;
    try {
      const data = await arena<Status>("social-status", { target });
      if (seq === request.current) {
        setState(data);
        setError("");
      }
    } catch {
      if (seq === request.current) {
        setState(null);
        setError("Social connection unavailable. Please retry.");
      }
    }
  }, [target]);
  useEffect(() => {
    setState(null);
    setError("");
    void refresh();
    const changed = () => void refresh();
    window.addEventListener("cb-social-changed", changed);
    return () => {
      request.current++;
      window.removeEventListener("cb-social-changed", changed);
    };
  }, [refresh]);
  async function act(op: string) {
    setBusy(true);
    setError("");
    try {
      await arena("social-update", { target, op });
      await refresh();
      window.dispatchEvent(new Event("cb-social-changed"));
      if (op === "block") onBlocked?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={"social-actions" + (compact ? " social-actions-compact" : "")}
      role="group"
      aria-label="Player social actions"
    >
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </p>
      )}
      {state?.blocked ? (
        <>
          <span>Player blocked</span>
          {state.blockedByMe && (
            <button disabled={busy} onClick={() => void act("unblock")}>
              Unblock
            </button>
          )}
        </>
      ) : (
        <>
          <button
            disabled={
              busy ||
              !state ||
              state.friendship === "sent" ||
              state.friendship === "accepted"
            }
            onClick={() =>
              void act(state?.friendship === "received" ? "accept" : "friend")
            }
          >
            {state?.friendship === "accepted"
              ? "Friends"
              : state?.friendship === "sent"
                ? "Request sent"
                : state?.friendship === "received"
                  ? "Accept friend"
                  : "Add friend"}
          </button>
          <button
            disabled={busy || !state}
            onClick={() => void act(state?.following ? "unfollow" : "follow")}
          >
            {state?.following ? "Following" : "Follow"}
          </button>
          <>
            <button type="button" onClick={() => openSocial("chat", target)}>
              Chat
            </button>
            {!compact && (
              <button
                className="danger"
                disabled={busy || !state}
                onClick={() => void act("block")}
              >
                Block
              </button>
            )}
          </>
        </>
      )}
    </div>
  );
}

type ChatButtonPosition = { x: number; y: number };
function savedChatButtonPosition(): ChatButtonPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(
      localStorage.getItem("cb-chat-button-position:v1") ?? "null",
    );
    return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ? saved
      : null;
  } catch {
    return null;
  }
}
export function FloatingChatButton({ visible }: { visible: boolean }) {
  const [position, setPosition] = useState<ChatButtonPosition | null>(
      savedChatButtonPosition,
    ),
    positionRef = useRef<ChatButtonPosition | null>(position),
    drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null),
    suppressClick = useRef(false);
  if (!visible) return null;
  const style = position
    ? { left: position.x, top: position.y }
    : { right: 18, bottom: 86 };
  return (
    <button
      type="button"
      className="floating-chat-button"
      style={style}
      aria-label="Open chat. Drag to move."
      title="Chat · drag to move"
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        drag.current = {
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const next = {
          x: Math.max(
            8,
            Math.min(window.innerWidth - 64, event.clientX - drag.current.dx),
          ),
          y: Math.max(
            72,
            Math.min(window.innerHeight - 132, event.clientY - drag.current.dy),
          ),
        };
        if (Math.abs(event.movementX) + Math.abs(event.movementY) > 2)
          drag.current.moved = true;
        positionRef.current = next;
        setPosition(next);
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        const moved = drag.current.moved;
        drag.current = null;
        suppressClick.current = moved;
        if (positionRef.current)
          try {
            localStorage.setItem(
              "cb-chat-button-position:v1",
              JSON.stringify(positionRef.current),
            );
          } catch {}
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        openSocial("chat");
      }}
    >
      <MessageCircle size={24} />
      <span>Chat</span>
    </button>
  );
}
export function SocialHub({
  profile,
  onOpenProfile,
}: {
  profile: PlayerProfile | null;
  onOpenProfile: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<SocialView>("friends"),
    [mode, setMode] = useState("friends"),
    [target, setTarget] = useState(""),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [list, setList] = useState<Listing | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [hasMore, setHasMore] = useState(false),
    [before, setBefore] = useState<number | undefined>(),
    [draft, setDraft] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const pendingMessage = useRef<{
    key: string;
    body: string;
    id: string;
  } | null>(null);
  const seq = useRef(0),
    drafts = useRef<Record<string, string>>({}),
    draftKey = useRef(""),
    current = useRef("");
  current.current = `${view}:${mode}:${target}:${page}:${q}:${before}`;
  useEffect(() => {
    const show = (detail: SocialOpenDetail) => {
      if (!profile || profile.user_id === "guest-device") {
        toast.info("Sign in to use friends and chat.");
        return;
      }
      seq.current++;
      setView(detail.view);
      setMode(
        detail.view === "chat"
          ? detail.target
            ? "personal"
            : "community"
          : detail.view,
      );
      setTarget(detail.target ?? "");
      setQ("");
      setPage(1);
      setBefore(undefined);
      setList(null);
      setMessages([]);
      setError("");
      setOpen(true);
    };
    const onOpen = (event: Event) =>
      show((event as CustomEvent<SocialOpenDetail>).detail);
    socialOpenHandler = show;
    window.addEventListener("cb-social-open", onOpen);
    return () => {
      if (socialOpenHandler === show) socialOpenHandler = null;
      window.removeEventListener("cb-social-open", onOpen);
    };
  }, [profile]);
  useEffect(() => {
    if (!profile || profile.user_id === "guest-device") return;
    const ping = () => {
      if (document.visibilityState === "visible")
        void arena("social-presence").catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 25000);
    return () => clearInterval(timer);
  }, [profile?.user_id]);
  useEffect(() => {
    setOpen(false);
    drafts.current = {};
    pendingMessage.current = null;
    setDraft("");
  }, [profile?.user_id]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  useEffect(() => {
    const key = mode === "personal" ? target : "community";
    draftKey.current = key;
    setDraft(drafts.current[key] ?? "");
  }, [mode, target]);
  const chat = view === "chat";
  const refresh = useCallback(async () => {
    if (!open) return;
    const ticket = ++seq.current;
    try {
      if (chat) {
        const [conversations, data] = await Promise.all([
          mode === "personal"
            ? arena<Listing>("chat-conversations", { target })
            : Promise.resolve(null),
          mode === "community" || target
            ? arena<{ messages: Message[]; hasMore: boolean }>("chat-read", {
                target: mode === "personal" ? target : "",
                ...(before ? { before } : {}),
              })
            : Promise.resolve({ messages: [], hasMore: false }),
        ]);
        if (ticket === seq.current) {
          setMessages(data.messages);
          setHasMore(data.hasMore);
          if (conversations) setList(conversations);
        }
      } else {
        const data = await arena<Listing>("social-list", {
          mode: mode === "personal" ? "conversations" : q ? "search" : mode,
          q,
          page,
        });
        if (ticket === seq.current) {
          setList(data);
        }
      }
      if (ticket === seq.current) setError("");
    } catch (e) {
      if (ticket === seq.current) {
        setError((e as Error).message);
        setMessages([]);
        setList(null);
      }
    } finally {
      if (ticket === seq.current) setLoading(false);
    }
  }, [open, chat, mode, target, q, page, before]);
  useEffect(() => {
    seq.current++;
    setList(null);
    setMessages([]);
    if (!open) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => void refresh(), 200),
      timer = setInterval(() => void refresh(), 15000);
    const changed = () => void refresh();
    window.addEventListener("cb-social-changed", changed);
    return () => {
      seq.current++;
      clearTimeout(timeout);
      clearInterval(timer);
      window.removeEventListener("cb-social-changed", changed);
    };
  }, [open, refresh]);
  function select(next: string) {
    seq.current++;
    setMode(next);
    setPage(1);
    setQ("");
    setTarget("");
    setBefore(undefined);
    setError("");
  }
  async function act(p: Person, op: string) {
    setBusy(true);
    try {
      await arena("social-update", { target: p.user_id, op });
      const closesChat = op === "block" && target === p.user_id;
      if (closesChat) {
        setTarget("");
        setMessages([]);
      }
      if (!closesChat) await refresh();
      window.dispatchEvent(new Event("cb-social-changed"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function hideConversation(userId: string) {
    setBusy(true);
    try {
      await arena("chat-hide", { target: userId });
      const closesChat = target === userId;
      if (closesChat) {
        setTarget("");
        setMessages([]);
      } else {
        await refresh();
      }
      toast.success(
        "Conversation removed. It will return if either player chats again.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleMute(userId: string, muted: boolean) {
    setBusy(true);
    try {
      await arena("chat-mute", { target: userId, muted: !muted });
      await refresh();
      toast.success(muted ? "Player unmuted." : "Player muted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (busy || !draft.trim()) return;
    const context = current.current,
      key = draftKey.current,
      body = draft;
    if (
      pendingMessage.current?.key !== key ||
      pendingMessage.current?.body !== body
    )
      pendingMessage.current = { key, body, id: crypto.randomUUID() };
    const messageId = pendingMessage.current.id;
    setBusy(true);
    try {
      await arena("chat-send", {
        target: mode === "personal" ? target : "",
        body,
        id: messageId,
      });
      pendingMessage.current = null;
      drafts.current[key] = "";
      if (context === current.current) {
        setDraft("");
        setBefore(undefined);
        await refresh();
      }
    } catch (e) {
      if (context === current.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedConversation = list?.users.find(
    (person) => person.user_id === target,
  );
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="social-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <section
        className="social-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="social-dialog-title"
        aria-describedby="social-dialog-description"
      >
        <button
          type="button"
          className="social-dialog-close"
          aria-label="Close social window"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>
        <h2 id="social-dialog-title">
          {view === "friends"
            ? "Friends"
            : view === "followers"
              ? "Followers"
              : "Chat"}
        </h2>
        <p id="social-dialog-description" className="social-dialog-description">
          {view === "friends"
            ? "Find players and manage your friends."
            : view === "followers"
              ? "See who follows you and follow them back."
              : "Talk with the community or a player privately."}
        </p>
        <div className="social-tabs">
          {(view === "friends"
            ? ["friends", "requests", "blocked"]
            : view === "followers"
              ? ["followers", "following"]
              : ["community", "personal"]
          ).map((v) => (
            <button key={v} aria-pressed={mode === v} onClick={() => select(v)}>
              {v === "friends"
                ? "My friends"
                : v === "requests"
                  ? "Requests"
                  : v === "blocked"
                    ? "Blocked"
                    : v === "followers"
                      ? "Followers"
                      : v === "following"
                        ? "Following"
                        : v === "community"
                          ? "Community"
                          : "Personal"}
            </button>
          ))}
        </div>
        {!chat && (
          <label className="social-search">
            Search players
            <input
              value={q}
              placeholder="Name or @username"
              maxLength={60}
              onChange={(e) => {
                seq.current++;
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {loading && <p role="status">Loading…</p>}
        {chat ? (
          <div
            className={
              mode === "personal" ? "personal-chat-layout" : "chat-main-only"
            }
          >
            {mode === "personal" && (
              <aside
                className="personal-chat-rail"
                aria-label="Personal conversations"
              >
                {list?.users.map((person) => (
                  <div
                    className={`chat-contact${target === person.user_id ? " active" : ""}`}
                    key={person.user_id}
                  >
                    <button
                      className="chat-avatar-button"
                      aria-label={`Chat with ${person.display_name}`}
                      title={`${person.display_name}${person.muted ? " · muted" : ""}`}
                      onClick={() => {
                        setTarget(person.user_id);
                        setBefore(undefined);
                      }}
                    >
                      {person.avatar_url ? (
                        <img src={person.avatar_url} alt="" />
                      ) : (
                        <span>{person.display_name[0]}</span>
                      )}
                      {person.muted && (
                        <VolumeX className="chat-muted-mark" size={14} />
                      )}
                    </button>
                    <button
                      className="chat-contact-remove"
                      aria-label={`Remove conversation with ${person.display_name}`}
                      title="Remove conversation"
                      disabled={busy}
                      onClick={() => void hideConversation(person.user_id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {!loading && !list?.users.length && (
                  <small>No personal chats</small>
                )}
              </aside>
            )}
            <section className="chat-main">
              {mode === "personal" && target && selectedConversation && (
                <div className="chat-person-toolbar">
                  <strong>{selectedConversation.display_name}</strong>
                  <span />
                  <button
                    disabled={busy}
                    onClick={() =>
                      void toggleMute(target, !!selectedConversation.muted)
                    }
                  >
                    {selectedConversation.muted ? (
                      <Volume2 size={15} />
                    ) : (
                      <VolumeX size={15} />
                    )}
                    {selectedConversation.muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => void act(selectedConversation, "block")}
                  >
                    <ShieldBan size={15} /> Block
                  </button>
                </div>
              )}
              {mode === "personal" && !target ? (
                <p className="chat-empty">
                  Choose a player on the left to open a personal chat.
                </p>
              ) : (
                <>
                  <div
                    className="chat-history"
                    role="log"
                    aria-label={
                      mode === "community"
                        ? "Community messages"
                        : "Personal messages"
                    }
                  >
                    {hasMore && (
                      <button
                        onClick={() => setBefore(messages[0]?.created_at)}
                      >
                        Older messages
                      </button>
                    )}
                    {before && (
                      <button onClick={() => setBefore(undefined)}>
                        Latest messages
                      </button>
                    )}
                    {!loading && !error && !messages.length && (
                      <p>No messages yet. Start the conversation.</p>
                    )}
                    {messages.map((m) => (
                      <article
                        className={
                          m.sender_id === profile?.user_id ? "mine" : ""
                        }
                        key={m.id}
                      >
                        <button
                          className="message-author"
                          onClick={() => {
                            if (m.sender_id !== profile?.user_id) {
                              setTarget(m.sender_id);
                              setMode("personal");
                              setBefore(undefined);
                            }
                          }}
                        >
                          {m.display_name}
                        </button>
                        <p>{m.body}</p>
                        <time>
                          {new Date(m.created_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </article>
                    ))}
                  </div>
                  <form
                    className="chat-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
                      aria-label="Your message"
                      placeholder="Write a message…"
                      maxLength={1000}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        drafts.current[draftKey.current] = e.target.value;
                      }}
                    />
                    <button disabled={busy || !draft.trim()}>Send</button>
                  </form>
                </>
              )}
            </section>
          </div>
        ) : (
          <>
            <div className="social-list">
              {list?.users.map((p) => (
                <article key={p.user_id}>
                  <button
                    className="social-person"
                    onClick={() => {
                      setOpen(false);
                      onOpenProfile(p.user_id);
                    }}
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" />
                    ) : (
                      <span className="social-initial">
                        {p.display_name[0]}
                      </span>
                    )}
                    <span>
                      <strong>{p.display_name}</strong>
                      <small>
                        @{p.username} ·{" "}
                        {Date.now() - p.seen_at < 60000 ? "Online" : "Offline"}
                      </small>
                    </span>
                  </button>
                  <div className="social-row-actions">
                    {mode === "blocked" && !q ? (
                      <button
                        disabled={busy}
                        onClick={() => void act(p, "unblock")}
                      >
                        Unblock
                      </button>
                    ) : view === "followers" ? (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(p, p.following ? "unfollow" : "follow")
                        }
                      >
                        {p.following
                          ? "Following"
                          : mode === "followers" && !q
                            ? "Follow back"
                            : "Follow"}
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={busy || p.friendship === "sent"}
                          onClick={() =>
                            void act(
                              p,
                              p.friendship === "received"
                                ? "accept"
                                : p.friendship === "accepted"
                                  ? "remove-friend"
                                  : "friend",
                            )
                          }
                        >
                          {p.friendship === "received"
                            ? "Accept"
                            : p.friendship === "accepted"
                              ? "Remove friend"
                              : p.friendship === "sent"
                                ? "Request sent"
                                : "Add friend"}
                        </button>
                        {p.friendship === "received" && (
                          <button
                            disabled={busy}
                            onClick={() => void act(p, "remove-friend")}
                          >
                            Decline
                          </button>
                        )}
                        {p.friendship === "sent" && (
                          <button
                            disabled={busy}
                            onClick={() => void act(p, "remove-friend")}
                          >
                            Cancel
                          </button>
                        )}
                        <button onClick={() => openSocial("chat", p.user_id)}>
                          Chat
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {list && !list.total && <p>No players in this list yet.</p>}
            {list && list.pages > 1 && (
              <nav className="social-pagination" aria-label="Player list pages">
                <button
                  disabled={list.page <= 1}
                  onClick={() => setPage(list.page - 1)}
                >
                  Previous
                </button>
                <span>
                  {list.page} / {list.pages}
                </span>
                <button
                  disabled={list.page >= list.pages}
                  onClick={() => setPage(list.page + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
export type MatchSummary = {
  id: string;
  outcome: "win" | "loss" | "draw";
  player: Pick<ArenaPlayer, "cbr" | "wins" | "losses" | "win_streak">;
  delta: number;
  ratingLabel?: "CBR" | "OCBR";
  ratingValue?: number;
  goldDelta?: number;
  goldPayout?: number;
  playMode?: "normal" | "wager" | "queue";
  wagerGold?: number;
  opponent?: ArenaPlayer;
  local?: boolean;
};
export function MatchResult({
  result,
  onLobby,
  onReplay,
}: {
  result: MatchSummary | null;
  onLobby: () => void;
  onReplay?: () => void;
}) {
  const level = levelFor(result?.player.cbr),
    remaining =
      level.level === 10 ? 0 : level.max + 1 - (result?.player.cbr ?? 0);
  if (!result) return null;
  const ratingLabel = result.ratingLabel ?? "CBR",
    ratingValue = result.ratingValue ?? result.player.cbr;
  return (
    <div className="result-overlay" role="presentation">
      <section
        className="social-dialog result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-result-title"
      >
        <h1 id="match-result-title">
          {result.outcome === "win"
            ? "You won!"
            : result.outcome === "loss"
              ? "You lost"
              : "Match drawn"}
        </h1>
        <p className="result-opponent">
          {result.opponent
            ? `Against ${result.opponent.display_name}`
            : "Match complete"}
          {result.local ? " · Offline match" : ""}
        </p>
        <img
          className="result-emblem"
          src={`/levels/level-${String(level.level - 1).padStart(2, "0")}.png`}
          alt=""
        />
        <h2>
          {result.local
            ? "Offline Chess Burger Rating"
            : `Level ${level.level} · ${level.name}`}
        </h2>
        <div className="result-stats">
          <div>
            <strong>{ratingValue}</strong>
            <span>{ratingLabel} standing</span>
          </div>
          <div>
            <strong className={result.delta < 0 ? "negative" : "positive"}>
              {result.delta >= 0 ? "+" : ""}
              {result.delta}
            </strong>
            <span>{ratingLabel} change</span>
          </div>
          {result.local ? (
            <>
              <div>
                <strong>{result.player.cbr}</strong>
                <span>Online CBR unchanged</span>
              </div>
              <div>
                <strong>Offline</strong>
                <span>Separate rating</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <strong>
                  {result.player.wins} / {result.player.losses}
                </strong>
                <span>Wins / losses</span>
              </div>
              <div>
                <strong>{result.player.win_streak}</strong>
                <span>Win streak</span>
              </div>
            </>
          )}
        </div>
        {!result.local && (result.goldDelta !== undefined || result.goldPayout !== undefined) && (
          <p className="result-gold">
            {result.playMode === "wager"
              ? result.outcome === "win"
                ? `+${result.goldDelta ?? 0} Gold total · ${result.goldPayout ?? result.wagerGold! * 2} payout + ${Math.max(0, (result.goldDelta ?? 0) - (result.wagerGold ?? 0))} win bonus`
                : result.outcome === "draw"
                  ? `${result.wagerGold ?? 0} Gold wager refunded`
                  : `−${result.wagerGold ?? 0} Gold wager lost`
              : result.playMode === "queue"
                ? result.outcome === "win"
                  ? `+${result.goldPayout ?? 11} Gold online-match winnings`
                  : result.outcome === "draw"
                    ? "3 Gold entry refunded"
                    : "−3 Gold online-match entry"
                : result.goldDelta
                  ? `${result.goldDelta > 0 ? "+" : ""}${result.goldDelta} Gold earned`
                  : "No Gold awarded"}
          </p>
        )}
        {!result.local && (
          <>
            <progress
              aria-label="Level progress"
              value={level.level === 10 ? 1 : result.player.cbr - level.min}
              max={level.level === 10 ? 1 : level.max + 1 - level.min}
            />
            <p>
              {remaining
                ? `${remaining} CBR to Level ${level.level + 1}`
                : "Maximum level reached"}
            </p>
          </>
        )}
        {result.opponent &&
        result.opponent.user_id !== "guest-device" &&
        !result.opponent.user_id.startsWith("local-") &&
        result.opponent.user_id !== "shared-black" ? (
          <SocialButtons target={result.opponent.user_id} />
        ) : (
          <p className="account-note">
            Friend, follow and chat options are available for registered
            opponents when online.
          </p>
        )}
        <div className="result-actions">
          {onReplay && (
            <button className="result-replay" autoFocus onClick={onReplay}>
              Replay game
            </button>
          )}
          <button
            className="result-close"
            autoFocus={!onReplay}
            onClick={onLobby}
          >
            Back to Match Lobby
          </button>
        </div>
      </section>
    </div>
  );
}
