'use client';
import {useEffect,useState} from 'react';
import {HeartHandshake} from 'lucide-react';
import {toast} from 'sonner';
import {donations,type Donation} from './donations-client';
import './donate-shop.css';

const pesos=(amount:number)=>`₱${Number(amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const preset=[8,88,888,8888];
const labels={awaiting_payment:'Awaiting payment',pending:'Under review',approved:'Thank you for your support',rejected:'Not verified'} as const;

export default function DonateShop(){
  const [orders,setOrders]=useState<Donation[]>([]),[chosen,setChosen]=useState<Donation|null>(null),[amount,setAmount]=useState(''),[reference,setReference]=useState(''),[premium,setPremium]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [agreementAmount,setAgreementAmount]=useState<number|null>(null),[agreementChecked,setAgreementChecked]=useState(false);
  const load=async()=>{try{const result=await donations<{orders:Donation[];premium:boolean}>('catalog');setOrders(result.orders.filter(order=>order.status!=='awaiting_payment'||Date.parse(order.expires_at||'')>Date.now()));setPremium(result.premium);setError('')}catch(e){setError((e as Error).message)}};
  useEffect(()=>{let active=true;void donations<{orders:Donation[];premium:boolean}>('catalog').then(result=>{if(active){setOrders(result.orders.filter(order=>order.status!=='awaiting_payment'||Date.parse(order.expires_at||'')>Date.now()));setPremium(result.premium);setError('')}}).catch(error=>{if(active)setError((error as Error).message)});return()=>{active=false}},[]);
  const choose=(value:number)=>{
    if(!Number.isFinite(value)||value<1||value>1000000||Math.round(value*100)/100!==value)return toast.error('Choose an amount from ₱1.00 to ₱1,000,000.00 with at most two decimal places.');
    setAgreementChecked(false);setAgreementAmount(value);
  };
  const confirmDonation=async()=>{
    if(agreementAmount===null||!agreementChecked)return;
    setBusy(true);
    try{const result=await donations<{donation:Donation}>('reserve',{id:crypto.randomUUID(),amount_php:agreementAmount,agreed:true});setChosen(result.donation);setReference('');setAgreementAmount(null);await load();requestAnimationFrame(()=>document.getElementById('donate-checkout')?.scrollIntoView({behavior:'smooth',block:'nearest'}))}
    catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
  };
  const submit=async()=>{
    if(!chosen||!/^[0-9]{6}$/.test(reference))return;
    setBusy(true);
    try{await donations('submit',{id:chosen.id,reference_last6:reference});setChosen(null);setReference('');await load();toast.success('Donation reference sent for owner verification. Thank you for supporting Chess Burger!')}
    catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
  };
  const cancel=async(order:Donation)=>{
    if(!window.confirm('Cancel this unpaid donation checkout? Only cancel if you have not sent payment.'))return;
    setBusy(true);
    try{await donations('cancel',{id:order.id});if(chosen?.id===order.id)setChosen(null);await load();toast.success('Unpaid donation checkout cancelled.')}
    catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
  };
  const visible=orders;
  return <section id="donate-support" className="donate-shop" aria-label="Donate and Support Chess Burger App">
    <header className="donate-shop-heading"><div className="donate-icon"><HeartHandshake size={26}/></div><div><small>GIVE CHESS A HAND</small><h2>Donate and Support Chess Burger App</h2><p>Support current and future development so coaches, students, and chess players have a better place to practise, play, and learn.</p></div></header>
    <div className="donate-offer"><div className="donate-offer-copy"><strong>Choose what you can give.</strong><p>An approved donation over ₱888 unlocks the permanent Premium User banner. Approved donations of ₱888 or less receive an App Donor tag on the feed. Your donation supports the app; it does not purchase CBG.</p></div><div className="premium-banner-preview" role="img" aria-label="Premium User black and gold glowing banner"><span>♛</span><strong>PREMIUM USER</strong><span>✦</span></div></div>
    {premium&&<p className="donate-premium-owned">Your Premium User banner is yours forever. Equip or unequip it in My Bag.</p>}
    {error&&<p className="donate-error" role="alert">{error}</p>}
    <div className="donate-amounts" aria-label="Donation amounts">{preset.map(value=><button key={value} type="button" disabled={busy||!!error} onClick={()=>choose(value)}>{pesos(value)}</button>)}</div>
    <form className="donate-custom" onSubmit={event=>{event.preventDefault();choose(Number(amount))}}><label htmlFor="donate-custom-amount">Or enter another amount in pesos</label><div><span aria-hidden="true">₱</span><input id="donate-custom-amount" type="number" min="1" max="1000000" step="0.01" inputMode="decimal" placeholder="Any amount from 1.00" value={amount} onChange={event=>setAmount(event.target.value)}/><button type="submit" disabled={busy||!!error||!amount}>Continue</button></div></form>
    {agreementAmount!==null&&<div className="donate-agreement-backdrop" onClick={()=>setAgreementAmount(null)}><section role="dialog" aria-modal="true" aria-labelledby="donate-agreement-title" className="donate-agreement" onClick={event=>event.stopPropagation()}><small>BEFORE YOU DONATE</small><h3 id="donate-agreement-title">Donation Agreement</h3><p>Your voluntary donation of <strong>{pesos(agreementAmount)}</strong> is solely for the current and future development of Chess Burger, including technical and administrative support in app development. It is not intended for any other purpose.</p><p>I confirm that I am authorized to make this donation. I understand that it does not purchase Chess Burger Gold (CBG), that payment must be verified by an owner, and that an approved donation over ₱888 awards the permanent Premium User banner. Approved donations of ₱888 or less receive an App Donor tag.</p><label><input type="checkbox" checked={agreementChecked} onChange={event=>setAgreementChecked(event.target.checked)}/><span>I have read and agree to the Donation Agreement.</span></label><div className="donate-agreement-actions"><button type="button" onClick={()=>setAgreementAmount(null)}>Go back</button><button type="button" disabled={!agreementChecked||busy} onClick={()=>void confirmDonation()}>{busy?'Preparing checkout…':`Donate ${pesos(agreementAmount)} · Show QRPh`}</button></div></section></div>}
    {chosen&&<div id="donate-checkout" className="donate-checkout"><small>QRPH DONATION CHECKOUT</small><h3>Send exactly {pesos(chosen.amount_php)}</h3><p>Scan the Chess Burger QRPh in your payment app and enter this amount. The QR may not fill the amount automatically.</p><img src="/shop/chess-burger-qrph.png" alt="Chess Burger QRPh donation payment code"/><label>Last 6 digits of payment reference<input inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" placeholder="000000" value={reference} onChange={event=>setReference(event.target.value.replace(/\D/g,'').slice(0,6))}/></label><button type="button" disabled={busy||reference.length!==6} onClick={()=>void submit()}>{busy?'Submitting…':'I paid · Send for verification'}</button><p role="status">The owner checks the payment manually, usually within 5 minutes to 3 hours. Keep your receipt. After approval, donations over ₱888 unlock Premium User; smaller donations show App Donor on the feed.</p><div className="donate-checkout-actions"><button type="button" onClick={()=>setChosen(null)}>Close</button><button type="button" disabled={busy} onClick={()=>void cancel(chosen)}>Cancel unpaid checkout</button></div></div>}
    {!!visible.length&&<div className="donate-history"><header><div><small>YOUR SUPPORT</small><h3>Donation status</h3></div><button type="button" onClick={()=>void load()}>Refresh</button></header>{visible.map(order=><article key={order.id}><div><strong>{pesos(order.amount_php)}</strong><span className={`donate-status donate-status-${order.status}`}>{labels[order.status]}</span><small>{order.reference_last6?`Reference ending ${order.reference_last6}`:'Payment reference not submitted'} · {new Date(order.created_at).toLocaleDateString()}</small>{order.reject_reason&&<small>{order.reject_reason}</small>}</div>{order.status==='awaiting_payment'&&<div className="donate-history-actions"><button type="button" disabled={busy} onClick={()=>{setChosen(order);setReference('')}}>Continue payment</button><button type="button" disabled={busy} onClick={()=>void cancel(order)}>Cancel</button></div>}</article>)}</div>}
  </section>;
}
