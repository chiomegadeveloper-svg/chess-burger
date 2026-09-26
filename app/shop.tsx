"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Crown,
  Gift,
  PackageOpen,
  ShoppingBag,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import {
  FEED_BANNERS,
  FEED_BANNER_DURATIONS,
  feedBanner,
  feedBannerRentalPrice,
  isGraphicBanner,
  type FeedBanner,
  type FeedBannerDuration,
} from "./feed-banner-catalog";
import type { PlayerProfile } from "./supabase";
import { getSupabase } from "./supabase";
import { classroom } from "./classroom-client";
import { BoardThemeStore } from "./board-theme-store";
import { AvatarFrameStore } from "./avatar-frame-store";
import { avatarFrame } from "./avatar-frame-catalog";
import { AvatarFrameArt } from "./avatar-frame-art";
import "./feed-banner-shop.css";
import "./graphic-feed-banners.css";
import "./shop-polish.css";
import "./rpg-bag.css";
import "./bag-upgrades.css";

type BannerRental = { product_id: string; expires_at: string };
type ShopState = {
  owned: BannerRental[];
  active: string;
  gold: number;
  server_now?: string;
};
const rentalFor = (state: ShopState, id: string) =>
  state.owned.find((item) => item.product_id === id);
const rentalLabel = (expiresAt?: string) =>
  expiresAt
    ? `Until ${new Date(expiresAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
    : "";
const ARENA_BUNDLES = [
  { quantity: 1, name: "Solo Ticket", price: 28 },
  { quantity: 3, name: "Trio Tickets", price: 78 },
  { quantity: 5, name: "Arena Pack", price: 128 },
] as const;

function ClassroomCreditStore(){
  const [wallet,setWallet]=useState({cbc:0}),[gold,setGold]=useState(0),[price,setPrice]=useState(0),[quantity,setQuantity]=useState(1),[busy,setBusy]=useState(false);
  const load=()=>classroom<{wallet:{cbc:number};gold:number;settings:{cbc_gold_price:number}}>("state").then(r=>{setWallet(r.wallet);setGold(r.gold);setPrice(r.settings.cbc_gold_price)});
  useEffect(()=>{void load().catch(()=>{})},[]);
  const buy=async()=>{if(busy||price<1||!window.confirm(`Buy ${quantity} CBC for ${(price*quantity).toLocaleString()} Gold?`))return;setBusy(true);try{const result=await classroom<{cbc:number;gold:number}>("buy-cbc",{quantity,request_id:crypto.randomUUID()});setWallet({cbc:result.cbc});setGold(result.gold);toast.success(`${quantity} CBC added to your wallet.`)}catch(e){toast.error(e instanceof Error?e.message:"Unable to buy CBC.")}finally{setBusy(false)}};
  return <section className="classroom-credit-store">
    <div className="classroom-shop-heading"><div><small>CHESSBURGER CLASSROOM MARKET</small><h2>Classroom Credits</h2><p>Buy CBC, create teaching rooms, or gift credits to your students.</p></div><div className="classroom-shop-balances"><span><img src="/classroom/cbc-token.webp" alt="CBC"/><i><small>MY CBC</small><b>{wallet.cbc.toLocaleString()}</b></i></span><span><i><small>MY GOLD</small><b>{gold.toLocaleString()} CBG</b></i></span></div></div>
    <div className="cbc-product-showcase"><div className="cbc-product-art"><span className="cbc-glow"/><img src="/classroom/cbc-token.webp" alt="ChessBurger Classroom Credit token"/><b>CLASSROOM CURRENCY</b></div><div className="cbc-product-details"><small>PREMIUM LEARNING TOKEN</small><h3>ChessBurger CBC</h3><p>One token for teachers and students. Room packages add CBC to the teacher’s Bag, ready to gift by username.</p><div className={`cbc-rate ${price<1?"pending":""}`}><span>{price>0?"CURRENT RATE":"PRICE PENDING"}</span><strong>{price>0?`${price.toLocaleString()} CBG`:"Owner setup required"}</strong>{price>0&&<small>for each CBC</small>}</div><div className="cbc-quick-picks" aria-label="Choose CBC quantity">{[1,5,10,25].map(amount=><button type="button" key={amount} className={quantity===amount?"active":""} onClick={()=>setQuantity(amount)}>{amount}<small>CBC</small></button>)}</div><div className="cbc-checkout"><label><span>Custom quantity</span><input type="number" min={1} max={1000} value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(1000,Number(e.target.value)||1)))}/></label><div><small>TOTAL</small><strong>{price>0?(price*quantity).toLocaleString():"—"} CBG</strong></div><button type="button" disabled={busy||price<1||gold<price*quantity} onClick={()=>void buy()}>{busy?"Processing…":price<1?"Awaiting owner price":gold<price*quantity?"Not enough CBG":"Buy CBC"}</button></div></div></div>
    <div className="classroom-shop-note"><b>How CBC works</b><span>Room package → CBC goes to teacher’s Bag → teacher gifts students → student spends 1 CBC to enroll.</span></div>
  </section>;
}

function ArenaTicketStore({ fallbackGold }: { fallbackGold: number }) {
  const [tickets, setTickets] = useState(0),
    [balance, setBalance] = useState(fallbackGold),
    [busy, setBusy] = useState<number | null>(null);
  const call = async (action: string, body: Record<string, unknown> = {}) => {
    const client = await getSupabase(),
      session = client ? (await client.auth.getSession()).data.session : null;
    if (!session) throw Error("Sign in to buy Arena Tickets.");
    const response = await fetch("/api/grand-arena", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, ...body }),
        cache: "no-store",
      }),
      data = await response.json();
    if (!response.ok)
      throw Error(data.error ?? "Unable to update Arena Tickets.");
    return data as { tickets: number; gold: number };
  };
  useEffect(() => {
    void call("state", { pair: false })
      .then((data) => {
        setTickets(data.tickets);
        setBalance(data.gold);
      })
      .catch(() => {});
  }, []);
  const buy = async (bundle: (typeof ARENA_BUNDLES)[number]) => {
    if (busy !== null) return;
    if (
      !window.confirm(
        `Buy ${bundle.quantity} Arena Ticket${bundle.quantity > 1 ? "s" : ""} for ${bundle.price} Gold?`,
      )
    )
      return;
    setBusy(bundle.quantity);
    try {
      const data = await call("buy", {
        quantity: bundle.quantity,
        request_id: crypto.randomUUID(),
      });
      setTickets(data.tickets);
      setBalance(data.gold);
      toast.success(
        `${bundle.quantity} Arena Ticket${bundle.quantity > 1 ? "s" : ""} added to your account.`,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="arena-ticket-store">
      <div className="arena-ticket-store-heading">
        <div className="ticket-art">
          <img
            src="/grand-arena/arena-ticket.webp"
            alt="Chess Burger Arena Ticket"
          />
        </div>
        <div>
          <span>GRAND ARENA ACCESS</span>
          <h2>Arena Tickets</h2>
          <p>One ticket admits one competitive Arena run.</p>
        </div>
        <b>
          <Ticket size={14} />
          {tickets} owned
        </b>
      </div>
      <div className="arena-ticket-bundles">
        {ARENA_BUNDLES.map((bundle, index) => (
          <article
            key={bundle.quantity}
            className={index === 1 ? "featured" : ""}
          >
            <div className="ticket-product-icon">
              <Ticket size={18} />
              <b>×{bundle.quantity}</b>
            </div>
            <div className="ticket-product-copy">
              <strong>{bundle.name}</strong>
              <span>
                {bundle.quantity} ticket{bundle.quantity > 1 ? "s" : ""}
              </span>
              <small>
                {bundle.quantity > 1
                  ? `${Math.round((1 - bundle.price / (bundle.quantity * 28)) * 100)}% bundle savings`
                  : "Standard admission"}
              </small>
            </div>
            <button
              type="button"
              disabled={busy !== null || balance < bundle.price}
              onClick={() => void buy(bundle)}
            >
              {busy === bundle.quantity ? (
                "Purchasing…"
              ) : (
                <>
                  <i className="shop-gold-dot" />
                  {bundle.price} Gold
                </>
              )}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function BagSlotStore({ fallbackGold }: { fallbackGold: number }) {
  const [slots, setSlots] = useState(10),
    [used, setUsed] = useState(0),
    [gold, setGold] = useState(fallbackGold),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void arena<{ bag_slots: number; used_slots: number; gold: number }>("bag-items")
      .then((data) => {
        setSlots(data.bag_slots);
        setUsed(data.used_slots);
        setGold(data.gold);
      })
      .catch(() => {});
  }, []);
  const buy = async () => {
    if (busy || gold < 48) return;
    if (!window.confirm("Buy 10 additional Bag slots for 48 Gold?")) return;
    setBusy(true);
    try {
      const data = await arena<{ bag_slots: number; gold: number }>(
        "buy-bag-slots",
        { request_id: crypto.randomUUID() },
      );
      setSlots(data.bag_slots);
      setGold(data.gold);
      toast.success("10 new Bag slots unlocked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bag upgrade failed.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="bag-slot-store"><img src="/inventory/chess-burger-bag.webp" alt="Chess Burger Bag"/><div><span>INVENTORY UPGRADE</span><h2>Chess Burger Bag</h2><p>{used} of {slots} slots used · Every player starts with 10 free slots.</p></div><button type="button" disabled={busy||gold<48} onClick={()=>void buy()}>{busy?"Unlocking…":"+10 slots · 48 Gold"}</button></section>;
}

function BannerTile({
  banner,
  expiresAt,
  active,
  busy,
  disableWhenActive = false,
  actionLabel,
  onAction,
}: {
  banner: FeedBanner;
  expiresAt?: string;
  active: boolean;
  busy: boolean;
  disableWhenActive?: boolean;
  actionLabel: ReactNode;
  onAction: () => void;
}) {
  return (
    <article className={`banner-product ${active ? "is-active" : ""}`}>
      <div className="banner-product-preview">
        <span
          className="banner-swatch"
          style={{ background: banner.background }}
          aria-hidden="true"
        />
      </div>
      <div className="banner-product-copy">
        <h3>{banner.name}</h3>
        <span className={`banner-tier-tag ${banner.tier}`}>
          {banner.tier === "metallic" && <Crown size={10} />}{" "}
          {({ pastel: "Pastel", metallic: "Premium", neon: "Neon", cute: "Cute", warrior: "Warrior", animated: "Animated", robot: "Robot" } as const)[banner.tier]}
        </span>
        {expiresAt && (
          <small className="rental-expiry">{rentalLabel(expiresAt)}</small>
        )}
      </div>
      <button
        type="button"
        disabled={busy || (active && disableWhenActive)}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </article>
  );
}

function useShopState() {
  const [state, setState] = useState<ShopState>({
    owned: [],
    active: "",
    gold: 0,
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void arena("shop-banners")
      .then((data) => setState(data as ShopState))
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);
  return { state, setState, loading };
}

export function ShopPage({
  profile,
  onChanged,
}: {
  profile: PlayerProfile | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false),
    [openBoards, setOpenBoards] = useState(false),
    [openFrames, setOpenFrames] = useState(false),
    [busy, setBusy] = useState(""),
    [days, setDays] = useState<FeedBannerDuration>(7);
  const { state, setState, loading } = useShopState();
  if (openBoards) return <BoardThemeStore onBack={() => setOpenBoards(false)} onChanged={onChanged}/>;
  if (openFrames) return <AvatarFrameStore onBack={() => setOpenFrames(false)} onChanged={onChanged} photo={profile?.avatar_url}/>;
  const act = async (banner: FeedBanner) => {
    if (busy) return;
    const rental = rentalFor(state, banner.id);
    const duration = isGraphicBanner(banner) ? "1 month" : days === 7 ? "1 week" : `${days} days`;
    const basePrice = feedBannerRentalPrice(banner.tier, days, banner.price);
    const price = rental && !isGraphicBanner(banner) ? Math.round(basePrice * 0.7) : basePrice;
    if (!window.confirm(`${rental ? "Extend" : "Rent"} ${banner.name} Banner for ${duration} for ${price.toLocaleString()} Gold?`)) return;
    setBusy(banner.id);
    try {
      const data = (await arena("buy-feed-banner", {
        product_id: banner.id,
        days: isGraphicBanner(banner) ? 30 : days,
        request_id: crypto.randomUUID(),
      })) as { active: string; gold: number; expires_at: string };
      setState((current) => ({
        ...current,
        active: data.active,
        gold: data.gold ?? current.gold,
        owned: [
          ...current.owned.filter((item) => item.product_id !== banner.id),
          { product_id: banner.id, expires_at: data.expires_at },
        ],
      }));
      toast.success(
        `${banner.name} rented for ${isGraphicBanner(banner) ? "1 month" : days === 7 ? "1 week" : `${days} days`} and activated.`,
      );
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update banner.",
      );
    } finally {
      setBusy("");
    }
  };
  if (open)
    return (
      <section className="shop-page banner-store">
        <button
          className="back-button"
          type="button"
          onClick={() => setOpen(false)}
        >
          <ArrowLeft size={16} /> Shop
        </button>
        <div className="page-heading banner-heading">
          <div>
            <span className="shop-eyebrow">Personalize your feed</span>
            <h1>Feed Banners</h1>
            <p>Choose a color for every community post you share.</p>
          </div>
          <span className="banner-wallet">
            <img className="gold-coin" src="/inventory/cbg-coin.webp" alt="CBG" />
            <strong>{state.gold || profile?.gold_points || 0}</strong>
            <small>Gold balance</small>
          </span>
        </div>
        <fieldset className="rental-duration">
          <legend>Color banner duration</legend>
          {FEED_BANNER_DURATIONS.map((option) => (
            <button
              type="button"
              className={days === option ? "selected" : ""}
              aria-pressed={days === option}
              key={option}
              onClick={() => setDays(option)}
            >
              <strong>{option === 7 ? "1 Week" : `${option} Days`}</strong>
              <span>
                Choose this duration for pastel, metallic, and neon colors
              </span>
            </button>
          ))}
        </fieldset>
        {loading ? (
          <p className="account-note">Loading banner collection…</p>
        ) : (
          <>
            {(["pastel", "metallic", "neon"] as const).map((tier) => (
              <section className={`banner-tier ${tier}`} key={tier}>
                <div className="banner-tier-heading">
                  <div>
                    <span>
                      {tier === "pastel" ? "Basic collection" : tier === "metallic" ? "Premium collection" : "Neon collection"}
                    </span>
                    <h2>
                      {({ pastel: "Pastel Colors", metallic: "Metallic Colors", neon: "Neon Colors" } as const)[tier]}
                    </h2>
                    <p>
                      {({ pastel: "Soft, clean colors for a friendly feed.", metallic: "Reflective finishes for a distinctive profile.", neon: "Vivid glow on deep colors for a striking feed." } as const)[tier]}
                    </p>
                  </div>
                  <b>{FEED_BANNERS.filter((banner) => banner.tier === tier).length} colors</b>
                </div>
                <div className="banner-products">
                  {FEED_BANNERS.filter((banner) => banner.tier === tier).map(
                    (banner) => {
                      const rental = rentalFor(state, banner.id);
                      return (
                        <BannerTile
                          key={banner.id}
                          banner={banner}
                          expiresAt={rental?.expires_at}
                          active={state.active === banner.id}
                          busy={busy === banner.id}
                          actionLabel={
                            <>
                              <img className="gold-coin" src="/inventory/cbg-coin.webp" alt="" />
                              {rental ? "Extend" : "Rent"}{" "}
                              {isGraphicBanner(banner) ? "1 month" : days === 7 ? "1 week" : `${days} days`} ·{" "}
                              {rental ? Math.round(feedBannerRentalPrice(banner.tier, days, banner.price) * 0.7) : feedBannerRentalPrice(banner.tier, days, banner.price)} Gold
                            </>
                          }
                          onAction={() => void act(banner)}
                        />
                      );
                    },
                  )}
                </div>
              </section>
            ))}
          </>
        )}
      </section>
    );
  return (
    <section className="shop-page shop-home">
      <div className="page-heading shop-main-heading">
        <div>
          <span className="shop-eyebrow">CHESS BURGER MARKET</span>
          <h1>Shop</h1>
          <p>Upgrade your look and unlock competitive experiences.</p>
        </div>
        <span className="banner-wallet">
          <img className="gold-coin" src="/inventory/cbg-coin.webp" alt="CBG" />
          <strong>{state.gold || profile?.gold_points || 0}</strong>
          <small>Gold balance</small>
        </span>
      </div>
    <ArenaTicketStore
          fallbackGold={state.gold || profile?.gold_points || 0}
        />
        <ClassroomCreditStore />
        <BagSlotStore fallbackGold={state.gold || profile?.gold_points || 0}/>
      <div className="shop-grid">
        <article className="shop-category-ready"><span className="shop-icon">♞</span><div><h2>Avatar frames</h2><p>20 chess designs to rent, equip, or gift from your Bag.</p></div><button type="button" onClick={() => setOpenFrames(true)}>View frames</button></article>
        {[["♟", "Gold rewards", "Reward items for your collection."]].map(([icon, name, desc]) => (
          <article key={name}>
            <span className="shop-icon">{icon}</span>
            <div>
              <h2>{name}</h2>
              <p>{desc}</p>
            </div>
            <span className="shop-status">Coming soon</span>
          </article>
        ))}
        <article className="shop-category-ready">
          <span className="shop-icon" aria-hidden="true">♛</span>
          <div><h2>Board Themes & Pieces</h2><p>Explore rentable boards, including the Cody Ramey pixel chess set. Jungle, Bubble Gum, Classic Green, and Warm Wood are free defaults.</p></div>
          <button type="button" onClick={() => setOpenBoards(true)}>View boards</button>
        </article>
        <article className="shop-category-ready">
          <span className="shop-icon banner-category-icon">
            <span className="category-color-circle" aria-hidden="true" />
          </span>
          <div>
            <h2>Feed Banners</h2>
            <p>Pastel, metallic, and neon colors for your community posts.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)}>
            View colors
          </button>
        </article>
      </div>
    </section>
  );
}

export function BagPage({ onChanged }: { onChanged: () => void }) {
  type BagState = {
    banners: BannerRental[];
    tickets: number;
    items: Array<{
      item_kind: string;
      item_id: string;
      quantity: number;
      metadata?: { name?: string; frame_id?: string; expires_at?: string };
    }>;
    active: string;
    active_frame_item?: string | null;
    gold: number;
    bag_slots: number;
    used_slots: number;
  };
  const [state, setState] = useState<BagState>({
      banners: [],
      tickets: 0,
      items: [],
      active: "",
      gold: 0,
      bag_slots: 10,
      used_slots: 0,
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [giftItem, setGiftItem] = useState<{
      kind: string;
      id: string;
      name: string;
      max: number;
    } | null>(null),
    [username, setUsername] = useState(""),
    [recipients, setRecipients] = useState<{ user_id: string; username: string; display_name: string | null; avatar_url: string | null }[]>([]),
    [chosenRecipient, setChosenRecipient] = useState<string | null>(null),
    [searchingRecipient, setSearchingRecipient] = useState(false),
    [recipientSearchError, setRecipientSearchError] = useState(false),
    [quantity, setQuantity] = useState(1),[cbc,setCbc]=useState(0),[cbcError,setCbcError]=useState(false);
  useEffect(() => {
    const query = username.trim().replace(/^@/, "");
    if (!giftItem || chosenRecipient || !/^[a-z0-9_]{2,40}$/i.test(query)) {
      setRecipients([]);
      setSearchingRecipient(false);
      setRecipientSearchError(false);
      return;
    }
    let cancelled = false;
    setSearchingRecipient(true);
    setRecipientSearchError(false);
    const timer = window.setTimeout(() => {
      void arena<{ players: { user_id: string; username: string; display_name: string | null; avatar_url: string | null }[] }>("gift-recipient-search", { query })
        .then(result => { if (!cancelled) setRecipients(result.players); })
        .catch(() => { if (!cancelled) { setRecipients([]); setRecipientSearchError(true); } })
        .finally(() => { if (!cancelled) setSearchingRecipient(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [giftItem, username, chosenRecipient]);
  const load = async () => {
    const data = await arena<BagState>("bag-items");
    setState(data);
    try {
      const classData = await classroom<{ wallet: { cbc: number } }>("state");
      setCbc(classData.wallet.cbc);
      setCbcError(false);
    } catch {
      // Classroom availability must not prevent players from opening their Bag.
      setCbcError(true);
    }
  };
  useEffect(() => {
    void load()
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, []);
  const activate = async (id: string) => {
    setBusy(id);
    try {
      const data = (await arena("activate-feed-banner", {
        product_id: id,
      })) as { active: string };
      setState((current) => ({ ...current, active: data.active }));
      toast.success(`${feedBanner(id)?.name ?? "Banner"} activated.`);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to activate item.",
      );
    } finally {
      setBusy("");
    }
  };
  const equipFrame = async (itemId: string | null) => {
    setBusy(itemId ?? "remove-frame");
    try {
      await arena("equip-avatar-frame", { item_id: itemId });
      setState(current => ({ ...current, active_frame_item: itemId }));
      onChanged();
      toast.success(itemId ? "Avatar frame equipped." : "Avatar frame removed.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to change avatar frame."); }
    finally { setBusy(""); }
  };
  const openGift = (kind: string, id: string, name: string, max = 1) => {
    setGiftItem({ kind, id, name, max });
    setUsername("");
    setChosenRecipient(null);
    setRecipients([]);
    setQuantity(1);
  };
  const sendGift = async () => {
    if (!giftItem || busy || !chosenRecipient || username !== chosenRecipient) return;
    setBusy(`gift:${giftItem.kind}:${giftItem.id}`);
    try {
      const result = giftItem.kind === "gold"
        ? await arena<{gifted: boolean}>("gift-gold", {username,amount:quantity,request_id:crypto.randomUUID()})
        : giftItem.kind === "cbc"
          ? await classroom<{cbc: number}>("gift-cbc", {username,quantity,request_id:crypto.randomUUID()})
          : await arena<{gifted: boolean}>("gift-bag-item", {username,item_kind:giftItem.kind,item_id:giftItem.id,quantity,request_id:crypto.randomUUID()});
      if ("gifted" in result && !result.gifted) {
        toast.info("This gift was already sent. No items or CBG were charged again.");
      } else {
        toast.success(giftItem.kind === "gold"
          ? `${quantity} CBG moved to ${username}.`
          : `${quantity} ${giftItem.name} moved to ${username}. 4 CBG gift fee charged.`);
      }
      setGiftItem(null);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send gift.",
      );
    } finally {
      try { await load(); } catch { toast.error("Gift status changed, but Bag could not refresh. Reopen Bag to see the latest balance."); }
      setBusy("");
    }
  };
  return (
    <section className="bag-page rpg-bag">
      <div className="page-heading rpg-bag-heading">
        <div>
          <small>PLAYER INVENTORY</small>
          <h1>My Bag</h1>
          <p>
            Equip collectibles or gift any item to another player for 4 Gold.
          </p>
        </div>
        <div className="rpg-bag-wallet">
          <span>
            <img className="cbg-wallet-icon" src="/inventory/cbg-coin.webp" alt="CBG" /> {state.gold} Gold
          </span>
          <span className="bag-count">
            <ShoppingBag size={15} />
            {state.used_slots}/{state.bag_slots} slots
          </span>
        </div>
      </div>
      {cbcError && <p role="alert" className="account-note">Classroom credits are temporarily unavailable. Other Bag items can still be gifted.</p>}
      {loading ? (
        <p className="account-note">Opening your bag…</p>
      ) : (
        <div className="bag-tiles unified-bag-grid">
          <article className="bag-inventory-card gold legendary"><div className="rpg-item-art rpg-gold-art"><img src="/inventory/cbg-coin.webp" alt="ChessBurger CBG coin"/><strong>{state.gold}</strong></div><div className="rpg-item-copy"><small>PLAYER CURRENCY</small><h3>Gold Coins</h3><span>Gift Gold directly to another player.</span></div><div className="rpg-item-actions"><button type="button" disabled={state.gold<1} onClick={()=>openGift("gold","gold-coins","Gold Coins",state.gold)}><Gift size={14}/>Gift Gold</button></div></article>
          {cbc>0&&<article className="bag-inventory-card generic legendary"><div className="rpg-item-art"><img src="/classroom/cbc-token.webp" alt="CBC token"/><strong>×{cbc}</strong></div><div className="rpg-item-copy"><small>CLASSROOM CURRENCY</small><h3>Classroom Credits</h3><span>Gift any CBC amount to students by username.</span></div><div className="rpg-item-actions"><button type="button" onClick={()=>openGift("cbc","classroom-credit","CBC",cbc)}><Gift size={14}/>Gift CBC</button></div></article>}
          {state.tickets > 0 && (
            <article className="bag-inventory-card ticket legendary">
              <div className="rpg-item-art">
                <img src="/grand-arena/arena-ticket.webp" alt="Arena Ticket" />
                <strong>×{state.tickets}</strong>
              </div>
              <div className="rpg-item-copy">
                <small>LEGENDARY · ARENA</small>
                <h3>Arena Ticket</h3>
                <span>Grand Arena admission</span>
              </div>
              <div className="rpg-item-actions">
                <button
                  type="button"
                  onClick={() =>
                    openGift(
                      "arena_ticket",
                      "arena-ticket",
                      "Arena Ticket",
                      state.tickets,
                    )
                  }
                >
                  <Gift size={14} />
                  Gift
                </button>
              </div>
            </article>
          )}
          {state.banners.map((rental) => {
            const banner = feedBanner(rental.product_id);
            if (!banner) return null;
            const active = state.active === rental.product_id;
            return (
              <article
                className={`bag-inventory-card banner ${banner.tier} ${active ? "active" : ""}`}
                key={rental.product_id}
              >
                <div className="rpg-item-art">
                  <span
                    className="banner-swatch"
                    style={{ background: banner.background }}
                  />
                  {active && (
                    <b>
                      <Check size={11} /> EQUIPPED
                    </b>
                  )}
                </div>
                <div className="rpg-item-copy">
                  <small>{banner.tier} banner</small>
                  <h3>{banner.name}</h3>
                  <span>{rentalLabel(rental.expires_at)}</span>
                </div>
                <div className="rpg-item-actions">
                  <button
                    type="button"
                    disabled={busy === rental.product_id || active}
                    onClick={() => void activate(rental.product_id)}
                  >
                    {active ? "Active" : "Use"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openGift(
                        "feed_banner",
                        rental.product_id,
                        `${banner.name} Banner`,
                      )
                    }
                  >
                    <Gift size={14} />
                    Gift
                  </button>
                </div>
              </article>
            );
          })}
          {state.items.map((item) => item.item_kind === "avatar_frame" && avatarFrame(item.metadata?.frame_id) ? (
            <article className={`bag-inventory-card generic rare ${state.active_frame_item === item.item_id ? "active" : ""}`} key={item.item_id}>
              <div className="rpg-item-art"><AvatarFrameArt frameId={item.metadata!.frame_id!}/>{state.active_frame_item === item.item_id && <strong>Equipped</strong>}</div>
              <div className="rpg-item-copy"><small>{avatarFrame(item.metadata?.frame_id)?.tier} avatar frame</small><h3>{item.metadata?.name}</h3><span>{item.metadata?.expires_at ? rentalLabel(item.metadata.expires_at) : "Rental"}</span></div>
              <div className="rpg-item-actions"><button type="button" disabled={!!busy} onClick={() => void equipFrame(state.active_frame_item === item.item_id ? null : item.item_id)}>{state.active_frame_item === item.item_id ? "Remove" : "Use"}</button><button type="button" disabled={!!busy} onClick={() => openGift("avatar_frame", item.item_id, item.metadata?.name ?? "Avatar Frame")}><Gift size={14}/>Gift</button></div>
            </article>
          ) : (
            <article
              className="bag-inventory-card generic rare"
              key={`${item.item_kind}:${item.item_id}`}
            >
              <div className="rpg-item-art">
                <PackageOpen />
                <strong>×{item.quantity}</strong>
              </div>
              <div className="rpg-item-copy">
                <small>{item.item_kind.replaceAll("_", " ")}</small>
                <h3>
                  {item.metadata?.name ?? item.item_id.replaceAll("-", " ")}
                </h3>
                <span>Collectible item</span>
              </div>
              <div className="rpg-item-actions">
                <button
                  type="button"
                  onClick={() =>
                    openGift(
                      item.item_kind,
                      item.item_id,
                      item.metadata?.name ?? item.item_id,
                      item.quantity,
                    )
                  }
                >
                  <Gift size={14} />
                  Gift
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {giftItem && (
        <div
          className="bag-gift-backdrop"
          role="presentation"
          onClick={() => setGiftItem(null)}
        >
          <form
            className="bag-gift-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bag-gift-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void sendGift();
            }}
          >
            <Gift />
            <div>
                  <small>{giftItem.kind==="gold"?"DIRECT GOLD TRANSFER":"4 GOLD GIFT FEE"}</small>
              <h2 id="bag-gift-title">Gift {giftItem.name}</h2>
            </div>
            <label>
              Recipient username
              <input
                autoFocus
                required
                value={username}
                onChange={(event) => { setUsername(event.target.value); setChosenRecipient(null); setRecipients([]); }}
                placeholder="@username"
                maxLength={41}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={!chosenRecipient && recipients.length > 0}
                aria-controls="bag-gift-recipients"
              />
            </label>
            {!chosenRecipient && recipients.length > 0 && <div className="bag-gift-recipients" id="bag-gift-recipients" role="listbox" aria-label="Matching players">
              {recipients.map(player => <button key={player.user_id} type="button" role="option" aria-selected="false" onClick={() => { setUsername(player.username); setChosenRecipient(player.username); setRecipients([]); }}>
                {player.avatar_url ? <img src={player.avatar_url} alt="" /> : <span className="bag-gift-avatar">{player.username.charAt(0).toUpperCase()}</span>}
                <span><strong>@{player.username}</strong>{player.display_name && <small>{player.display_name}</small>}</span>
              </button>)}
            </div>}
            {!chosenRecipient && <small className="bag-gift-search-note" aria-live="polite">{searchingRecipient ? "Searching players…" : recipientSearchError ? "Search unavailable. Try again." : username.trim().replace(/^@/, "").length < 2 ? "Type at least 2 characters to find a player." : recipients.length ? "Select the correct player to send your gift." : "No matching players yet. Check the spelling."}</small>}
            {chosenRecipient && <small className="bag-gift-search-note">Gift recipient: @{chosenRecipient}</small>}
              {giftItem.max > 1 && (
                <label>
                  {giftItem.kind==="gold"?"Gold amount":"Quantity"}
                <input
                  required
                  type="number"
                  min={1}
                  max={giftItem.max}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      Math.max(
                        1,
                        Math.min(giftItem.max, Number(event.target.value)),
                      ),
                    )
                  }
                />
              </label>
            )}
              <p>{giftItem.kind==="gold"
                ? "This CBG amount leaves your balance and goes to the recipient’s CBG balance. No gift fee."
                : giftItem.kind==="cbc"
                  ? "These CBC leave your balance and go to the recipient’s CBC balance. A 4 CBG fee is charged."
                  : "This item leaves your Bag and appears in the recipient’s Bag. A 4 CBG fee is charged."}</p>
            <div>
              <button type="button" onClick={() => setGiftItem(null)}>
                Cancel
              </button>
              <button
                className="gold-button"
                disabled={!!busy || !chosenRecipient || username !== chosenRecipient}
              >
                Send gift
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
