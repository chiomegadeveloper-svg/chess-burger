"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Crown, PackageOpen, ShoppingBag, Ticket } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import { FEED_BANNERS, FEED_BANNER_DURATIONS, feedBanner, feedBannerRentalPrice, type FeedBanner, type FeedBannerDuration } from "./feed-banner-catalog";
import type { PlayerProfile } from "./supabase";
import { getSupabase } from "./supabase";
import "./feed-banner-shop.css";

type BannerRental = { product_id: string; expires_at: string };
type ShopState = { owned: BannerRental[]; active: string; gold: number; server_now?: string };
const rentalFor = (state: ShopState, id: string) => state.owned.find((item) => item.product_id === id);
const rentalLabel = (expiresAt?: string) => expiresAt ? `Until ${new Date(expiresAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}` : "";
const ARENA_BUNDLES=[{quantity:1,name:"Solo Ticket",price:28},{quantity:3,name:"Trio Tickets",price:78},{quantity:5,name:"Arena Pack",price:128}] as const;

function ArenaTicketStore({fallbackGold}:{fallbackGold:number}){
  const[tickets,setTickets]=useState(0),[balance,setBalance]=useState(fallbackGold),[busy,setBusy]=useState<number|null>(null);
  const call=async(action:string,body:Record<string,unknown>={})=>{const client=await getSupabase(),session=client?(await client.auth.getSession()).data.session:null;if(!session)throw Error("Sign in to buy Arena Tickets.");const response=await fetch('/api/grand-arena',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,...body}),cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error??'Unable to update Arena Tickets.');return data as {tickets:number;gold:number};};
  useEffect(()=>{void call('state',{pair:false}).then(data=>{setTickets(data.tickets);setBalance(data.gold);}).catch(()=>{});},[]);
  const buy=async(bundle:typeof ARENA_BUNDLES[number])=>{if(busy!==null)return;if(!window.confirm(`Buy ${bundle.quantity} Arena Ticket${bundle.quantity>1?'s':''} for ${bundle.price} Gold?`))return;setBusy(bundle.quantity);try{const data=await call('buy',{quantity:bundle.quantity,request_id:crypto.randomUUID()});setTickets(data.tickets);setBalance(data.gold);toast.success(`${bundle.quantity} Arena Ticket${bundle.quantity>1?'s':''} added to your account.`);}catch(error){toast.error((error as Error).message);}finally{setBusy(null);}};
  return <section className="arena-ticket-store"><div className="arena-ticket-store-heading"><img src="/grand-arena/arena-ticket.webp" alt="Chess Burger Arena Ticket"/><div><span>GRAND ARENA ACCESS</span><h2>Arena Tickets</h2><p>One ticket admits one competitive Arena run.</p></div><b><Ticket size={14}/>{tickets} owned</b></div><div className="arena-ticket-bundles">{ARENA_BUNDLES.map(bundle=><article key={bundle.quantity}><strong>{bundle.name}</strong><span>{bundle.quantity} ticket{bundle.quantity>1?'s':''}</span><small>{bundle.quantity>1?`${Math.round((1-bundle.price/(bundle.quantity*28))*100)}% bundle savings`:'Standard admission'}</small><button type="button" disabled={busy!==null||balance<bundle.price} onClick={()=>void buy(bundle)}>{busy===bundle.quantity?'Purchasing…':`${bundle.price} Gold`}</button></article>)}</div></section>;
}

function BannerTile({ banner, expiresAt, active, busy, disableWhenActive = false, actionLabel, onAction }: { banner: FeedBanner; expiresAt?: string; active: boolean; busy: boolean; disableWhenActive?: boolean; actionLabel: ReactNode; onAction: () => void }) {
  return <article className={`banner-product ${active ? "is-active" : ""}`}>
    <div className="banner-product-preview"><span className="banner-swatch" style={{ background: banner.background }} aria-hidden="true" /></div>
    <div className="banner-product-copy"><h3>{banner.name}</h3><span className={`banner-tier-tag ${banner.tier}`}>{banner.tier === "metallic" && <Crown size={10}/>} {banner.tier === "metallic" ? "Premium" : "Pastel"}</span>{expiresAt && <small className="rental-expiry">{rentalLabel(expiresAt)}</small>}</div>
    <button type="button" disabled={busy || (active && disableWhenActive)} onClick={onAction}>{actionLabel}</button>
  </article>;
}

