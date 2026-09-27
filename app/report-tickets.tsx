"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bug, Flag, MessageSquare, Search, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import "./report-tickets.css";

type Ticket = { id: string; reporter_id: string; reporter?: { username: string; display_name: string } | null; category: string; target_username: string | null; description: string; status: "open" | "replied" | "withdrawn"; owner_reply: string; created_at: string; replied_at: string | null };
type Player = { user_id: string; username: string; display_name: string; avatar_url?: string };
const categories = [
  ["bug", "Bug or app error"], ["gameplay", "Gameplay"], ["account", "Account or profile"],
  ["shop", "Shop or item"], ["payment", "Payment or credits"], ["classroom", "Classroom"],
  ["user", "Report a user"], ["other", "Other problem"],
] as const;
const labelFor = (id: string) => categories.find(([key]) => key === id)?.[1] ?? id;

export default function ReportTickets({ owner = false, onBack }: { owner?: boolean; onBack?: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]), [category, setCategory] = useState("bug"), [description, setDescription] = useState(""), [search, setSearch] = useState(""), [players, setPlayers] = useState<Player[]>([]), [selected, setSelected] = useState<Player | null>(null), [reply, setReply] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [view, setView] = useState<"form" | "list">(owner ? "list" : "form");
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    try { const result = await arena<{ tickets: Ticket[] }>("report-list", { scope: owner ? "owner" : "mine", page }); setTickets(result.tickets); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [owner, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (category !== "user" || selected || search.trim().length < 2) { return; }
    let current = true;
    const timer = window.setTimeout(() => { void arena<{ players: Player[] }>("search-players", { query: search.trim() }).then(data => { if (current) setPlayers(data.players); }).catch(() => { if (current) setPlayers([]); }); }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [category, search, selected]);
  async function send() {
    if (description.trim().length < 10) { toast.error("Describe the problem in at least 10 characters."); return; }
    if (category === "user" && !selected) { toast.error("Search and select the user's username."); return; }
    setBusy(true);
    try { await arena("report-create", { category, description: description.trim(), username: selected?.username }); setDescription(""); setSearch(""); setSelected(null); setPlayers([]); setCategory("bug"); setPage(0); await load(); setView("list"); toast.success("Report sent to the Chess Burger owner."); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function action(kind: "report-delete" | "report-withdraw" | "report-reply", ticket: Ticket) {
    if (kind === "report-delete" && !window.confirm("Permanently delete this report ticket?")) return;
    if (kind === "report-withdraw" && !window.confirm("Withdraw this report? The owner can still see that it was withdrawn.")) return;
    setBusy(true);
    try { await arena(kind, { id: ticket.id, reply: reply[ticket.id]?.trim() }); await load(); toast.success(kind === "report-reply" ? "Reply sent." : kind === "report-withdraw" ? "Report withdrawn." : "Report deleted."); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="report-page">
    <header className="report-hero">{onBack && <button className="report-back" type="button" onClick={onBack}><ArrowLeft size={15}/> Back</button>}<span>CHESS BURGER SUPPORT</span><h1>{owner ? "Report Ticket Form" : "Report Form"}</h1><p>{owner ? "Review player reports and send feedback from the owner inbox." : "Tell us what happened. Your report is visible only to you and the Chess Burger owner."}</p></header>
    <nav className="report-tabs" aria-label="Report sections">{!owner && <button type="button" className={view === "form" ? "active" : ""} onClick={() => setView("form")}><Flag size={15}/> Report Form</button>}<button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}><MessageSquare size={15}/> {owner ? "Reports" : `My Reports (${tickets.length})`}</button></nav>
    {view === "form" && !owner && <div className="report-panel report-form"><label>Problem category<select value={category} onChange={event => { setCategory(event.target.value); setSelected(null); setSearch(""); setPlayers([]); }}>{categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {category === "user" && <div className="report-user-search"><label>Username to report<div className="report-search-input"><Search size={17}/><input value={search} maxLength={40} onChange={event => { setSearch(event.target.value); setSelected(null); }} placeholder="Search @username"/></div></label>{selected && <p className="report-selected">Selected: @{selected.username} · {selected.display_name}</p>}{!selected && players.length > 0 && <div className="report-search-results">{players.map(player => <button type="button" key={player.user_id} onClick={() => { setSelected(player); setSearch(`@${player.username}`); setPlayers([]); }}><strong>@{player.username}</strong><small>{player.display_name}</small></button>)}</div>}</div>}
      <label>Explain the problem<textarea maxLength={2000} rows={6} value={description} onChange={event => setDescription(event.target.value)} placeholder={category === "user" ? "Explain what this user did, including when and where it happened…" : "What happened? Include the steps you took and what you expected to happen…"}/><small>{description.length}/2000 characters</small></label><button type="button" className="report-primary" disabled={busy || description.trim().length < 10 || (category === "user" && !selected)} onClick={() => void send()}><Send size={16}/>{busy ? "Sending…" : "Send report"}</button></div>}
    {view === "list" && <div className="report-panel"><div className="report-list-heading"><h2>{owner ? "All report tickets" : "Your reports"}</h2><button type="button" onClick={() => void load()} disabled={busy}>Refresh</button></div>{error && <p className="report-error" role="alert">{error}</p>}{loading ? <p>Loading reports…</p> : !tickets.length && !error ? <p className="report-empty">{owner ? "No reports received yet." : "You have not sent a report yet."}</p> : <div className="report-list">{tickets.map(ticket => <article key={ticket.id} className="report-ticket"><div className="report-ticket-top"><strong><Bug size={15}/> {labelFor(ticket.category)}</strong><span className={`report-status ${ticket.status}`}>{ticket.status}</span></div><small>{owner && ticket.reporter && <>From @{ticket.reporter.username} · </>}{new Date(ticket.created_at).toLocaleString()}{ticket.target_username && <> · About @{ticket.target_username}</>}</small><p>{ticket.description}</p>{ticket.owner_reply && <div className="report-owner-reply"><b>Owner feedback</b><p>{ticket.owner_reply}</p>{ticket.replied_at && <small>{new Date(ticket.replied_at).toLocaleString()}</small>}</div>}{owner && ticket.status !== "withdrawn" && <div className="report-reply-control"><label htmlFor={`reply-${ticket.id}`}>Reply and give feedback</label><textarea id={`reply-${ticket.id}`} rows={3} maxLength={2000} value={reply[ticket.id] ?? ticket.owner_reply ?? ""} onChange={event => setReply(value => ({ ...value, [ticket.id]: event.target.value }))} placeholder="Write a response to the reporter…"/><button type="button" disabled={busy || !(reply[ticket.id] ?? ticket.owner_reply ?? "").trim()} onClick={() => void action("report-reply", ticket)}><Send size={14}/> Send reply</button></div>}<div className="report-ticket-actions">{!owner && ticket.status !== "withdrawn" && <button type="button" disabled={busy} onClick={() => void action("report-withdraw", ticket)}><Undo2 size={14}/> Withdraw</button>}<button type="button" className="report-danger" disabled={busy} onClick={() => void action("report-delete", ticket)}><Trash2 size={14}/> Delete</button></div></article>)}</div>}{(page > 0 || tickets.length === 50) && <div className="report-pagination"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1}</span><button type="button" disabled={tickets.length < 50} onClick={() => setPage(value => value + 1)}>Next</button></div>}</div>}
  </section>;
}
