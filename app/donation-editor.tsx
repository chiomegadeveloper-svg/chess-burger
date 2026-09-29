'use client';
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {donations,type Donation} from './donations-client';
import './donation-editor.css';

const pesos=(amount:number)=>`₱${Number(amount).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function DonationEditor(){
  const [pending,setPending]=useState<Donation[]>([]),[history,setHistory]=useState<Donation[]>([]),[count,setCount]=useState(0),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async(nextPage=page)=>{
    try{const [open,recent]=await Promise.all([donations<{donations:Donation[]}>('pending'),donations<{donations:Donation[];count:number}>('history',{page:nextPage})]);setPending(open.donations);setHistory(recent.donations);setCount(recent.count);setError('')}
    catch(e){setError((e as Error).message)}
  };
  useEffect(()=>{let active=true;void Promise.all([donations<{donations:Donation[]}>('pending'),donations<{donations:Donation[];count:number}>('history',{page:1})]).then(([open,recent])=>{if(active){setPending(open.donations);setHistory(recent.donations);setCount(recent.count);setError('')}}).catch(error=>{if(active)setError((error as Error).message)});return()=>{active=false}},[]);
  const review=async(item:Donation,approve:boolean)=>{
    if(!window.confirm(`${approve?'Approve':'Reject'} ${pesos(item.amount_php)} from @${item.donor?.username||'donor'}? Check the full payment in your QRPh account first.`))return;
    let reason='';
    if(!approve){reason=window.prompt('Reason shown to the donor','Payment could not be verified.')||'';if(!reason)return}
    setBusy(true);
    try{await donations('review',{id:item.id,approve,reason});await load(page);toast.success(approve?'Donation approved. Premium User banner granted and equipped.':'Donation rejected.')}
    catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
  };
  return <section className="donation-editor" aria-label="Owner donation verification"><header><div><small>SUPPORTER PAYMENTS</small><h3>Pending donations ({pending.length})</h3></div><button type="button" onClick={()=>void load()}>Refresh</button></header><p>Compare the exact peso amount and full transaction in your QRPh account. Six reference digits alone are not proof of payment.</p>
    {error&&<p className="donation-editor-error" role="alert">{error}</p>}
    {!pending.length&&!error&&<p>No donations awaiting approval.</p>}
    <div className="donation-editor-list">{pending.map(item=><article key={item.id}><div><strong>{item.donor?.display_name||'Player'} · @{item.donor?.username||'unknown'}</strong><span>{pesos(item.amount_php)} · Reference ending {item.reference_last6}</span><small>Submitted {new Date(item.created_at).toLocaleString()}</small></div><button type="button" disabled={busy} onClick={()=>void review(item,true)}>Approve</button><button type="button" disabled={busy} onClick={()=>void review(item,false)}>Reject</button></article>)}</div>
    <div className="donation-editor-history"><header><div><h3>Donation log</h3><p>{count.toLocaleString()} reviewed donations · 10 per page</p></div><button type="button" onClick={()=>void load(page)}>Refresh</button></header>{!history.length&&!error&&<p>No reviewed donations yet.</p>}{history.map(item=><article key={item.id}><strong>{item.donor?.display_name||'Player'} · @{item.donor?.username||'unknown'}</strong><span>{pesos(item.amount_php)} · {item.status==='approved'?'Approved · Premium User granted':'Rejected'}</span><small>Ref ending {item.reference_last6} · {new Date(item.reviewed_at||item.created_at).toLocaleString()}</small></article>)}{count>10&&<nav aria-label="Donation log pages"><button type="button" disabled={page<=1} onClick={()=>{setPage(page-1);void load(page-1)}}>Previous</button><span>Page {page} of {Math.ceil(count/10)}</span><button type="button" disabled={page*10>=count} onClick={()=>{setPage(page+1);void load(page+1)}}>Next</button></nav>}</div>
  </section>;
}
