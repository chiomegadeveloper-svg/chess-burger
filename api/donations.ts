import {createClient} from '@supabase/supabase-js';

type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void;setHeader:(key:string,value:string)=>void};
const fail=(status:number,message:string):never=>{const error=Error(message) as Error&{status:number};error.status=status;throw error;};
const schemaHint='Apply supabase/0079_donations_premium_banner.sql in the Chess Burger Supabase project.';
const tierSchemaHint='Apply supabase/0081_donation_supporter_tiers.sql in the Chess Burger Supabase project before approving donations.';
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

async function emailOwnersAboutDonation(donation:{id:string;amount_php:number;reference_last6:string;created_at:string},donor:{username?:string|null;display_name?:string|null}){
  const apiKey=process.env.RESEND_API_KEY,from=process.env.CBG_ALERT_FROM_EMAIL;
  if(!apiKey||!from)return;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`cb-donation-${donation.id}-pending`},
    body:JSON.stringify({from,to:['alota.bobbie.2026@gmail.com','chiomegadeveloper@gmail.com'],subject:'DONATION @ Chess Burger App - URGENT',text:[
      'A supporter submitted a donation for verification.','',
      `Supporter: ${donor.display_name||'Chess Burger player'}${donor.username?` (@${donor.username})`:''}`,
      `Amount to verify: PHP ${Number(donation.amount_php).toFixed(2)}`,
      `Payment reference ending: ${donation.reference_last6}`,
      `Donation ID: ${donation.id}`,
      `Submitted: ${donation.created_at}`,'',
      'Open Chess Burger > Owner CMS > CBG Editor > Pending donations.',
      'Check the complete transaction in your QRPh/GCash account before approving. Six digits alone do not prove payment.',
    ].join('\n')}),signal:AbortSignal.timeout(6000),
  });
  if(!response.ok)throw Error(`Donation alert rejected (${response.status}).`);
}

