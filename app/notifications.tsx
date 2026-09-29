"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Gift, MessageCircle, RefreshCw, X } from "lucide-react";
import { arena } from "./arena-client";
import { getSupabase } from "./supabase";
import "./notifications.css";
declare const __CHESS_BURGER_BUILD_ID__: string;

type Notification = { key: string; kind: string; title: string; body: string; target: string; created_at: string; sticky?: boolean };
export type OwnerPendingAlert = Pick<Notification, "key" | "title" | "body" | "created_at">;
type Inbox = { items: Notification[]; read_entries: { notification_key: string; read_at: string }[]; unavailable: string[] };
type ChatSummary = { personalUnread: number; firstUnreadSender?: string | null; communityUnread: number; groups: { id: string; name: string; unread: number }[] };
type ArenaWindow = { entry_open: boolean; current: { date: string; slot: number; starts_at: string } | null };
type Invite = { id: string; host_name: string; created_at: number | string; play_mode?: string; wager_gold?: number; match_kind?: string };

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
const READ_RETENTION_MS = 24 * 60 * 60 * 1000;
type ReadTimes = Record<string, string>;
const readKey = (userId: string) => `cb-notification-reads:${userId}`;
const savedReads = (userId: string): ReadTimes => {
  try {
    const raw = JSON.parse(localStorage.getItem(readKey(userId)) || "{}");
    const legacy = Array.isArray(raw);
    const entries: [string, unknown][] = legacy ? raw.map((key: string) => [key, new Date().toISOString()]) : Object.entries(raw);
    const valid = entries.filter(([key, at]) => typeof key === "string" && key.length < 161 && typeof at === "string" && Number.isFinite(Date.parse(at))) as [string, string][];
    const result = Object.fromEntries(valid.slice(-500)) as ReadTimes;
    if (legacy) localStorage.setItem(readKey(userId), JSON.stringify(result));
    return result;
  } catch { return {}; }
};
const mergeReads = (local: ReadTimes, server: Inbox["read_entries"]): ReadTimes => {
  const merged = { ...local };
  for (const entry of server || []) {
    if (!merged[entry.notification_key] || Date.parse(entry.read_at) < Date.parse(merged[entry.notification_key])) merged[entry.notification_key] = entry.read_at;
  }
  return merged;
};

export function OwnerPendingHomeAlert({ alerts, onReview }: { alerts: OwnerPendingAlert[]; onReview: () => void }) {
  if (!alerts.length) return null;
  const sales = alerts.filter(item => item.title === "NEW SALE").length;
  const donations = alerts.filter(item => item.title === "NEW DONATION").length;
  const count = (value: number) => value >= 30 ? "30+" : String(value);
  return <section className="owner-home-payment-alert" aria-label="Pending payments requiring owner approval" role="status">
    <div className="owner-home-payment-header">
      <div><small>OWNER APPROVAL REQUIRED</small><h2>{sales > 0 && <span>NEW SALE</span>}{donations > 0 && <span>NEW DONATION</span>}</h2><p>{sales > 0 && `${count(sales)} CBG purchase${sales === 1 ? "" : "s"}`}{sales > 0 && donations > 0 ? " · " : ""}{donations > 0 && `${count(donations)} donation${donations === 1 ? "" : "s"}`} awaiting payment verification.</p></div>
      <button type="button" onClick={onReview}>Review in CMS →</button>
    </div>
    <ul>{alerts.slice(0, 3).map(item => <li key={item.key}><strong>{item.title}</strong><span>{item.body}</span></li>)}</ul>
  </section>;
}

