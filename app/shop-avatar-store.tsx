"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,Check} from "lucide-react";
import {toast} from "sonner";
import {arena} from "./arena-client";
import {SHOP_AVATARS} from "./shop-avatar-catalog";
import "./shop-avatar-store.css";

type State={owned:string[];active:string|null;gold:number};
export function ShopAvatarStore({onBack,onChanged}:{onBack:()=>void;onChanged:()=>void}){
  const [state,setState]=useState<State>({owned:[],active:null,gold:0});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const refresh=async()=>setState(await arena<State>("shop-avatar-state"));
  useEffect(()=>{void refresh().catch(cause=>setError(cause instanceof Error?cause.message:"Avatar shop is unavailable.")).finally(()=>setLoading(false))},[]);
  const change=async(id:string|null)=>{
    if(busy)return;
    const avatar=SHOP_AVATARS.find(item=>item.id===id);
    if(avatar&&!state.owned.includes(id!)){
      if(state.gold<avatar.price)return;
      if(!window.confirm(`Buy ${avatar.name} for ${avatar.price} CBG? It is yours forever and will be stored in your Bag.`))return;
    }
    setBusy(true);
    try{
      if(avatar&&!state.owned.includes(id!))await arena("buy-shop-avatar",{avatar_id:id,request_id:crypto.randomUUID()});
      await arena("equip-shop-avatar",{avatar_id:id});
      await refresh();onChanged();toast.success(id?`${avatar?.name} equipped. It is yours forever.`:"Your original profile photo is restored.");
    }catch(cause){toast.error(cause instanceof Error?cause.message:"Could not update avatar.");await refresh().catch(()=>{});}
    finally{setBusy(false)}
  };
  return <section className="shop-avatar-store"><button type="button" className="back-button" onClick={onBack}><ArrowLeft size={16}/>Shop</button><header><div><small>CHESS BURGER COLLECTION</small><h1>Character Avatars</h1><p>40 collectible portraits for every player. Buy once and keep forever. Equip from here or your Bag.</p></div><strong>{state.gold} CBG</strong></header>{error&&<p role="alert">{error}</p>}{loading?<p>Loading avatars…</p>:<><div className="shop-avatar-grid">{SHOP_AVATARS.map(avatar=>{const owned=state.owned.includes(avatar.id),active=state.active===avatar.id;return <article key={avatar.id} className={active?"active":""}><img src={avatar.image} alt={avatar.name} loading="lazy"/><h2>{avatar.name}</h2><small>{owned?active?"Equipped · yours forever":"Owned · yours forever":`${avatar.price} CBG · lifetime`}</small><button type="button" disabled={busy||(!owned&&state.gold<avatar.price)} onClick={()=>void change(active?null:avatar.id)}>{active?"Unequip":owned?"Equip":`Buy · ${avatar.price} CBG`}</button>{active&&<Check className="shop-avatar-check" size={16}/>}</article>})}</div></>}</section>
}
