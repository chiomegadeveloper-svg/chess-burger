import {createClient,type SupabaseClient,type User} from '@supabase/supabase-js';
import type {PlayerProfile} from './supabase';

type Settings=Record<string,string|undefined>;
type ProfileRow=Omit<PlayerProfile,'featured_photos'|'featured_badges'|'created_at'|'role'>&{featured_photos:string;featured_badges:string;created_at:number;role:string};
const stmt=(db:D1Database,sql:string,...values:unknown[])=>db.prepare(sql).bind(...values);
const profileSelect=`SELECT p.*,COALESCE(a.cbr,88) AS cbr,COALESCE(a.ocbr,88) AS ocbr,COALESCE(a.gold_points,0) AS gold_points,COALESCE(a.win_streak,0) AS win_streak,COALESCE(a.wins,0) AS wins,COALESCE(a.losses,0) AS losses FROM app_profiles p LEFT JOIN arena_players a ON a.user_id=p.user_id`;
const roles=new Set(['player','admin','owner']);

function stringList(value:unknown,limit:number){if(Array.isArray(value))return value.filter(v=>typeof v==='string').slice(0,limit);if(typeof value==='string'){try{return stringList(JSON.parse(value),limit);}catch{}}return [];}
function profileFromRow(row:ProfileRow):PlayerProfile{return {...row,featured_photos:stringList(row.featured_photos,4),featured_badges:stringList(row.featured_badges,4),role:roles.has(row.role)?row.role as PlayerProfile['role']:'player',created_at:new Date(Number(row.created_at)).toISOString()};}
function cleanUrl(value:unknown){const url=String(value??'').trim();return !url||/^https:\/\//i.test(url)?url:'';}

export async function authenticatedAccount(request:Request,settings:Settings):Promise<{user:User;client:SupabaseClient}|null>{
 const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');const url=settings.NEXT_PUBLIC_SUPABASE_URL,key=settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!token||!url||!key)return null;
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
 const{data,error}=await client.auth.getUser(token);return error||!data.user?null:{user:data.user,client};
}

export async function readProfile(db:D1Database,userId:string){const row=await stmt(db,profileSelect+' WHERE p.user_id=?',userId).first<ProfileRow>();return row?profileFromRow(row):null;}

export async function saveProfile(db:D1Database,user:User,input:Partial<PlayerProfile>,options:{trusted?:boolean;role?:PlayerProfile['role'];announce?:boolean}={}){
 const existing=await readProfile(db,user.id),username=String(input.username??'').replace(/^@+/,'').trim().toLowerCase(),displayName=String(input.display_name??'').trim();
 if(!/^[a-z0-9_]{3,24}$/.test(username))throw new Error('username_format');if(!displayName||displayName.length>60)throw new Error('name_required');
 const collision=await stmt(db,'SELECT user_id FROM app_profiles WHERE username=? AND user_id<>? UNION SELECT user_id FROM arena_players WHERE username=? AND user_id<>? LIMIT 1',username,user.id,username,user.id).first();if(collision)throw new Error('username_taken');
 const t=Date.now(),created=existing?Date.parse(existing.created_at):t,bio=String(input.bio??'').trim().slice(0,240),avatar=cleanUrl(input.avatar_url),country=/^[A-Z]{2}$/.test(String(input.country_code??''))?String(input.country_code):'PH';
 const photos=stringList(input.featured_photos,4).map(cleanUrl),badges=stringList(input.featured_badges,4),role=existing?.role??options.role??'player',cardPhoto=options.trusted?cleanUrl(input.card_photo_url):existing?.card_photo_url??'';
 const number=(value:unknown,fallback:number)=>Number.isFinite(Number(value))?Math.max(0,Number(value)):fallback;
 const cbr=options.trusted?number(input.cbr,88):existing?.cbr??88,ocbr=options.trusted?number(input.ocbr,88):existing?.ocbr??88,gold=options.trusted?number(input.gold_points,0):existing?.gold_points??0,wins=options.trusted?number(input.wins,0):existing?.wins??0,losses=options.trusted?number(input.losses,0):existing?.losses??0,streak=options.trusted?number(input.win_streak,0):existing?.win_streak??0;
 const writes=[
  stmt(db,`INSERT INTO app_profiles(user_id,username,display_name,bio,avatar_url,card_photo_url,country_code,featured_photos,featured_badges,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,bio=excluded.bio,avatar_url=excluded.avatar_url,country_code=excluded.country_code,featured_photos=excluded.featured_photos,featured_badges=excluded.featured_badges,updated_at=excluded.updated_at`,user.id,username,displayName,bio,avatar,cardPhoto,country,JSON.stringify(photos),JSON.stringify(badges),role,created,t),
  stmt(db,`INSERT INTO arena_players(user_id,username,display_name,avatar_url,country_code,cbr,ocbr,gold_points,wins,losses,win_streak,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,avatar_url=excluded.avatar_url,country_code=excluded.country_code,updated_at=excluded.updated_at`,user.id,username,displayName,avatar,country,cbr,ocbr,gold,wins,losses,streak,t),
 ];
 if(!existing&&options.announce!==false)writes.push(stmt(db,`INSERT OR IGNORE INTO arena_feed(id,user_id,kind,display_name,content,created_at) VALUES(?,?,'profile_created',?,'joined Chess Burger.',?)`,'profile:'+user.id,user.id,displayName,t));
 await db.batch(writes);return (await readProfile(db,user.id))!;
}

export async function loadOrImportProfile(db:D1Database,user:User,client:SupabaseClient){
 const saved=await readProfile(db,user.id);if(saved)return saved;
 const{data}=await client.from('cb_profiles').select('*').eq('user_id',user.id).maybeSingle();if(!data)return null;
 const role=roles.has(data.role)?data.role as PlayerProfile['role']:undefined;
 return saveProfile(db,user,data as Partial<PlayerProfile>,{trusted:true,role,announce:false});
}

export async function mirrorProfile(client:SupabaseClient,profile:PlayerProfile){
 const payload={user_id:profile.user_id,username:profile.username,display_name:profile.display_name,bio:profile.bio,avatar_url:profile.avatar_url,country_code:profile.country_code,featured_photos:profile.featured_photos,featured_badges:profile.featured_badges};
 await client.from('cb_profiles').upsert(payload,{onConflict:'user_id'}).then(()=>undefined,()=>undefined);
}