export default function NotificationBell({ userId, isOwner, homeActive, invites, onNavigate, onOwnerPending }: { userId?: string; isOwner?: boolean; homeActive?: boolean; invites: Invite[]; onNavigate: (target: string) => void; onOwnerPending?: (alerts: OwnerPendingAlert[]) => void }) {
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<Notification[]>([]);
  const [read, setRead] = useState<ReadTimes>({});
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [windowState, setWindowState] = useState<ArenaWindow | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [update, setUpdate] = useState<{buildId:string;version:string}|null>(null);
  const [restarting, setRestarting] = useState(false);
  const [deferredUpdate, setDeferredUpdate] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const running = useRef<string | null>(null);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/version.json?check=${Date.now()}`, {cache:"no-store"});
        if (!response.ok) return;
        const next = await response.json() as {buildId?:string;version?:string};
        if (active && next.buildId && next.buildId !== __CHESS_BURGER_BUILD_ID__)
          setUpdate({buildId:next.buildId,version:next.version || "new"});
      } catch { /* Try again when the connection returns. */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { active=false;window.clearInterval(timer);window.removeEventListener("focus",visible);window.removeEventListener("online",visible);document.removeEventListener("visibilitychange",visible); };
  }, []);

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
      if (isOwner) onOwnerPending?.(inbox.value.items.filter(item => item.kind === "owner-sale"));
      setRead(mergeReads(savedReads(userId), inbox.value.read_entries));
      setUnavailable(inbox.value.unavailable);
      setError("");
    } else setError(inbox.reason instanceof Error ? inbox.reason.message : "Notifications are temporarily unavailable.");
    if (messages.status === "fulfilled") setChat(messages.value);
    if (arenaWindow.status === "fulfilled") setWindowState(arenaWindow.value);
    running.current = null;
    setLoading(false);
  }, [userId, isOwner, onOwnerPending]);

  useEffect(() => {
    setRemote([]); setRead(userId ? savedReads(userId) : {}); setChat(null); setWindowState(null); setError(""); setOpen(false);
    onOwnerPending?.([]);
    if (!userId) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, isOwner ? 30_000 : 60_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    window.addEventListener("cb-profile-saved", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", visible); window.removeEventListener("online", visible); window.removeEventListener("cb-profile-saved", visible); document.removeEventListener("visibilitychange", visible); };
  }, [userId, isOwner, refresh, onOwnerPending]);

  useEffect(() => {
    if (!homeActive || !isOwner || !userId) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [homeActive, isOwner, userId, refresh]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  const dynamic: Notification[] = [];
  if (update) dynamic.push({key:`app-update:${update.buildId}`,kind:"app-update",title:`Chess Burger v${update.version} is ready`,body:"Restart the app to get the latest features and fixes.",target:"",created_at:new Date().toISOString(),sticky:true});
  if (chat?.personalUnread) dynamic.push({ key: `chat:personal:${chat.personalUnread}`, kind: "chat", title: "Unread personal messages", body: `${chat.personalUnread} message${chat.personalUnread === 1 ? "" : "s"} waiting for you.`, target: chat.firstUnreadSender ? `chat-personal:${chat.firstUnreadSender}` : "chat-personal", created_at: new Date().toISOString(), sticky: true });
  if (chat?.communityUnread) dynamic.push({ key: `chat:community:${chat.communityUnread}`, kind: "chat", title: "Unread community messages", body: `${chat.communityUnread} message${chat.communityUnread === 1 ? "" : "s"} in community chat.`, target: "chat-community", created_at: new Date().toISOString(), sticky: true });
  for (const group of chat?.groups ?? []) if (group.unread) dynamic.push({ key: `chat:group:${group.id}:${group.unread}`, kind: "chat", title: `Unread messages in ${group.name}`, body: `${group.unread} message${group.unread === 1 ? "" : "s"} waiting for you.`, target: `chat-group:${group.id}`, created_at: new Date().toISOString(), sticky: true });
  if (windowState?.entry_open && windowState.current) dynamic.push({ key: `arena-open:${windowState.current.date}:${windowState.current.slot}`, kind: "arena", title: "Grand Arena is open", body: "This session is accepting players now.", target: "grand-arena", created_at: windowState.current.starts_at });
  for (const invite of invites) dynamic.push({ key: `invite:${invite.id}`, kind: invite.match_kind === "invasion" ? "territory" : "invite", title: invite.match_kind === "invasion" ? `${invite.host_name} challenged your kingdom` : `${invite.host_name} invited you to play`, body: invite.match_kind === "invasion" ? "Open the map to accept or decline this territory challenge." : invite.play_mode === "wager" ? `A ${invite.wager_gold} Gold challenge is waiting.` : "Open the invitation to accept or decline.", target: invite.match_kind === "invasion" ? "map" : "play-select", created_at: new Date(invite.created_at).toISOString(), sticky: true });

  const now = Date.now();
  const items = [...remote, ...dynamic]
    .filter(item => item.sticky || !read[item.key] || now - Date.parse(read[item.key]) < READ_RETENTION_MS)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const unread = items.filter(item => !read[item.key] && item.key !== deferredUpdate).length;
  const mark = async (keys: string[]) => {
    if (!keys.length || !userId) return;
    const at = new Date().toISOString();
    const updated = savedReads(userId);
    for (const key of keys) updated[key] ??= at;
    try { localStorage.setItem(readKey(userId), JSON.stringify(Object.fromEntries(Object.entries(updated).slice(-500)))); } catch {}
    setRead(previous => {
      const next = { ...previous };
      for (const key of keys) next[key] ??= at;
      return next;
    });
    try { for (let start = 0; start < keys.length; start += 80) await request("POST", keys.slice(start, start + 80)); }
    catch { /* This device still remembers the read state if the optional table is unavailable. */ }
  };
  const choose = (item: Notification) => {
    setOpen(false);
    if (!read[item.key]) void mark([item.key]);
    onNavigate(item.target);
  };
  const unreadCount = Math.min(99, unread);

  return <div className="notification-container" ref={container}>
    <button className="notification-trigger" type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} aria-controls="cb-notification-panel" onClick={() => { setOpen(value => !value); if (!open) { void mark(items.filter(item => item.kind !== "app-update" && !read[item.key]).map(item => item.key)); void refresh(); } }}>
      <Bell size={19} aria-hidden="true" />{unread > 0 && <span className="notification-badge" aria-hidden="true">{unread > 99 ? "99+" : unreadCount}</span>}
    </button>
    {open && <section id="cb-notification-panel" className="notification-panel" aria-label="Notifications">
      <div className="notification-heading"><span><Bell size={17} /><strong>Notifications</strong></span><button className="notification-close" type="button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={17} /></button></div>
      <div className="notification-toolbar"><span>{unread ? `${unread} unread` : "All caught up"}</span><div><button type="button" aria-label="Refresh notifications" title="Refresh" disabled={loading} onClick={() => void refresh()}><RefreshCw size={15} className={loading ? "notification-spinning" : ""} /></button><button type="button" disabled={!unread} onClick={() => void mark(items.filter(item => item.kind !== "app-update" && !read[item.key]).map(item => item.key))}><CheckCheck size={15} /> Mark read</button></div></div>
      {error && <p className="notification-error" role="alert">{error}</p>}
      {unavailable.length > 0 && <p className="notification-error">Some activity could not load. Try refreshing.</p>}
      <div className="notification-list" aria-live="polite">
        {items.length === 0 && <div className="notification-empty">{loading ? "Checking your activity…" : error ? "Try again when notifications are available." : "No notifications yet. Your next Chess Burger update will appear here."}</div>}
        {items.map(item => item.kind === "app-update" ? <article key={item.key} className="notification-item notification-update">
          <span className="notification-icon"><RefreshCw size={17}/></span><span className="notification-copy"><strong>{item.title}</strong><span>{item.body}</span><span className="notification-update-actions"><button type="button" disabled={restarting} onClick={() => {setRestarting(true);void (async()=>{try{await navigator.serviceWorker?.getRegistration().then(reg=>reg?.update());}catch{}finally{window.location.reload();}})();}}>{restarting?"Restarting…":"Restart now"}</button><button type="button" onClick={() => {setDeferredUpdate(item.key);setOpen(false);}}>Update later</button></span></span>
        </article> : <button type="button" key={item.key} className={`notification-item${!read[item.key] ? " is-unread" : ""}${item.kind === "owner-sale" ? " owner-sale-alert" : ""}`} onClick={() => choose(item)}>
          <span className="notification-icon">{item.kind === "chat" || item.kind === "comment" ? <MessageCircle size={17} /> : item.kind === "gift" || item.kind === "reward" || item.kind === "purchase" ? <Gift size={17} /> : <Bell size={17} />}</span>
          <span className="notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{ago(item.created_at)}</small></span>
          {!read[item.key] && <i className="notification-dot" aria-label="Unread" />}
        </button>)}
      </div>
    </section>}
  </div>;
}