function useShopState() {
  const [state, setState] = useState<ShopState>({ owned: [], active: "", gold: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => { void arena("shop-banners").then((data) => setState(data as ShopState)).catch((error) => toast.error(error.message)).finally(() => setLoading(false)); }, []);
  return { state, setState, loading };
}

export function ShopPage({ profile, onChanged }: { profile: PlayerProfile | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [days, setDays] = useState<FeedBannerDuration>(7);
  const { state, setState, loading } = useShopState();
  const act = async (banner: FeedBanner) => {
    setBusy(banner.id);
    try {
      const data = await arena("buy-feed-banner", { product_id: banner.id, days, request_id: crypto.randomUUID() }) as { active: string; gold: number; expires_at: string };
      setState((current) => ({ ...current, active: data.active, gold: data.gold ?? current.gold, owned: [...current.owned.filter((item) => item.product_id !== banner.id), { product_id: banner.id, expires_at: data.expires_at }] }));
      toast.success(`${banner.name} rented for ${days === 7 ? "1 week" : `${days} days`} and activated.`);
      onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update banner."); }
    finally { setBusy(""); }
  };
  if (open) return <section className="shop-page banner-store">
    <button className="back-button" type="button" onClick={() => setOpen(false)}><ArrowLeft size={16}/> Shop</button>
    <div className="page-heading banner-heading"><div><span className="shop-eyebrow">Personalize your feed</span><h1>Feed Banner Colors</h1><p>Choose a signature color for every community post you share.</p></div><span className="banner-wallet"><span className="gold-coin">●</span><strong>{state.gold || profile?.gold_points || 0}</strong><small>Gold balance</small></span></div>
    <fieldset className="rental-duration"><legend>Choose rental duration</legend>{FEED_BANNER_DURATIONS.map((option) => <button type="button" className={days === option ? "selected" : ""} aria-pressed={days === option} key={option} onClick={() => setDays(option)}><strong>{option === 7 ? "1 Week" : `${option} Days`}</strong><span>Pastel {feedBannerRentalPrice("pastel", option)} · Premium {feedBannerRentalPrice("metallic", option)} Gold</span></button>)}</fieldset>
    {loading ? <p className="account-note">Loading banner collection…</p> : <>
      {(["pastel", "metallic"] as const).map((tier) => <section className={`banner-tier ${tier}`} key={tier}><div className="banner-tier-heading"><div><span>{tier === "pastel" ? "Basic collection" : "Premium collection"}</span><h2>{tier === "pastel" ? "Pastel Colors" : "Metallic Colors"}</h2><p>{tier === "pastel" ? "Soft, clean colors for a friendly feed." : "Reflective finishes for a distinctive profile."}</p></div><b>10 colors</b></div><div className="banner-products">{FEED_BANNERS.filter((banner) => banner.tier === tier).map((banner) => { const rental = rentalFor(state, banner.id); return <BannerTile key={banner.id} banner={banner} expiresAt={rental?.expires_at} active={state.active === banner.id} busy={busy === banner.id} actionLabel={<><span className="gold-coin">●</span>{rental ? "Extend" : "Rent"} {days === 7 ? "1 week" : `${days} days`} · {feedBannerRentalPrice(banner.tier, days)} Gold</>} onAction={() => void act(banner)}/>; })}</div></section>)}
    </>}
  </section>;
  return <section className="shop-page">
    <div className="page-heading"><h1>Chess Burger shop</h1><span className="sample-label">{state.gold || profile?.gold_points || 0} Gold</span></div>
    <ArenaTicketStore fallbackGold={state.gold || profile?.gold_points || 0}/>
    <div className="shop-grid">
      {[["♞","Avatar frames","Decorative player-card frames."],["♛","Board themes","Metallic boards and pieces."],["♟","Gold rewards","Reward items for your collection."]].map(([icon,name,desc]) => <article key={name}><span className="shop-icon">{icon}</span><div><h2>{name}</h2><p>{desc}</p></div><span className="shop-status">Coming soon</span></article>)}
      <article className="shop-category-ready">
        <span className="shop-icon banner-category-icon"><span className="category-color-circle" aria-hidden="true"/></span><div><h2>Feed Banners</h2><p>Pastel and metallic colors for your community posts.</p></div><button type="button" onClick={() => setOpen(true)}>View colors</button>
      </article>
    </div>
  </section>;
}

export function BagPage({ onChanged }: { onChanged: () => void }) {
  const { state, setState, loading } = useShopState();
  const [busy, setBusy] = useState("");
  const activate = async (id: string) => { setBusy(id); try { const data = await arena("activate-feed-banner", { product_id: id }) as { active: string; gold: number }; setState((current) => ({ ...current, active: data.active })); toast.success(`${feedBanner(id)?.name ?? "Banner"} activated.`); onChanged(); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to activate item."); } finally { setBusy(""); } };
  return <section className="bag-page"><div className="page-heading"><div><h1>My Bag</h1><p>Your active Chess Burger rentals.</p></div><span className="bag-count"><ShoppingBag size={16}/>{state.owned.length}</span></div>
    {loading ? <p className="account-note">Opening your bag…</p> : state.owned.length === 0 ? <div className="empty-bag"><PackageOpen size={42}/><h2>Your bag is empty</h2><p>Rent a Feed Banner in the Shop and it will appear here until it expires.</p></div> : <div className="bag-tiles">{state.owned.map((rental) => { const banner = feedBanner(rental.product_id); if (!banner) return null; const active = state.active === rental.product_id; return <BannerTile key={rental.product_id} banner={banner} expiresAt={rental.expires_at} active={active} busy={busy === rental.product_id} disableWhenActive actionLabel={active ? <><Check size={13}/> Active</> : "Use banner"} onAction={() => void activate(rental.product_id)}/>; })}</div>}
  </section>;
}