export default async function handler(req:Req,res:Res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method!=='POST')fail(405,'Method not allowed.');
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)fail(503,'Donation server is not configured.');
    const db=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
    const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||'').replace(/^Bearer\s+/i,'');
    if(!token)fail(401,'Please sign in to support Chess Burger.');
    const auth=await db.auth.getUser(token);
    if(auth.error||!auth.data.user)fail(401,'Please sign in again.');
    const userId=auth.data.user!.id,body=req.body||{},action=String(body.action||'');
    const profile=await db.from('cb_profiles').select('role,avatar_url,agreement_version,username,display_name,active_feed_banner').eq('user_id',userId).single();
    if(profile.error)fail(403,'Complete your profile before donating.');
    if(profile.data!.agreement_version===null)fail(403,'Accept the End User Agreement first.');
    if(!String(profile.data!.avatar_url||'').includes(`/storage/v1/object/public/cb-profile-media/${userId}/avatar-`))fail(403,'Save a profile picture first.');
    const owner=profile.data!.role==='owner';

    if(action==='catalog'){
      const [orders,entitlement,tiers]=await Promise.all([
        db.from('cb_donations').select('id,amount_php,reference_last6,status,created_at,expires_at,reviewed_at,reject_reason').eq('donor_id',userId).order('created_at',{ascending:false}).limit(20),
        db.from('cb_user_items').select('product_id').eq('user_id',userId).eq('product_id','premium-supporter').gt('expires_at',new Date().toISOString()).maybeSingle(),
        db.rpc('cb_supporter_tiers',{p_user_ids:[userId]}),
      ]);
      if(orders.error||entitlement.error)fail(503,schemaHint);
      const premium=!tiers.error&&tiers.data?.some((row:{user_id:string;tier:string})=>row.user_id===userId&&row.tier==='premium')&&!!entitlement.data;
      return res.status(200).json({orders:orders.data||[],premium,active:premium&&profile.data!.active_feed_banner==='premium-supporter',qr_url:'/shop/chess-burger-qrph.png'});
    }
    if(action==='reserve'){
      const id=String(body.id||''),rawAmount=String(body.amount_php??'');
      if(body.agreed!==true)fail(400,'Read and accept the donation agreement before continuing.');
      if(!uuid.test(id)||!/^\d+(\.\d{1,2})?$/.test(rawAmount)||Number(rawAmount)<1||Number(rawAmount)>1000000)fail(400,'Enter an amount from ₱1.00 to ₱1,000,000.00.');
      const reserved=await db.rpc('cb_reserve_donation',{p_id:id,p_donor_id:userId,p_amount_php:Number(rawAmount),p_agreed:true});
      if(reserved.error)fail(/schema cache|function|relation/i.test(reserved.error.message)?503:400,/schema cache|function|relation/i.test(reserved.error.message)?schemaHint:reserved.error.message);
      return res.status(200).json({donation:reserved.data});
    }
    if(action==='submit'){
      const id=String(body.id||''),reference=String(body.reference_last6||'').trim();
      if(!uuid.test(id)||!/^[0-9]{6}$/.test(reference))fail(400,'Enter the last 6 digits of your payment reference.');
      const submitted=await db.rpc('cb_submit_donation',{p_id:id,p_donor_id:userId,p_reference:reference});
      if(submitted.error)fail(/schema cache|function|relation/i.test(submitted.error.message)?503:409,/schema cache|function|relation/i.test(submitted.error.message)?schemaHint:submitted.error.message);
      try{await emailOwnersAboutDonation(submitted.data,profile.data!);}
      catch(error){console.error('donations.owner-alert.failed',{donationId:id,message:error instanceof Error?error.message:String(error)});}
      return res.status(200).json({donation:submitted.data});
    }
    if(action==='cancel'){
      const id=String(body.id||'');if(!uuid.test(id))fail(400,'Choose an unpaid donation checkout to cancel.');
      const cancelled=await db.from('cb_donations').delete().eq('id',id).eq('donor_id',userId).eq('status','awaiting_payment').select('id').maybeSingle();
      if(cancelled.error)fail(503,schemaHint);
      if(!cancelled.data)fail(409,'This donation was submitted or already cancelled. Refresh its status.');
      return res.status(200).json({cancelled:true});
    }
    if(action==='equip'){
      if(typeof body.equipped!=='boolean')fail(400,'Choose whether to equip the banner.');
      if(body.equipped){
        const tiers=await db.rpc('cb_supporter_tiers',{p_user_ids:[userId]});
        if(tiers.error)fail(503,tierSchemaHint);
        if(!tiers.data?.some((row:{user_id:string;tier:string})=>row.user_id===userId&&row.tier==='premium'))fail(403,'Premium requires an approved donation over ₱888 or an owner entitlement.');
        const owned=await db.from('cb_user_items').select('product_id').eq('user_id',userId).eq('product_id','premium-supporter').gt('expires_at',new Date().toISOString()).maybeSingle();
        if(owned.error)fail(503,schemaHint);
        if(!owned.data)fail(403,'The Premium User banner is available after a verified donation over ₱888 or to owners.');
      }
      let query=db.from('cb_profiles').update({active_feed_banner:body.equipped?'premium-supporter':null}).eq('user_id',userId);
      if(!body.equipped)query=query.eq('active_feed_banner','premium-supporter');
      const updated=await query.select('active_feed_banner').maybeSingle();
      if(updated.error)fail(503,schemaHint);
      if(!updated.data)fail(409,'Your active banner changed. Refresh your Bag.');
      return res.status(200).json({active:updated.data!.active_feed_banner||''});
    }
    if(!owner)fail(403,'Owner access required.');
    if(action==='pending'){
      const rows=await db.from('cb_donations').select('id,donor_id,amount_php,reference_last6,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(100);
      if(rows.error)fail(503,schemaHint);
      const ids=[...new Set((rows.data||[]).map(row=>row.donor_id))];
      const people=ids.length?await db.from('cb_profiles').select('user_id,username,display_name').in('user_id',ids):{data:[],error:null};
      if(people.error)fail(500,people.error.message);
      const names=new Map((people.data||[]).map(person=>[person.user_id,person]));
      return res.status(200).json({donations:(rows.data||[]).map(row=>({...row,donor:names.get(row.donor_id)||null}))});
    }
    if(action==='history'){
      const page=Math.max(1,Math.min(100000,Number.parseInt(String(body.page||1),10)||1));
      const rows=await db.from('cb_donations').select('id,donor_id,amount_php,reference_last6,status,created_at,reviewed_at',{count:'exact'}).in('status',['approved','rejected']).order('reviewed_at',{ascending:false}).range((page-1)*10,page*10-1);
      if(rows.error)fail(503,schemaHint);
      const ids=[...new Set((rows.data||[]).map(row=>row.donor_id))];
      const people=ids.length?await db.from('cb_profiles').select('user_id,username,display_name').in('user_id',ids):{data:[],error:null};
      if(people.error)fail(500,people.error.message);
      const names=new Map((people.data||[]).map(person=>[person.user_id,person]));
      return res.status(200).json({donations:(rows.data||[]).map(row=>({...row,donor:names.get(row.donor_id)||null})),count:rows.count||0,page});
    }
    if(action==='review'){
      const id=String(body.id||'');if(!uuid.test(id)||typeof body.approve!=='boolean')fail(400,'Choose a pending donation.');
      if(body.approve){
        const ready=await db.rpc('cb_supporter_tiers',{p_user_ids:[]});
        if(ready.error)fail(503,tierSchemaHint);
      }
      const reviewed=await db.rpc('cb_review_donation',{p_owner_id:userId,p_donation_id:id,p_approve:body.approve,p_reason:String(body.reason||'')});
      if(reviewed.error)fail(/schema cache|function|relation/i.test(reviewed.error.message)?503:409,/schema cache|function|relation/i.test(reviewed.error.message)?schemaHint:reviewed.error.message);
      return res.status(200).json({donation:reviewed.data});
    }
    fail(404,'Unknown donation action.');
  }catch(error){const e=error as Error&{status?:number};res.status(e.status||500).json({error:e.status?e.message:'Donation request failed.'});}
}
