"use client";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import { BOARD_THEMES, BOARD_THEME_PRICES, type BoardRentalDays, type BoardTheme } from "./board-themes";
import { BoardThemePreview } from "./board-theme-preview";
import "./board-theme-store.css";

type Rental = { theme_id: string; expires_at: string };
type State = { owned: Rental[]; active: string; gold: number };
const durations: BoardRentalDays[] = [7, 21, 30];
const durationLabel: Record<BoardRentalDays, string> = { 7: "1 week", 21: "3 weeks", 30: "1 month" };

export function BoardThemeStore({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [state, setState] = useState<State>({ owned: [], active: "slate", gold: 0 });
  const [days, setDays] = useState<BoardRentalDays>(7);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void arena<State>("board-theme-state")
      .then(result => { if (alive) setState(result); })
      .catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : "Board rentals are unavailable."); });
    return () => { alive = false; };
  }, []);
  const rent = async (theme: BoardTheme) => {
    if (busy || error) return;
    const previous = state.owned.find(item => item.theme_id === theme.id && new Date(item.expires_at).getTime() > Date.now());
    if (!window.confirm(`${previous ? "Extend" : "Rent"} ${theme.name} for ${durationLabel[days]} for ${BOARD_THEME_PRICES[days]} CBG?`)) return;
    setBusy(theme.id);
    try {
      const result = await arena<{ active: string; gold: number; expires_at: string }>("rent-board-theme", { theme_id: theme.id, days, request_id: crypto.randomUUID() });
      setState(current => ({ ...current, active: result.active, gold: result.gold, owned: [...current.owned.filter(item => item.theme_id !== theme.id), { theme_id: theme.id, expires_at: result.expires_at }] }));
      window.dispatchEvent(new Event("cb-board-theme-changed"));
      toast.success(`${theme.name} ${previous ? "extended" : "rented"} and activated.`);
      onChanged();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to rent this board."); }
    finally { setBusy(null); }
  };
  const activate = async (theme: BoardTheme) => {
    if (busy) return;
    setBusy(theme.id);
    try {
      const result = await arena<{ active: string }>("activate-board-theme", { theme_id: theme.id });
      setState(current => ({ ...current, active: result.active }));
      window.dispatchEvent(new Event("cb-board-theme-changed"));
      toast.success(`${theme.name} is now your board.`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to change board."); }
    finally { setBusy(null); }
  };
  return <section className="board-store">
    <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16}/>Shop</button>
    <header><div><small>PERSONALIZE YOUR GAME</small><h1>Board Themes</h1><p>Choose your look. Rentals are saved to your account and expire automatically.</p></div><strong>{state.gold} CBG</strong></header>
    {error && <p className="board-store-error" role="alert">{error}</p>}
    <fieldset className="board-store-duration"><legend>Choose rental duration</legend>{durations.map(option => <button type="button" key={option} aria-pressed={option === days} onClick={() => setDays(option)}><strong>{durationLabel[option]}</strong><span>{BOARD_THEME_PRICES[option]} CBG</span></button>)}</fieldset>
    {(["theme", "color"] as const).map(group => <section key={group} className="board-store-section"><div className="board-store-title"><small>{group === "theme" ? "CREATIVE COLLECTION" : "CLASSIC COLLECTION"}</small><h2>{group === "theme" ? "Character Board Themes" : "Board Colors"}</h2></div><div className="board-store-grid">{BOARD_THEMES.filter(theme => theme.group === group).map(theme => {
      const rental = state.owned.find(item => item.theme_id === theme.id && new Date(item.expires_at).getTime() > Date.now());
      return <article key={theme.id} className="board-store-card"><BoardThemePreview theme={theme}/><h3>{theme.name}</h3>{rental && <small>Rented until {new Date(rental.expires_at).toLocaleDateString()}</small>}{state.active === theme.id && <span className="board-store-active">Active</span>}
        <div className="board-store-actions"><button type="button" disabled={!!busy || !!error || state.gold < BOARD_THEME_PRICES[days]} onClick={() => void rent(theme)}>{busy === theme.id ? "Processing…" : `${rental ? "Extend" : "Rent"} · ${BOARD_THEME_PRICES[days]} CBG`}</button>{rental && state.active !== theme.id && <button type="button" disabled={!!busy} onClick={() => void activate(theme)}>Use board</button>}</div>
      </article>;
    })}</div></section>)}
  </section>;
}
