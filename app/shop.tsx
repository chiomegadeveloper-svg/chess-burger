"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, PackageOpen, Palette, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import { FEED_BANNERS, feedBanner, type FeedBanner } from "./feed-banner-catalog";
import type { PlayerProfile } from "./supabase";

type ShopState = { owned: string[]; active: string; gold: number };

function BannerTile({ banner, owned, active, busy, onAction }: { banner: FeedBanner; owned: boolean; active: boolean; busy: boolean; onAction: () => void }) {
  return <article className={`banner-product ${active ? "is-active" : ""}`}>
    <span className="banner-swatch" style={{ background: banner.background }} aria-hidden="true" />
    <div><h3>{banner.name}</h3><p>{banner.tier === "metallic" ? "Metallic finish" : "Pastel color"}</p></div>
    <button type="button" disabled={busy || active} onClick={onAction}>
      {active ? <><Check size={13}/> Active</> : owned ? "Activate" : `${banner.price} Gold`}
    </button>
  </article>;
}

function useShopState() {
  const [state, setState] = useState<ShopState>({ owned: [], active: "", gold: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => { void arena("shop-banners").then((data) => setState(data as ShopState)).catch((error) => toast.error(error.message)).finally(() => setLoading(false)); }, []);
  return { state, setState, loading };
}

export function ShopPage({ profile, onChanged }: { profile: PlayerProfile | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState("");
  const { state, setState, loading } = useShopState();
  const act = async (banner: FeedBanner) => {
    setBusy(banner.id);
    try {
      const data = await arena(state.owned.includes(banner.id) ? "activate-feed-banner" : "buy-feed-banner", { product_id: banner.id, request_id: crypto.randomUUID() }) as { active: string; gold: number; owned?: boolean };
      setState((current) => ({ active: data.active, gold: data.gold ?? current.gold, owned: current.owned.includes(banner.id) ? current.owned : [...current.owned, banner.id] }));
      toast.success(state.owned.includes(banner.id) ? `${banner.name} banner activated.` : `${banner.name} purchased and activated.`);
      onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update banner."); }
    finally { setBusy(""); }
  };
  if (open) return <section className="shop-page banner-store">
    <button className="back-button" type="button" onClick={() => setOpen(false)}><ArrowLeft size={16}/> Shop</button>
    <div className="page-heading"><div><h1>Feed Banners</h1><p>Give every post on your feed a signature color.</p></div><span className="sample-label">{state.gold || profile?.gold_points || 0} Gold</span></div>
    {loading ? <p className="account-note">Loading banner collection…</p> : <>
      {(["pastel", "metallic"] as const).map((tier) => <section className="banner-tier" key={tier}><h2>{tier === "pastel" ? "Pastel collection" : "Metallic collection"}</h2><div className="banner-products">{FEED_BANNERS.filter((banner) => banner.tier === tier).map((banner) => <BannerTile key={banner.id} banner={banner} owned={state.owned.includes(banner.id)} active={state.active === banner.id} busy={busy === banner.id} onAction={() => void act(banner)}/>)}</div></section>)}
    </>}
  </section>;
  return <section className="shop-page">
    <div className="page-heading"><h1>Chess Burger shop</h1><span className="sample-label">{state.gold || profile?.gold_points || 0} Gold</span></div>
    <div className="shop-grid">
      {[["♞","Avatar frames","Decorative player-card frames."],["♛","Board themes","Metallic boards and pieces."],["♟","Gold rewards","Reward items for your collection."]].map(([icon,name,desc]) => <article key={name}><span className="shop-icon">{icon}</span><div><h2>{name}</h2><p>{desc}</p></div><span className="shop-status">Coming soon</span></article>)}
      <button className="shop-category-ready" type="button" onClick={() => setOpen(true)}>
        <span className="shop-icon"><Palette size={24}/></span><span className="shop-category-copy"><strong>Feed Banners</strong><small>20 pastel and metallic colors for your feed.</small></span><span className="shop-category-action">View colors</span>
      </button>
    </div>
  </section>;
}

export function BagPage({ onChanged }: { onChanged: () => void }) {
  const { state, setState, loading } = useShopState();
  const [busy, setBusy] = useState("");
  const activate = async (id: string) => { setBusy(id); try { const data = await arena("activate-feed-banner", { product_id: id }) as { active: string; gold: number }; setState((current) => ({ ...current, active: data.active })); toast.success(`${feedBanner(id)?.name ?? "Banner"} activated.`); onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to activate item."); } finally { setBusy(""); } };
  return <section className="bag-page"><div className="page-heading"><div><h1>My Bag</h1><p>Your purchased Chess Burger items.</p></div><span className="bag-count"><ShoppingBag size={16}/>{state.owned.length}</span></div>
    {loading ? <p className="account-note">Opening your bag…</p> : state.owned.length === 0 ? <div className="empty-bag"><PackageOpen size={42}/><h2>Your bag is empty</h2><p>Purchase a Feed Banner in the Shop and it will appear here.</p></div> : <div className="bag-tiles">{state.owned.map((id) => { const banner = feedBanner(id); if (!banner) return null; const active = state.active === id; return <BannerTile key={id} banner={banner} owned active={active} busy={busy === id} onAction={() => void activate(id)}/>; })}</div>}
  </section>;
}
