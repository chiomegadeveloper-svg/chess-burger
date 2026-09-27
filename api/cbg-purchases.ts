import {createClient} from '@supabase/supabase-js';
type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void;setHeader:(key:string,value:string)=>void};
const fail=(status:number,message:string):never=>{const error=Error(message) as Error&{status:number};error.status=status;throw error;};
const schemaHint='Apply supabase/0074_cbg_qrph_purchases.sql before using CBG purchases.';
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export default async function handler(req:Req,res:Res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method!=='POST')fail(405,'Method not allowed.');
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)fail(503,'CBG purchase server is not configured.');
    const db=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
    const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||'').replace(/^Bearer\s+/i,'');
    if(!token)fail(401,'Please sign in.');
    const auth=await db.auth.getUser(token);
    if(auth.error||!auth.data.user)fail(401,'Please sign in again.');
    const userId=auth.data.user!.id,body=req.body||{},action=String(body.action||'');
    const profile=await db.from('cb_profiles').select('role,avatar_url,agreement_version').eq('user_id',userId).single();
    if(profile.error)fail(403,'Complete your profile before purchasing CBG.');
    if(profile.data!.agreement_version===null)fail(403,'Accept the End User Agreement first.');
    if(!String(profile.data!.avatar_url||'').includes(`/storage/v1/object/public/cb-profile-media/${userId}/avatar-`))fail(403,'Save a profile picture first.');
    const owner=profile.data!.role==='owner';
    if(action==='catalog'){
      const [packs,orders]=await Promise.all([
        db.from('cb_cbg_packages').select('*').order('slot'),
        db.from('cb_cbg_orders').select('id,cbg_amount,amount_php,promo_percent,reference_last6,status,created_at,expires_at,reviewed_at,reject_reason').eq('buyer_id',userId).order('created_at',{ascending:false}).limit(20),
      ]);
      if(packs.error||orders.error)fail(503,schemaHint);
      return res.status(200).json({packages:owner?packs.data:packs.data?.filter(p=>p.active),orders:orders.data,qr_url:'/shop/chess-burger-qrph.png'});
    }
    if(action==='reserve'){
      const slot=Number(body.slot),id=String(body.id||'');
      if(!Number.isInteger(slot)||slot<1||slot>10||!uuid.test(id))fail(400,'Choose an available CBG pack.');
      const reserved=await db.rpc('cb_reserve_cbg_order',{p_id:id,p_buyer_id:userId,p_slot:slot});
      if(reserved.error)fail(/schema cache|function|relation/i.test(reserved.error.message)?503:400,/schema cache|function|relation/i.test(reserved.error.message)?schemaHint:reserved.error.message);
      return res.status(200).json({order:reserved.data});
    }
    if(action==='submit'){
      const reference=String(body.reference_last6||'').trim(),id=String(body.id||'');
      if(!uuid.test(id)||!/^[0-9]{6}$/.test(reference))fail(400,'Enter the last 6 digits of your payment reference.');
      const submitted=await db.rpc('cb_submit_cbg_order',{p_id:id,p_buyer_id:userId,p_reference:reference});
      if(submitted.error)fail(/schema cache|function|relation/i.test(submitted.error.message)?503:400,/schema cache|function|relation/i.test(submitted.error.message)?schemaHint:submitted.error.message);
      return res.status(200).json({order:submitted.data});
    }
    if(!owner)fail(403,'Owner access required.');
    if(action==='pending'){
      const rows=await db.from('cb_cbg_orders').select('id,buyer_id,cbg_amount,amount_php,promo_percent,reference_last6,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(100);
      if(rows.error)fail(503,schemaHint);
      const ids=[...new Set((rows.data||[]).map(row=>row.buyer_id))];
      const people=ids.length?await db.from('cb_profiles').select('user_id,username,display_name').in('user_id',ids):{data:[],error:null};
      if(people.error)fail(500,people.error.message);
      const names=new Map((people.data||[]).map(p=>[p.user_id,p]));
      return res.status(200).json({orders:(rows.data||[]).map(row=>({...row,buyer:names.get(row.buyer_id)||null}))});
    }
    if(action==='save-package'){
      const slot=Number(body.slot),amount=Number(body.cbg_amount),price=Number(body.price_php),percent=Number(body.promo_percent||0),first=Number(body.promo_first_n||0),start=body.promo_start_at?new Date(String(body.promo_start_at)):null;
      if(!Number.isInteger(slot)||slot<1||slot>10||!Number.isInteger(amount)||amount<1||amount>1000000||!Number.isFinite(price)||price<=0||price>10000000||Math.abs(Math.round(price*100)-price*100)>0.000001||!Number.isInteger(percent)||percent<0||percent>99||!Number.isInteger(first)||first<0||first>100000||(percent>0&&(!first||!start||!Number.isFinite(start.getTime())||Math.round(price*(100-percent))<1)))fail(400,'Enter a valid CBG amount, peso price, and promotion.');
      const saved=await db.from('cb_cbg_packages').upsert({slot,cbg_amount:amount,price_php:price,active:body.active!==false,promo_percent:percent,promo_first_n:percent?first:0,promo_start_at:percent?start?.toISOString():null,updated_at:new Date().toISOString()}).select('*').single();
      if(saved.error)fail(503,/relation|schema cache/i.test(saved.error.message)?schemaHint:saved.error.message);
      return res.status(200).json({package:saved.data});
    }
    if(action==='review'){
      const id=String(body.id||'');if(!uuid.test(id)||typeof body.approve!=='boolean')fail(400,'Choose a pending order.');
      const reviewed=await db.rpc('cb_review_cbg_order',{p_owner_id:userId,p_order_id:id,p_approve:body.approve,p_reason:String(body.reason||'')});
      if(reviewed.error)fail(/schema cache|function|relation/i.test(reviewed.error.message)?503:409,/schema cache|function|relation/i.test(reviewed.error.message)?schemaHint:reviewed.error.message);
      return res.status(200).json({order:reviewed.data});
    }
    fail(404,'Unknown CBG purchase action.');
  }catch(error){const e=error as Error&{status?:number};res.status(e.status||500).json({error:e.status?e.message:'CBG purchase request failed.'});}
}
