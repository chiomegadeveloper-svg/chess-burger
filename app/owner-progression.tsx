"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { arena } from "./arena-client";
import "./owner-progression.css";

type ProgressEntry = {
  id: number; event_type: "baseline" | "change"; old_cbr: number | null; new_cbr: number;
  old_level: number | null; new_level: number; old_wins: number | null; new_wins: number;
  old_losses: number | null; new_losses: number; actor_user_id: string | null; created_at: string;
};
type ProgressResponse = { entries: ProgressEntry[]; page: number; total: number };

const when = (date: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", hour12: true,
}).format(new Date(date));

export default function OwnerProgression({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<{ key: string; data?: ProgressResponse; error?: string } | null>(null);
  const key = `${userId}:${page}`;

  useEffect(() => {
    let live = true;
    void arena<ProgressResponse>("owner-progression", { user_id: userId, page })
      .then(result => { if (live) setResponse({ key, data: result }); })
      .catch(cause => { if (live) setResponse({ key, error: (cause as Error).message }); });
    return () => { live = false; };
  }, [userId, page, key]);

  const loading = response?.key !== key;
  const data = loading ? null : response?.data ?? null;
  const error = loading ? "" : response?.error ?? "";
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return <section className="owner-progression cloud-panel" aria-label="Owner-only player progression log">
    <header className="owner-progression-header">
      <span className="owner-progression-icon"><ShieldCheck size={19}/></span>
      <div><small>OWNER ONLY · PLAYER REVIEW</small><h2>Level progression log</h2></div>
      <span className="owner-progression-total">{data?.total ?? 0} / 100 recent records</span>
    </header>
    <p className="owner-progression-note">Every CBR change is recorded from audit activation. The starting snapshot does not represent earlier match history.</p>
    {error && <p className="owner-progression-error" role="alert">{error}</p>}
    {loading && <p className="owner-progression-empty">Loading progression…</p>}
    {!loading && !error && !data?.entries.length && <p className="owner-progression-empty">No progression records yet.</p>}
    {!loading && !error && <ol className="owner-progression-list" start={(page - 1) * 20 + 1}>
      {data?.entries.map(row => {
        const baseline = row.event_type === "baseline";
        const delta = row.new_cbr - (row.old_cbr ?? row.new_cbr);
        const wins = row.new_wins - (row.old_wins ?? row.new_wins);
        const losses = row.new_losses - (row.old_losses ?? row.new_losses);
        const jump = !baseline && row.old_level !== null && row.new_level - row.old_level > 1;
        return <li key={row.id} className={jump ? "owner-progression-row review" : "owner-progression-row"}>
          <span className="owner-progression-row-icon">{jump ? <AlertTriangle size={16}/> : <Activity size={16}/>}</span>
          <div className="owner-progression-change">
            <strong>{baseline ? `Starting snapshot · Level ${row.new_level}` : `Level ${row.old_level} → ${row.new_level}`}</strong>
            <small>{baseline ? "Audit started here" : `${row.old_cbr} → ${row.new_cbr} CBR · ${delta > 0 ? "+" : ""}${delta} CBR`}</small>
          </div>
          <div className="owner-progression-context">
            {jump && <b>Review level jump</b>}
            {!baseline && (wins !== 0 || losses !== 0) && <small>Wins {wins > 0 ? "+" : ""}{wins} · Losses {losses > 0 ? "+" : ""}{losses}</small>}
            {!baseline && wins === 0 && losses === 0 && !jump && <small>No win/loss count change</small>}
            {!baseline && row.actor_user_id && <small title={row.actor_user_id}>Requester: {row.actor_user_id === userId ? "player" : row.actor_user_id.slice(0, 8)}</small>}
          </div>
          <time dateTime={row.created_at}>{when(row.created_at)}</time>
        </li>;
      })}
    </ol>}
    {!error && totalPages > 1 && <footer className="owner-progression-pages">
      <button type="button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15}/>Previous</button>
      <span>Page {page} of {totalPages} · 20 per page</span>
      <button type="button" disabled={loading || page >= totalPages} onClick={() => setPage(value => value + 1)}>Next<ChevronRight size={15}/></button>
    </footer>}
  </section>;
}
