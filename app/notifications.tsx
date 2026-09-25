"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Gift, MessageCircle, RefreshCw, X } from "lucide-react";
import { arena } from "./arena-client";
import { getSupabase } from "./supabase";
import "./notifications.css";

type Notification = { key: string; kind: string; title: string; body: string; target: string; created_at: string; sticky?: boolean };
type Inbox = { items: Notification[]; read_keys: string[]; unavailable: string[] };
type ChatSummary = { personalUnread: number; communityUnread: number; groups: { id: string; name: string; unread: number }[] };
type ArenaWindow = { entry_open: boolean; current: { date: string; slot: number; starts_at: string } | null };
type Invite = { id: string; host_name: string; created_at: number | string; play_mode?: string; wager_gold?: number };

async function request(method: "GET" | "POST", keys?: string[]): Promise<Inbox | { ok: boolean }> {
  const client = await getSupabase();
  let session = client ? (await client.auth.getSession()).data.session : null;
  if (!client || !session) throw Error("Sign in to see your notifications.");
  const send = (token: string) => fetch("/api/notifications", { method, headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) }, body: method === "POST" ? JSON.stringify({ keys }) : undefined, cache: "no-store" });
  let response = await send(session.access_token);
  if (response.status === 401) {
    session = (await client.auth.refreshSession()).data.session;
    if (!session) throw Error("Your session expired. Sign in again.");
    response = await send(session.access_token);
  }
  const data = await response.json() as Inbox & { error?: string; ok?: boolean };
  if (!response.ok) throw Error(data.error || "Notifications are temporarily unavailable.");
  return data;
}

