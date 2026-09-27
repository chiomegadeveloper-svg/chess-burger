import {getSupabase} from './supabase';
export type CbgPackage={slot:number;cbg_amount:number;price_php:number;active:boolean;promo_percent:number;promo_first_n:number;promo_start_at:string|null;checkout_price_php?:number;applied_promo_percent?:number};
export type CbgOrder={id:string;buyer_id?:string;buyer?:{username:string;display_name:string}|null;cbg_amount:number;amount_php:number;promo_percent:number;reference_last6:string;status:'awaiting_payment'|'pending'|'approved'|'rejected';created_at:string;expires_at?:string;reviewed_at?:string|null;reject_reason?:string|null};
export async function cbgPurchases<T>(action:string,body:Record<string,unknown>={}):Promise<T>{
 const client=await getSupabase(),session=client?(await client.auth.getSession()).data.session:null;
 if(!session)throw Error('Sign in to purchase CBG.');
 const response=await fetch('/api/cbg-purchases',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,...body}),cache:'no-store'});
 const data=await response.json() as T&{error?:string};
 if(!response.ok)throw Error(data.error||'CBG purchases are unavailable.');
 return data;
}
export const packagePrice=(pack:CbgPackage)=>Number(pack.checkout_price_php??pack.price_php);
