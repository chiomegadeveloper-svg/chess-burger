import {env} from 'cloudflare:workers';
export async function GET(){
 const settings=env as unknown as Record<string,string|undefined>;
 const url=settings.NEXT_PUBLIC_SUPABASE_URL??'',key=settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??'';
 const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&key.startsWith('sb_publishable_');
 return Response.json(configured?{configured:true,url,key}:{configured:false},{headers:{'Cache-Control':'no-store'}});
}