const ago = (value: string) => {
  const minutes = Math.floor((Date.now() - Date.parse(value)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};
const readKey = (userId: string) => `cb-notification-reads:${userId}`;
const savedReads = (userId: string): string[] => {
  try { const value = JSON.parse(localStorage.getItem(readKey(userId)) || "[]"); return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string").slice(-500) : []; }
  catch { return []; }
};

export default function NotificationBell({ userId, invites, onNavigate }: { userId?: string; invites: Invite[]; onNavigate: (target: string) => void }) {
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<Notification[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [windowState, setWindowState] = useState<ArenaWindow | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const running = useRef<string | null>(null);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  const refresh = useCallback(async () => {
    if (!userId || running.current === userId || !navigator.onLine) return;
    running.current = userId;
    setLoading(true);
    const [inbox, messages, arenaWindow] = await Promise.allSettled([
      request("GET") as Promise<Inbox>,
      arena<ChatSummary>("chat-summary"),
      fetch("/api/grand-arena?action=window", { cache: "no-store" }).then(async response => response.ok ? response.json() as Promise<ArenaWindow> : null),
    ]);
    if (currentUser.current !== userId) return;
    if (inbox.status === "fulfilled") {
      setRemote(inbox.value.items);
      setRead([...new Set([...savedReads(userId), ...inbox.value.read_keys])]);
      setUnavailable(inbox.value.unavailable);
      setError("");
    } else setError(inbox.reason instanceof Error ? inbox.reason.message : "Notifications are temporarily unavailable.");
    if (messages.status === "fulfilled") setChat(messages.value);
    if (arenaWindow.status === "fulfilled") setWindowState(arenaWindow.value);
    running.current = null;
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setRemote([]); setRead(userId ? savedReads(userId) : []); setChat(null); setWindowState(null); setError(""); setOpen(false);
    if (!userId) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    window.addEventListener("cb-profile-saved", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", visible); window.removeEventListener("online", visible); window.removeEventListener("cb-profile-saved", visible); document.removeEventListener("visibilitychange", visible); };
  }, [userId, refresh]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  const dynamic: Notification[] = [];
  if (chat?.personalUnread) dynamic.push({ key: "chat:personal", kind: "chat", title: "Unread personal messages", body: `${chat.personalUnread} message${chat.personalUnread === 1 ? "" : "s"} waiting for you.`, target: "chat-personal", created_at: new Date().toISOString(), sticky: true });
  if (chat?.communityUnread) dynamic.push({ key: "chat:community", kind: "chat", title: "Unread community messages", body: `${chat.communityUnread} message${chat.communityUnread === 1 ? "" : "s"} in community chat.`, target: "chat-community", created_at: new Date().toISOString(), sticky: true });
  const groupUnread = chat?.groups.reduce((total, group) => total + group.unread, 0) ?? 0;
  if (groupUnread) dynamic.push({ key: "chat:group", kind: "chat", title: "Unread group messages", body: `${groupUnread} message${groupUnread === 1 ? "" : "s"} across your groups.`, target: "chat-group", created_at: new Date().toISOString(), sticky: true });
  if (windowState?.entry_open && windowState.current) dynamic.push({ key: `arena-open:${windowState.current.date}:${windowState.current.slot}`, kind: "arena", title: "Grand Arena is open", body: "This session is accepting players now.", target: "grand-arena", created_at: windowState.current.starts_at });
  for (const invite of invites) dynamic.push({ key: `invite:${invite.id}`, kind: "invite", title: `${invite.host_name} invited you to play`, body: invite.play_mode === "wager" ? `A ${invite.wager_gold} Gold challenge is waiting.` : "Open the invitation to accept or decline.", target: "play-select", created_at: new Date(invite.created_at).toISOString(), sticky: true });

  const items = [...remote, ...dynamic].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const readSet = new Set(read);
  const unread = items.filter(item => item.sticky || !readSet.has(item.key)).length;
  const mark = async (keys: string[]) => {
    if (!keys.length || !userId) return;
    const updated = [...new Set([...savedReads(userId), ...keys])].slice(-500);
    try { localStorage.setItem(readKey(userId), JSON.stringify(updated)); } catch {}
    setRead(previous => [...new Set([...previous, ...keys])]);
    try { await request("POST", keys); }
    catch { /* This device still remembers the read state if the optional table is unavailable. */ }
  };
  const choose = (item: Notification) => {
    setOpen(false);
    if (!item.sticky && !readSet.has(item.key)) void mark([item.key]);
    onNavigate(item.target);
  };
  const unreadCount = Math.min(99, unread);

  return <div className="notification-container" ref={container}>
    <button className="notification-trigger" type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} aria-controls="cb-notification-panel" onClick={() => { setOpen(value => !value); if (!open) void refresh(); }}>
      <Bell size={19} aria-hidden="true" />{unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section id="cb-notification-panel" className="notification-panel" aria-label="Notifications">
      <div className="notification-heading"><span><Bell size={17} /><strong>Notifications</strong></span><button className="notification-close" type="button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={17} /></button></div>
      <div className="notification-toolbar"><span>{unread ? `${unread} unread` : "All caught up"}</span><div><button type="button" aria-label="Refresh notifications" title="Refresh" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} className={loading ? "notification-spinning" : ""} /></button><button type="button" disabled={!items.some(item => !item.sticky && !readSet.has(item.key))} onClick={() => void mark(items.filter(item => !item.sticky && !readSet.has(item.key)).map(item => item.key))}><CheckCheck size={15} /> Mark read</button></div></div>
      {error && <p className="notification-error" role="alert">{error}</p>}
      {unavailable.length > 0 && <p className="notification-error">Some activity could not load. Try refreshing.</p>}
      <div className="notification-list" aria-live="polite">
        {items.length === 0 && <div className="notification-empty">{loading ? "Checking your activity…" : error ? "Try again when notifications are available." : "No notifications yet. Your next Chess Burger update will appear here."}</div>}
        {items.map(item => <button type="button" key={item.key} className={`notification-item${item.sticky || !readSet.has(item.key) ? " is-unread" : ""}`} onClick={() => choose(item)}>
          <span className="notification-icon">{item.kind === "chat" || item.kind === "comment" ? <MessageCircle size={17} /> : item.kind === "gift" || item.kind === "reward" || item.kind === "purchase" ? <Gift size={17} /> : <Bell size={17} />}</span>
          <span className="notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{ago(item.created_at)}</small></span>
          {(item.sticky || !readSet.has(item.key)) && <i className="notification-dot" aria-label="Unread" />}
        </button>)}
      </div>
    </section>}
  </div>;
}
