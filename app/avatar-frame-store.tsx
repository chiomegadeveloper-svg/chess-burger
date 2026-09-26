"use client";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import { AVATAR_FRAMES, AVATAR_FRAME_PRICES, type AvatarFrameDays } from "./avatar-frame-catalog";
import { AvatarFrameArt } from "./avatar-frame-art";
import "./avatar-frames.css";

type Rental = { item_id: string; frame_id: string; expires_at: string };
type State = { owned: Rental[]; active: string | null; gold: number };
const durations: AvatarFrameDays[] = [7, 21, 30];
const labels: Record<AvatarFrameDays, string> = { 7: "1 week", 21: "3 weeks", 30: "1 month" };

export function AvatarFrameStore({ onBack, onChanged, photo }: { onBack: () => void; onChanged: () => void; photo?: string }) {
  const [state, setState] = useState<State>({ owned: [], active: null, gold: 0 });
  const [days, setDays] = useState<AvatarFrameDays>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => setState(await arena<State>("avatar-frame-state"));
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Avatar frames are unavailable.")); }, []);
  const rent = async (frameId: string) => {
    if (busy || !window.confirm(`Rent this frame for ${labels[days]} for ${AVATAR_FRAME_PRICES[days]} CBG? It will be added to your Bag.`)) return;
    setBusy(true);
    try {
      await arena("rent-avatar-frame", { frame_id: frameId, days, request_id: crypto.randomUUID() });
      await load(); onChanged(); toast.success("Avatar frame added to your Bag. Equip it there or gift it.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not rent this frame."); }
    finally { setBusy(false); }
  };
  return <section className="avatar-frame-store">
    <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={16}/>Shop</button>
    <header><div><small>CHESS BURGER COLLECTION</small><h1>Avatar Frames</h1><p>Rent a frame, equip it from your Bag, or gift its remaining time to another player.</p></div><strong>{state.gold} CBG</strong></header>
    {error && <p role="alert" className="board-store-error">{error}</p>}
    <fieldset className="avatar-frame-duration"><legend>Rental period</legend>{durations.map(option => <button type="button" key={option} aria-pressed={days === option} onClick={() => setDays(option)}><strong>{labels[option]}</strong><span>{AVATAR_FRAME_PRICES[option]} CBG</span></button>)}</fieldset>
    {(["basic", "premium"] as const).map(tier => <section className="avatar-frame-section" key={tier}><h2>{tier === "basic" ? "Basic chess frames" : "Premium chess frames"}</h2><div className="avatar-frame-grid">{AVATAR_FRAMES.filter(frame => frame.tier === tier).map(frame => <article key={frame.id} className="avatar-frame-card"><AvatarFrameArt frameId={frame.id} photo={photo}/><h3>{frame.name}</h3><small>{tier} · {state.owned.filter(item => item.frame_id === frame.id).length} in Bag</small><button type="button" disabled={busy || !!error || state.gold < AVATAR_FRAME_PRICES[days]} onClick={() => void rent(frame.id)}>Rent · {AVATAR_FRAME_PRICES[days]} CBG</button></article>)}</div></section>)}
  </section>;
}
