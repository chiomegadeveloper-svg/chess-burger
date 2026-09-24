"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { getSupabase } from "./supabase";

type Reaction = { user_id: string; kind: "heart" | "queen" };
type Comment = { id: string; author_id: string; parent_id: string | null; body: string; created_at: string };
type Author = { display_name: string; avatar_url: string };

export default function PortfolioDiscussion({ userId, slot }: { userId: string; slot: number }) {
  const [viewer, setViewer] = useState("");
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const client = await getSupabase();
    if (!client) throw Error("Connect to read this discussion.");
    const [who, reactionsResult, commentsResult] = await Promise.all([
      client.auth.getUser(),
      client.from("cb_portfolio_reactions").select("user_id,kind").eq("portfolio_user_id", userId).eq("slot", slot),
      client.from("cb_portfolio_comments").select("id,author_id,parent_id,body,created_at").eq("portfolio_user_id", userId).eq("slot", slot).order("created_at", { ascending: true }),
    ]);
    if (reactionsResult.error) throw reactionsResult.error;
    if (commentsResult.error) throw commentsResult.error;
    const nextComments = commentsResult.data ?? [];
    const ids = [...new Set(nextComments.map(comment => comment.author_id))];
    let nextAuthors: Record<string, Author> = {};
    if (ids.length) {
      const result = await client.from("cb_profiles").select("user_id,display_name,avatar_url").in("user_id", ids);
      if (!result.error) nextAuthors = Object.fromEntries((result.data ?? []).map(author => [author.user_id, author]));
    }
    setViewer(who.data.user?.id ?? "");
    setReactions(reactionsResult.data ?? []);
    setComments(nextComments);
    setAuthors(nextAuthors);
  }, [userId, slot]);

  useEffect(() => {
    let active = true;
    void refresh().catch(cause => { if (active) setError((cause as Error).message || "Discussion is unavailable."); });
    return () => { active = false; };
  }, [refresh]);

  const react = async (kind: "heart" | "queen") => {
    if (busy || !viewer || viewer === userId) return;
    setBusy(true); setError("");
    try {
      const client = await getSupabase();
      if (!client) throw Error("Connect to react to this story.");
      const hasReacted = reactions.some(item => item.user_id === viewer && item.kind === kind);
      const query = hasReacted
        ? client.from("cb_portfolio_reactions").delete().eq("portfolio_user_id", userId).eq("slot", slot).eq("user_id", viewer).eq("kind", kind)
        : client.from("cb_portfolio_reactions").insert({ portfolio_user_id: userId, slot, user_id: viewer, kind });
      const { error: issue } = await query;
      if (issue) throw issue;
      await refresh();
    } catch (cause) { setError((cause as Error).message || "Reaction failed."); }
    finally { setBusy(false); }
  };

  const send = async () => {
    const text = body.trim();
    if (busy || !viewer || !text) return;
    if (text.length > 88) { setError("Comments must be 88 characters or fewer."); return; }
    setBusy(true); setError("");
    try {
      const client = await getSupabase();
      if (!client) throw Error("Connect to post your comment.");
      const { error: issue } = await client.from("cb_portfolio_comments").insert({
        portfolio_user_id: userId, slot, author_id: viewer,
        parent_id: replyTo ? (replyTo.parent_id ?? replyTo.id) : null,
        body: text,
      });
      if (issue) throw issue;
      setBody(""); setReplyTo(null);
      await refresh();
    } catch (cause) { setError((cause as Error).message || "Could not post your comment."); }
    finally { setBusy(false); }
  };

  const remove = async (comment: Comment) => {
    if (busy || !viewer || (comment.author_id !== viewer && userId !== viewer)) return;
    setBusy(true); setError("");
    try {
      const client = await getSupabase();
      if (!client) throw Error("Connect to delete your comment.");
      const { error: issue } = await client.from("cb_portfolio_comments").delete().eq("id", comment.id);
      if (issue) throw issue;
      await refresh();
    } catch (cause) { setError((cause as Error).message || "Could not delete the comment."); }
    finally { setBusy(false); }
  };

  const renderComment = (comment: Comment, reply = false) => {
    const author = authors[comment.author_id];
    return <li key={comment.id} className={reply ? "portfolio-comment is-reply" : "portfolio-comment"}>
      {author?.avatar_url ? <img src={author.avatar_url} alt=""/> : <span className="portfolio-comment-avatar">{(author?.display_name || "P").charAt(0)}</span>}
      <div><strong>{author?.display_name || "Chess Burger player"}</strong><p>{comment.body}</p><div className="portfolio-comment-actions">
        {viewer && <button type="button" disabled={busy} onClick={() => setReplyTo(comment)}>Reply</button>}
        {(viewer === comment.author_id || viewer === userId) && <button type="button" disabled={busy} onClick={() => void remove(comment)} aria-label="Delete comment"><Trash2 size={13}/> Delete</button>}
      </div></div>
    </li>;
  };

  return <section className="portfolio-discussion">
    <div className="portfolio-reactions" aria-label="Story reactions">
      {(["heart", "queen"] as const).map(kind => <button key={kind} type="button" disabled={busy || !viewer || viewer === userId} aria-pressed={reactions.some(item => item.user_id === viewer && item.kind === kind)} onClick={() => void react(kind)}>
        {kind === "heart" ? <Heart size={19}/> : <Crown size={19}/>}<span>{kind === "heart" ? "Heart" : "Queen"}</span><b>{reactions.filter(item => item.kind === kind).length}</b>
      </button>)}
    </div>
    <h3><MessageCircle size={17}/> Comments · {comments.length}</h3>
    {error && <p className="portfolio-error" role="alert">{error}</p>}
    <ul className="portfolio-comments">{comments.filter(comment => !comment.parent_id).map(comment => <li key={comment.id} className="portfolio-thread">
      <ul>{renderComment(comment)}{comments.filter(reply => reply.parent_id === comment.id).map(reply => renderComment(reply, true))}</ul>
    </li>)}</ul>
    {viewer && <div className="portfolio-comment-form">
      {replyTo && <div className="portfolio-reply-indicator">Replying to {authors[replyTo.author_id]?.display_name || "player"}<button type="button" onClick={() => setReplyTo(null)}>Cancel</button></div>}
      <label htmlFor={`portfolio-comment-${userId}-${slot}`}>Write a {replyTo ? "reply" : "comment"}</label>
      <div><input id={`portfolio-comment-${userId}-${slot}`} type="text" maxLength={88} value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void send(); }} placeholder="Share your thoughts…"/><button type="button" disabled={busy || !body.trim()} onClick={() => void send()}><Send size={16}/> Post</button></div>
      <small>{body.length}/88 characters</small>
    </div>}
  </section>;
}
