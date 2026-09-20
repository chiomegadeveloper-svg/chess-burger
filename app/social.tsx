"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { arena } from "./arena-client";
import { toast } from "sonner";
import type { PlayerProfile } from "./supabase";
import { levelFor } from "./cbr";
import type { ArenaPlayer } from "./game-rules";
import { Coins, MessageCircle, RotateCcw, ShieldBan, Swords, Trash2, Users, Volume2, VolumeX, X } from "lucide-react";
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
  unread?: number;
};
type Listing = { users: Person[]; total: number; page: number; pages: number };
type Message = {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  display_name: string;
  avatar_url?: string;
  body: string;
  created_at: number;
  deleted_at?: string | null;
};
type ChatSummary={unread:number;personalUnread:number;communityUnread:number;groups:Array<{id:string;name:string;preview:string;unread:number}>;friends:Person[]};
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

export function FloatingChatButton({ visible }: { visible: boolean }) {
  const [unread,setUnread]=useState(0),
    [position,setPosition]=useState<{x:number;y:number}|null>(null),
    positionRef=useRef<{x:number;y:number}|null>(null),
    drag=useRef<{dx:number;dy:number;moved:boolean}|null>(null),
    suppressClick=useRef(false);
  const clampPosition=useCallback((x:number,y:number)=>({
    x:Math.max(8,Math.min(window.innerWidth-52,x)),
    y:Math.max(68,Math.min(window.innerHeight-118,y)),
  }),[]);
  useEffect(()=>{
    if(!visible)return;
    const restore=()=>{
      let saved:{x:number;y:number}|null=null;
      try{saved=JSON.parse(localStorage.getItem("cb-chat-icon-position:v2")??"null");}catch{}
      setPosition(current=>{
        const source=current??saved;
        const next=source&&Number.isFinite(source.x)&&Number.isFinite(source.y)
          ?clampPosition(source.x,source.y)
          :clampPosition(window.innerWidth-58,window.innerHeight-142);
        positionRef.current=next;
        return next;
      });
    };
    restore();
    window.addEventListener("resize",restore);
    window.addEventListener("orientationchange",restore);
    return()=>{window.removeEventListener("resize",restore);window.removeEventListener("orientationchange",restore);};
  },[visible,clampPosition]);
  useEffect(()=>{if(!visible)return;let active=true;const load=()=>void arena<ChatSummary>("chat-summary").then(data=>{if(active)setUnread(data.unread);}).catch(()=>{});load();const timer=setInterval(load,15000);window.addEventListener("cb-chat-changed",load);return()=>{active=false;clearInterval(timer);window.removeEventListener("cb-chat-changed",load);};},[visible]);
  if (!visible) return null;
  return (
    <button
      type="button"
      className="floating-chat-button"
      style={position?{left:position.x,top:position.y}:undefined}
      aria-label="Open chat"
      title="Chat · drag to move"
      onPointerDown={event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        drag.current={dx:event.clientX-rect.left,dy:event.clientY-rect.top,moved:false};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        if(!drag.current)return;
        const next=clampPosition(event.clientX-drag.current.dx,event.clientY-drag.current.dy);
        if(Math.abs(event.movementX)+Math.abs(event.movementY)>2)drag.current.moved=true;
        positionRef.current=next;
        setPosition(next);
      }}
      onPointerUp={()=>{
        if(!drag.current)return;
        suppressClick.current=drag.current.moved;
        drag.current=null;
        if(positionRef.current)try{localStorage.setItem("cb-chat-icon-position:v2",JSON.stringify(positionRef.current));}catch{}
      }}
      onPointerCancel={()=>{drag.current=null;}}
      onClick={()=>{
        if(suppressClick.current){suppressClick.current=false;return;}
        openSocial("chat");
      }}
    >
      <MessageCircle size={21} />
      {unread>0&&<b className="chat-notification" aria-label={`${unread} unread messages`}>{Math.min(99,unread)}</b>}
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
    [chatSummary,setChatSummary]=useState<ChatSummary|null>(null),
    [groupId,setGroupId]=useState(""),
    [groupName,setGroupName]=useState(""),
    [groupMembers,setGroupMembers]=useState<string[]>([]),
    [hasMore, setHasMore] = useState(false),
    [before, setBefore] = useState<number | undefined>(),
    [draft, setDraft] = useState(""),
    [openMessageMeta, setOpenMessageMeta] = useState(""),
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
  current.current = `${view}:${mode}:${target}:${groupId}:${page}:${q}:${before}`;
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
            : "personal"
          : detail.view,
      );
      setTarget(detail.target ?? "");
      setGroupId("");
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
    const key = mode === "personal" ? target : mode === "group" ? groupId : "community";
    draftKey.current = key;
    setDraft(drafts.current[key] ?? "");
  }, [mode, target, groupId]);
  const chat = view === "chat";
  const refresh = useCallback(async () => {
    if (!open) return;
    const ticket = ++seq.current;
    try {
      if (chat) {
        const [conversations, data,summary] = await Promise.all([
          mode === "personal"
            ? arena<Listing>("chat-conversations", { target })
            : Promise.resolve(null),
          mode === "community" || target || groupId
            ? arena<{ messages: Message[]; hasMore: boolean }>("chat-read", {
                target: mode === "personal" ? target : "",
                group_id: mode === "group" ? groupId : "",
                ...(before ? { before } : {}),
              })
            : Promise.resolve({ messages: [], hasMore: false }),
          arena<ChatSummary>("chat-summary"),
        ]);
        if (ticket === seq.current) {
          setMessages(data.messages);
          setHasMore(data.hasMore);
          if (conversations) setList(conversations);
          setChatSummary(summary);
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
  }, [open, chat, mode, target, groupId, q, page, before]);
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
    setGroupId("");
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
        group_id: mode === "group" ? groupId : "",
        body,
        id: messageId,
      });
      pendingMessage.current = null;
      window.dispatchEvent(new Event("cb-chat-changed"));
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
  async function deleteMessage(id:string){if(busy)return;setBusy(true);try{await arena("chat-delete",{id});window.dispatchEvent(new Event("cb-chat-changed"));await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function createGroup(){if(busy||groupName.trim().length<3||!groupMembers.length)return;setBusy(true);try{const data=await arena<{group:{id:string}}>("chat-group-create",{name:groupName,member_ids:groupMembers});setGroupName("");setGroupMembers([]);setGroupId(data.group.id);window.dispatchEvent(new Event("cb-chat-changed"));await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
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
        className={`social-dialog${view === "chat" ? " chat-dialog" : ""}`}
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
              : "Personal, group and community conversations."}
        </p>
        <div className="social-tabs">
          {(view === "friends"
            ? ["friends", "requests", "blocked"]
            : view === "followers"
              ? ["followers", "following"]
              : ["personal", "group", "community"]
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
                          : v === "group" ? "Group" : "Personal"}
              {view==="chat"&&((v==="personal"?chatSummary?.personalUnread:v==="group"?chatSummary?.groups.reduce((n,g)=>n+g.unread,0):chatSummary?.communityUnread)??0)>0&&<b className="chat-tab-badge">{Math.min(99,(v==="personal"?chatSummary?.personalUnread:v==="group"?chatSummary?.groups.reduce((n,g)=>n+g.unread,0):chatSummary?.communityUnread)??0)}</b>}
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
              mode === "personal" ? "personal-chat-layout" : mode === "group" ? "personal-chat-layout group-chat-layout" : "chat-main-only"
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
                    {!!person.unread&&<b className="chat-contact-unread">{Math.min(99,person.unread)}</b>}
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
            {mode==="group"&&<aside className="personal-chat-rail group-chat-rail" aria-label="Group conversations"><form className="group-create" onSubmit={e=>{e.preventDefault();void createGroup();}}><input aria-label="Group name" placeholder="Group name" maxLength={48} value={groupName} onChange={e=>setGroupName(e.target.value)}/><div>{chatSummary?.friends.map(friend=><label key={friend.user_id}><input type="checkbox" checked={groupMembers.includes(friend.user_id)} onChange={()=>setGroupMembers(current=>current.includes(friend.user_id)?current.filter(id=>id!==friend.user_id):[...current,friend.user_id])}/><span>{friend.display_name}</span></label>)}</div><button disabled={busy||groupName.trim().length<3||!groupMembers.length}>Create</button></form>{chatSummary?.groups.map(group=><button key={group.id} className={`group-conversation${groupId===group.id?' active':''}`} onClick={()=>{setGroupId(group.id);setBefore(undefined);}}><Users size={18}/><span><strong>{group.name}</strong><small>{group.preview}</small></span>{group.unread>0&&<b>{group.unread}</b>}</button>)}</aside>}
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
              {(mode === "personal" && !target)||(mode==="group"&&!groupId) ? (
                <p className="chat-empty">
                  Choose {mode==="group"?'a group':'a player'} on the left to open the conversation.
                </p>
              ) : (
                <>
                  <div
                    className="chat-history"
                    role="log"
                    aria-label={
                      mode === "community"
                        ? "Community messages"
                        : mode === "group" ? "Group messages" : "Personal messages"
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
                          className="message-avatar"
                          aria-label={`Open ${m.display_name}'s profile`}
                          onClick={() => {
                            if (m.sender_id !== profile?.user_id) {
                              setTarget(m.sender_id);
                              setMode("personal");
                              setBefore(undefined);
                            }
                          }}
                        >
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" />
                          ) : (
                            <span>{m.display_name.charAt(0).toUpperCase()}</span>
                          )}
                        </button>
                        <div className="message-stack">
                          <button
                            type="button"
                            className="message-bubble"
                            aria-expanded={openMessageMeta === m.id}
                            aria-label={`${m.display_name}: ${m.body}. Tap to ${openMessageMeta === m.id ? "hide" : "show"} date and time.`}
                            onClick={() => setOpenMessageMeta(current => current === m.id ? "" : m.id)}
                          >
                            <span className="message-author">
                              {m.display_name}
                            </span>
                            <p>{m.body}</p>
                          </button>
                          {openMessageMeta === m.id && <div className="message-meta">
                            <time>
                              {new Date(m.created_at).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            {m.sender_id===profile?.user_id&&!m.deleted_at&&<button className="message-delete" aria-label="Delete your message" onClick={()=>void deleteMessage(m.id)}><Trash2 size={12}/> Delete</button>}
                          </div>}
                        </div>
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
  player: Pick<ArenaPlayer, "cbr" | "gold_points" | "wins" | "losses" | "win_streak">;
  delta: number;
  ratingLabel?: "CBR" | "OCBR";
  ratingValue?: number;
  goldDelta?: number;
  goldPayout?: number;
  playMode?: "normal" | "wager" | "queue";
  wagerGold?: number;
  control?: string;
  opponent?: ArenaPlayer;
  local?: boolean;
};
export function MatchResult({
  result,
  onLobby,
  onReplay,
  onRematchStarted,
}: {
  result: MatchSummary | null;
  onLobby: () => void;
  onReplay?: () => void;
  onRematchStarted?: (matchId: string) => void;
}) {
  const [rematchOpen, setRematchOpen] = useState(false),
    [rematchMode, setRematchMode] = useState<"normal" | "wager">("normal"),
    [rematchGold, setRematchGold] = useState(1),
    [rematchBusy, setRematchBusy] = useState(false),
    [rematchId, setRematchId] = useState(""),
    [rematchStatus, setRematchStatus] = useState("");
  const startRematch = useRef(onRematchStarted);
  startRematch.current = onRematchStarted;
  useEffect(() => {
    setRematchOpen(false);
    setRematchMode("normal");
    setRematchGold(1);
    setRematchId("");
    setRematchStatus("");
  }, [result?.id]);
  useEffect(() => {
    if (!rematchId) return;
    let active = true;
    const poll = async () => {
      try {
        const data = await arena<{ match: ArenaMatch }>("match", { id: rematchId });
        if (!active) return;
        if (data.match.status === "active") {
          setRematchStatus("Rematch accepted. Opening the board…");
          startRematch.current?.(data.match.id);
        } else if (data.match.status === "cancelled") {
          setRematchId("");
          setRematchStatus("The rematch invitation was cancelled.");
        }
      } catch (e) {
        if (active) setRematchStatus((e as Error).message);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [rematchId]);
  const level = levelFor(result?.player.cbr),
    remaining =
      level.level === 10 ? 0 : level.max + 1 - (result?.player.cbr ?? 0);
  if (!result) return null;
  const ratingLabel = result.ratingLabel ?? "CBR",
    ratingValue = result.ratingValue ?? result.player.cbr;
  const canRematch = !result.local && !!result.opponent && result.opponent.user_id !== "guest-device" && !result.opponent.user_id.startsWith("local-") && result.opponent.user_id !== "shared-black";
  async function offerRematch() {
    if (!result?.opponent || !result.control) return;
    setRematchBusy(true);
    setRematchStatus("");
    try {
      const data = await arena<{ match: ArenaMatch }>("room", {
        control: result.control,
        target: result.opponent.user_id,
        play_mode: rematchMode,
        wager_gold: rematchMode === "wager" ? rematchGold : 0,
        rematch_of: result.id,
      });
      setRematchId(data.match.id);
      setRematchStatus(`${rematchMode === "wager" ? `${rematchGold} Gold wager` : "Normal rematch"} offered to ${result.opponent.display_name}.`);
    } catch (e) {
      setRematchStatus((e as Error).message);
    } finally {
      setRematchBusy(false);
    }
  }
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
        {canRematch && (
          <div className="result-rematch">
            {!rematchOpen ? (
              <button type="button" className="result-rematch-open" onClick={() => setRematchOpen(true)}>
                <RotateCcw size={16} /> Offer a rematch
              </button>
            ) : (
              <>
                <div className="result-rematch-heading"><strong>Rematch offer</strong><small>Same {result.control} time control</small></div>
                <div className="result-rematch-modes">
                  <button type="button" className={rematchMode === "normal" ? "chosen" : ""} aria-pressed={rematchMode === "normal"} disabled={!!rematchId} onClick={() => setRematchMode("normal")}>
                    <Swords size={16} /><span><strong>Normal</strong><small>Standard Gold rewards</small></span>
                  </button>
                  <button type="button" className={rematchMode === "wager" ? "chosen" : ""} aria-pressed={rematchMode === "wager"} disabled={!!rematchId} onClick={() => setRematchMode("wager")}>
                    <Coins size={16} /><span><strong>Wager</strong><small>Both players stake equally</small></span>
                  </button>
                </div>
                {rematchMode === "wager" && !rematchId && (
                  <label className="result-rematch-bet">Gold bet
                    <input type="number" inputMode="numeric" min={1} max={Math.min(10000, result.player.gold_points)} value={rematchGold} onChange={(event) => setRematchGold(Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
                    <small>You have {result.player.gold_points} Gold.</small>
                  </label>
                )}
                {!rematchId && (
                  <button type="button" className="gold-button wide" disabled={rematchBusy || (rematchMode === "wager" && (rematchGold < 1 || rematchGold > result.player.gold_points || rematchGold > 10000))} onClick={() => void offerRematch()}>
                    {rematchBusy ? "Sending…" : rematchMode === "wager" ? `Offer ${rematchGold} Gold rematch` : "Offer normal rematch"}
                  </button>
                )}
                {rematchStatus && <p role="status">{rematchStatus}</p>}
              </>
            )}
          </div>
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
