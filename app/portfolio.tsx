"use client";

import { useEffect, useState } from "react";
import { Camera, Plus, Trash2, X } from "lucide-react";
import { getSupabase } from "./supabase";
import { toWebpUnder500Kb, validateImageFile } from "./media";
import "./portfolio.css";

type Entry = { user_id: string; slot: number; image_url: string; title: string; article: string; updated_at: string };
type Draft = { slot: number; title: string; article: string; image_url: string; file: File | null; preview: string };

function storedPath(url: string, userId: string) {
  try {
    const prefix = "/storage/v1/object/public/cb-profile-media/";
    const pathname = new URL(url).pathname;
    const path = decodeURIComponent(pathname.slice(pathname.indexOf(prefix) + prefix.length));
    return pathname.includes(prefix) && path.startsWith(userId + "/portfolio-") ? path : "";
  } catch { return ""; }
}

export default function Portfolio({ userId, owner = false }: { userId: string; owner?: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setEntries([]); setSelected(null); setDraft(null); setLoading(true); setError("");
    void (async () => {
      try {
        const client = await getSupabase();
        if (!client) throw Error("Connect to load this portfolio.");
        const { data, error: issue } = await client.from("cb_profile_portfolio")
          .select("user_id,slot,image_url,title,article,updated_at").eq("user_id", userId).order("slot");
        if (issue) throw issue;
        if (active) setEntries(data ?? []);
      } catch (cause) {
        if (active) setError((cause as Error).message || "Portfolio is unavailable.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => () => { if (draft?.preview) URL.revokeObjectURL(draft.preview); }, [draft?.preview]);
  const edit = (slot: number) => {
    const entry = entries.find(item => item.slot === slot);
    setError(""); setSelected(null);
    setDraft({ slot, title: entry?.title ?? "", article: entry?.article ?? "", image_url: entry?.image_url ?? "", file: null, preview: "" });
  };
  const save = async () => {
    if (!draft || busy) return;
    const title = draft.title.trim(), article = draft.article.trim();
    if (!title || !article || (!draft.file && !draft.image_url)) { setError("Add a photo, title, and article before publishing."); return; }
    setBusy(true); setError("");
    let uploadedPath = "";
    try {
      const client = await getSupabase();
      if (!client) throw Error("Connect to save your portfolio.");
      const { data: { user } } = await client.auth.getUser();
      if (user?.id !== userId) throw Error("Sign in to edit your own portfolio.");
      let imageUrl = draft.image_url;
      if (draft.file) {
        validateImageFile(draft.file);
        const image = await toWebpUnder500Kb(draft.file);
        uploadedPath = `${userId}/portfolio-${draft.slot}-${crypto.randomUUID()}.webp`;
        const upload = await client.storage.from("cb-profile-media").upload(uploadedPath, image, { contentType: "image/webp", upsert: false });
        if (upload.error) throw upload.error;
        imageUrl = client.storage.from("cb-profile-media").getPublicUrl(uploadedPath).data.publicUrl;
      }
      const { data, error: issue } = await client.from("cb_profile_portfolio")
        .upsert({ user_id: userId, slot: draft.slot, title, article, image_url: imageUrl, updated_at: new Date().toISOString() }, { onConflict: "user_id,slot" }).select().single();
      if (issue) throw issue;
      setEntries(current => [...current.filter(item => item.slot !== draft.slot), data].sort((a, b) => a.slot - b.slot));
      if (uploadedPath && draft.image_url) {
        const old = storedPath(draft.image_url, userId);
        if (old) void client.storage.from("cb-profile-media").remove([old]);
      }
      setDraft(null);
    } catch (cause) {
      if (uploadedPath) { const client = await getSupabase(); if (client) void client.storage.from("cb-profile-media").remove([uploadedPath]); }
      setError((cause as Error).message || "Could not save the article.");
    } finally { setBusy(false); }
  };
  const remove = async (entry: Entry) => {
    if (busy || !window.confirm(`Delete “${entry.title}” from your portfolio?`)) return;
    setBusy(true); setError("");
    try {
      const client = await getSupabase();
      if (!client) throw Error("Connect to delete the article.");
      const { error: issue } = await client.from("cb_profile_portfolio").delete().eq("user_id", userId).eq("slot", entry.slot);
      if (issue) throw issue;
      setEntries(current => current.filter(item => item.slot !== entry.slot));
      setSelected(null); setDraft(null);
      const path = storedPath(entry.image_url, userId);
      if (path) void client.storage.from("cb-profile-media").remove([path]);
    } catch (cause) { setError((cause as Error).message || "Could not delete the article."); }
    finally { setBusy(false); }
  };

  if (!owner && !loading && !entries.length) return null;
  return <section className="profile-portfolio cloud-panel" aria-label="Player portfolio">
    <header><div><small>PLAYER STORIES</small><h2>Portfolio</h2><p>Achievements, special events, and stories worth sharing.</p></div><span>{entries.length} / 8</span></header>
    {error && <p className="portfolio-error" role="alert">{error}</p>}
    {loading ? <p>Loading portfolio…</p> : <div className="portfolio-grid">
      {Array.from({ length: 8 }, (_, slot) => {
        const entry = entries.find(item => item.slot === slot);
        if (!entry && !owner) return null;
        return entry ? <article className="portfolio-tile" key={slot}>
          <button type="button" className="portfolio-open" onClick={() => setSelected(entry)} aria-label={`Read ${entry.title}`}>
            <img loading="lazy" src={entry.image_url} alt={entry.title}/><strong>{entry.title}</strong>
          </button>
          {owner && <button type="button" className="portfolio-edit" onClick={() => edit(slot)}>Edit</button>}
        </article> : <button key={slot} type="button" className="portfolio-empty" onClick={() => edit(slot)}><Plus/><span>Add story</span></button>;
      })}
    </div>}
    {selected && <div className="portfolio-backdrop" role="presentation" onClick={() => setSelected(null)}><article className="portfolio-dialog" role="dialog" aria-modal="true" aria-label={selected.title} onClick={event => event.stopPropagation()}>
      <button className="portfolio-close" onClick={() => setSelected(null)} aria-label="Close article"><X/></button>
      <img src={selected.image_url} alt={selected.title}/><div><h2>{selected.title}</h2><p>{selected.article}</p>{owner && <button type="button" onClick={() => edit(selected.slot)}>Edit article</button>}</div>
    </article></div>}
    {draft && owner && <div className="portfolio-backdrop" role="presentation" onClick={() => !busy && setDraft(null)}><section className="portfolio-dialog portfolio-form" role="dialog" aria-modal="true" aria-label="Edit portfolio article" onClick={event => event.stopPropagation()}>
      <button className="portfolio-close" type="button" disabled={busy} onClick={() => setDraft(null)} aria-label="Close editor"><X/></button>
      <h2>{entries.some(item => item.slot === draft.slot) ? "Edit story" : "Add story"}</h2>
      {error && <p className="portfolio-error" role="alert">{error}</p>}
      <label className="portfolio-photo"><Camera/> {draft.file ? draft.file.name : "Choose a photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (!file) return;
        try { validateImageFile(file); setError(""); setDraft(current => current && ({ ...current, file, preview: URL.createObjectURL(file) })); }
        catch (cause) { setError((cause as Error).message); }
      }}/></label>
      {(draft.preview || draft.image_url) && <img className="portfolio-preview" src={draft.preview || draft.image_url} alt="Story preview"/>}
      <small>Automatically converted to WebP, under 500 KB.</small>
      <label>Title<input maxLength={100} value={draft.title} onChange={event => setDraft(current => current && ({ ...current, title: event.target.value }))} placeholder="Your achievement or story title"/></label>
      <label>Article<textarea maxLength={5000} rows={7} value={draft.article} onChange={event => setDraft(current => current && ({ ...current, article: event.target.value }))} placeholder="Tell the story behind this photo…"/></label>
      <div className="portfolio-actions"><button type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>{entries.some(item => item.slot === draft.slot) && <button type="button" disabled={busy} onClick={() => void remove(entries.find(item => item.slot === draft.slot)!)}><Trash2 size={16}/> Delete</button>}<button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save article"}</button></div>
    </section></div>}
  </section>;
}
