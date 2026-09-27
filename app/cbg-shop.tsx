'use client';
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {cbgPurchases,packagePrice,type CbgOrder,type CbgPackage} from './cbg-purchases-client';
import './cbg-shop.css';

const pesos=(amount:number)=>`₱${Number(amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const statusLabels={awaiting_payment:'Awaiting payment',pending:'Under review',approved:'Approved',rejected:'Not verified'} as const;

export default function CbgShop(){
 const [packs,setPacks]=useState<CbgPackage[]>([]),[orders,setOrders]=useState<CbgOrder[]>([]),[chosen,setChosen]=useState<CbgOrder|null>(null),[reference,setReference]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{try{const result=await cbgPurchases<{packages:CbgPackage[];orders:CbgOrder[]}>('catalog');setPacks(result.packages);setOrders(result.orders);setError('');}catch(e){setError((e as Error).message)}};
 useEffect(()=>{void load()},[]);
 const choose=async(pack:CbgPackage)=>{setBusy(true);try{const result=await cbgPurchases<{order:CbgOrder}>('reserve',{id:crypto.randomUUID(),slot:pack.slot});setChosen(result.order);setReference('');await load()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}};
 const pay=async()=>{if(!chosen||!/^[0-9]{6}$/.test(reference))return;setBusy(true);try{await cbgPurchases('submit',{id:chosen.id,reference_last6:reference});setChosen(null);setReference('');await load();toast.success('Payment reference submitted for owner verification.')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}};
 const cancel=async(order:CbgOrder)=>{if(!window.confirm('Cancel this unpaid CBG order? Only cancel if you have not sent payment.'))return;setBusy(true);try{await cbgPurchases('cancel',{id:order.id});if(chosen?.id===order.id)setChosen(null);await load();toast.success('Unpaid order cancelled.')}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}};
 const visibleOrders=orders.filter(order=>order.status!=='awaiting_payment'||new Date(order.expires_at||'').getTime()>Date.now());
 return <section className="cbg-store" aria-label="Purchase CBG">
  <header className="cbg-store-heading"><div className="cbg-store-art"><img src="/inventory/cbg-coin.webp" alt=""/></div><div><small>CHESS BURGER GOLD</small><h2>Purchase CBG</h2><p>Choose a pack, pay by QRPh, then send your payment reference for verification.</p></div></header>
  {error&&<p className="cbg-store-error" role="alert">{error}</p>}
  {!error&&!packs.length&&<p>CBG packages will appear when the owner publishes them.</p>}
  <div className="cbg-pack-grid" aria-label="CBG price lists">{packs.map(pack=><button type="button" key={pack.slot} disabled={busy} onClick={()=>void choose(pack)} className={chosen?.id&&chosen.cbg_amount===pack.cbg_amount?'selected':''}>
   <span className="cbg-pack-label">CBG PACK</span><strong>{pack.cbg_amount.toLocaleString()} <em>CBG</em></strong><span className="cbg-pack-price"><small>PAY EXACTLY</small><b>{pesos(packagePrice(pack))}</b></span>
   <span className="cbg-pack-foot">{pack.applied_promo_percent?<><span className="cbg-promo-badge">{pack.applied_promo_percent}% OFF</span><s>{pesos(pack.price_php)}</s></>:<span>{pack.promo_percent>0?'Regular price · promo not active':'Regular price'}</span>}<span className="cbg-pack-arrow" aria-hidden="true">↗</span></span>
  </button>)}</div>
  {chosen&&<div className="cbg-checkout"><small>QRPH CHECKOUT</small><h3>Send exactly {pesos(chosen.amount_php)}</h3><strong>Receive {chosen.cbg_amount.toLocaleString()} CBG{chosen.promo_percent>0?` · ${chosen.promo_percent}% promo applied`:''}</strong><small>Reserved price until {new Date(chosen.expires_at||'').toLocaleString()}</small><p>Enter this exact amount in your payment app. The QR code may not fill it automatically.</p><img src="/shop/chess-burger-qrph.png" alt="Chess Burger QRPh payment code"/><label>Last 6 digits of your payment reference<input inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" placeholder="000000" value={reference} onChange={e=>setReference(e.target.value.replace(/\D/g,'').slice(0,6))}/></label><button type="button" disabled={busy||reference.length!==6} onClick={()=>void pay()}>{busy?'Submitting…':'I paid · Send for verification'}</button><p role="status">Owner approval usually takes 5 minutes to 3 hours. Keep your payment receipt.</p><div className="cbg-checkout-actions"><button type="button" className="cbg-cancel" onClick={()=>setChosen(null)}>Close checkout</button><button type="button" className="cbg-cancel" disabled={busy} onClick={()=>void cancel(chosen)}>Cancel unpaid order</button></div></div>}
  {!!visibleOrders.length&&<div className="cbg-orders"><div className="cbg-orders-heading"><div><small>PURCHASE HISTORY</small><h3>Your CBG orders</h3></div><button type="button" onClick={()=>void load()}>Refresh status</button></div><div className="cbg-orders-list">{visibleOrders.map(order=><article key={order.id}>
   <div className="cbg-order-main"><div className="cbg-order-amount"><b>{order.cbg_amount.toLocaleString()} CBG</b><small>{pesos(order.amount_php)}</small></div><div className="cbg-order-detail"><span className={`cbg-status cbg-status-${order.status}`}>{statusLabels[order.status]}</span><span>{order.reference_last6?`Reference ending ${order.reference_last6}`:'Payment reference not submitted'}</span></div></div>
   {order.status==='awaiting_payment'&&<div className="cbg-order-actions"><button type="button" disabled={busy} onClick={()=>setChosen(order)}>Continue payment</button><button type="button" className="cbg-order-cancel" disabled={busy} onClick={()=>void cancel(order)}>Cancel order</button></div>}{order.reject_reason&&<small className="cbg-order-reason">{order.reject_reason}</small>}
  </article>)}</div></div>}
 </section>;
}
