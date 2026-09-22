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
  type FeedBanner,
  type FeedBannerDuration,
} from "./feed-banner-catalog";
import type { PlayerProfile } from "./supabase";
import { getSupabase } from "./supabase";
import "./feed-banner-shop.css";
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
          {banner.tier === "metallic" ? "Premium" : "Pastel"}
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
    [busy, setBusy] = useState(""),
    [days, setDays] = useState<FeedBannerDuration>(7);
  const { state, setState, loading } = useShopState();
  const act = async (banner: FeedBanner) => {
    setBusy(banner.id);
    try {
      const data = (await arena("buy-feed-banner", {
        product_id: banner.id,
        days,
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
        `${banner.name} rented for ${days === 7 ? "1 week" : `${days} days`} and activated.`,
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
            <h1>Feed Banner Colors</h1>
            <p>Choose a signature color for every community post you share.</p>
          </div>
          <span className="banner-wallet">
            <span className="gold-coin">●</span>
            <strong>{state.gold || profile?.gold_points || 0}</strong>
            <small>Gold balance</small>
          </span>
        </div>
        <fieldset className="rental-duration">
          <legend>Choose rental duration</legend>
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
                Pastel {feedBannerRentalPrice("pastel", option)} · Premium{" "}
                {feedBannerRentalPrice("metallic", option)} Gold
              </span>
            </button>
          ))}
        </fieldset>
        {loading ? (
          <p className="account-note">Loading banner collection…</p>
        ) : (
          <>
            {(["pastel", "metallic"] as const).map((tier) => (
              <section className={`banner-tier ${tier}`} key={tier}>
                <div className="banner-tier-heading">
                  <div>
                    <span>
                      {tier === "pastel"
                        ? "Basic collection"
                        : "Premium collection"}
                    </span>
                    <h2>
                      {tier === "pastel" ? "Pastel Colors" : "Metallic Colors"}
                    </h2>
                    <p>
                      {tier === "pastel"
                        ? "Soft, clean colors for a friendly feed."
                        : "Reflective finishes for a distinctive profile."}
                    </p>
                  </div>
                  <b>10 colors</b>
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
                              <span className="gold-coin">●</span>
                              {rental ? "Extend" : "Rent"}{" "}
                              {days === 7 ? "1 week" : `${days} days`} ·{" "}
                              {feedBannerRentalPrice(banner.tier, days)} Gold
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
          <span className="gold-coin">●</span>
          <strong>{state.gold || profile?.gold_points || 0}</strong>
          <small>Gold balance</small>
        </span>
      </div>
    <ArenaTicketStore
          fallbackGold={state.gold || profile?.gold_points || 0}
        />
        <BagSlotStore fallbackGold={state.gold || profile?.gold_points || 0}/>
      <div className="shop-grid">
        {[
          ["♞", "Avatar frames", "Decorative player-card frames."],
          ["♛", "Board themes", "Metallic boards and pieces."],
          ["♟", "Gold rewards", "Reward items for your collection."],
        ].map(([icon, name, desc]) => (
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
          <span className="shop-icon banner-category-icon">
            <span className="category-color-circle" aria-hidden="true" />
          </span>
          <div>
            <h2>Feed Banners</h2>
            <p>Pastel and metallic colors for your community posts.</p>
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
      metadata?: { name?: string };
    }>;
    active: string;
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
    [quantity, setQuantity] = useState(1);
  const load = async () => {
    const data = await arena<BagState>("bag-items");
    setState(data);
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
  const openGift = (kind: string, id: string, name: string, max = 1) => {
    setGiftItem({ kind, id, name, max });
    setUsername("");
    setQuantity(1);
  };
  const sendGift = async () => {
    if (!giftItem || busy) return;
    setBusy(`gift:${giftItem.kind}:${giftItem.id}`);
    try {
      if(giftItem.kind==="gold") await arena("gift-gold",{username,amount:quantity,request_id:crypto.randomUUID()});
      else await arena("gift-bag-item", {username,item_kind: giftItem.kind,item_id: giftItem.id,quantity,request_id: crypto.randomUUID()});
      toast.success(giftItem.kind==="gold"?`${quantity} Gold sent to ${username}.`:`${giftItem.name} sent to ${username}. 4 Gold charged.`);
      setGiftItem(null);
      await load();
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send gift.",
      );
    } finally {
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
            <i /> {state.gold} Gold
          </span>
          <span className="bag-count">
            <ShoppingBag size={15} />
            {state.used_slots}/{state.bag_slots} slots
          </span>
        </div>
      </div>
      {loading ? (
        <p className="account-note">Opening your bag…</p>
      ) : (
        <div className="bag-tiles unified-bag-grid">
          <article className="bag-inventory-card gold legendary"><div className="rpg-item-art rpg-gold-art"><span>●</span><strong>{state.gold}</strong></div><div className="rpg-item-copy"><small>PLAYER CURRENCY</small><h3>Gold Coins</h3><span>Gift Gold directly to another player.</span></div><div className="rpg-item-actions"><button type="button" disabled={state.gold<1} onClick={()=>openGift("gold","gold-coins","Gold Coins",state.gold)}><Gift size={14}/>Gift Gold</button></div></article>
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
          {state.items.map((item) => (
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
                onChange={(event) => setUsername(event.target.value)}
                placeholder="@username"
              />
            </label>
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
              <p>{giftItem.kind==="gold"?"Gold transfers directly to the recipient. Gold gifts have no transaction fee.":"The item transfers directly to the recipient’s Bag. Your account is charged exactly 4 Gold for this transaction."}</p>
            <div>
              <button type="button" onClick={() => setGiftItem(null)}>
                Cancel
              </button>
              <button
                className="gold-button"
                disabled={!!busy || !username.trim()}
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
