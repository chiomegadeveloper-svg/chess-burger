/* Read-only public leaderboard data. Never return whole profile records. */
const boards=new Set(["cbr", "ocbr", "puzzle_today", "puzzle_total", "puzzle_rating", "puzzle_streak", "cpu_today", "cpu_week", "cpu_all", "cpu_rapid", "cpu_blitz", "cpu_bullet", "arena_all", "arena_today", "arena_week", "arena_session", "arena_champions", "math_easy_score", "math_easy_speed", "math_easy_finishers", "math_medium_score", "math_medium_speed", "math_medium_finishers", "math_hard_score", "math_hard_speed", "math_hard_finishers", "attack_score", "attack_pace", "attack_total"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status:number,message:string):never=>{throw Object.assign(Error(message),{status});};
export async function gameRankings(client:any,query:Record<string,unknown>){
 const board=query.board??'cbr',page=Number(query.page??1);
 if(typeof board!=='string'||!boards.has(board)||!Number.isInteger(page)||page<1||page>100000)fail(400,'Choose a valid leaderboard and page.');
 for(const key of ['user_id','session_id'])if(query[key]!=null&&(typeof query[key]!=='string'||!uuid.test(query[key] as string)))fail(400,'Choose a valid player or Arena session.');
 const userId=query.user_id??null,sessionId=query.session_id??null;
 if(board==='cbr'){
  const select='user_id,username,display_name,avatar_url,cbr,wins';
  const count=await client.from('cb_profiles').select('user_id',{count:'exact',head:true});if(count.error)fail(500,'CBR rankings could not load.');
  const total=Number(count.count??0),pages=Math.max(1,Math.ceil(total/10)),current=Math.min(page,pages);
  const rows=await client.from('cb_profiles').select(select).order('cbr',{ascending:false}).order('wins',{ascending:false}).order('user_id',{ascending:true}).range((current-1)*10,current*10-1);
  if(rows.error)fail(500,'CBR rankings could not load.');
  const format=(row:any,rank:number)=>({rank,user_id:row.user_id,username:row.username,display_name:row.display_name,avatar_url:row.avatar_url,value:Number(row.cbr),detail:`${Number(row.wins)} wins`});
  let mine=null;
  if(userId){const profile=await client.from('cb_profiles').select(select).eq('user_id',userId).maybeSingle();if(!profile.error&&profile.data){const p=profile.data;const higher=await client.from('cb_profiles').select('user_id',{count:'exact',head:true}).or(`cbr.gt.${Number(p.cbr)},and(cbr.eq.${Number(p.cbr)},wins.gt.${Number(p.wins)}),and(cbr.eq.${Number(p.cbr)},wins.eq.${Number(p.wins)},user_id.lt.${userId})`);if(!higher.error)mine=format(p,Number(higher.count??0)+1);}}
  return {total,pages,page:current,page_size:10,rows:(rows.data??[]).map((row:any,index:number)=>format(row,(current-1)*10+index+1)),mine};
 }
 const result=await client.rpc('cb_game_rankings',{p_board:board,p_page:page,p_user_id:userId,p_session_id:sessionId});
 if(result.error)fail(result.error.code==='PGRST202'||result.error.code==='42P01'?503:500,result.error.code==='PGRST202'?'Apply supabase/0104_all_game_rankings.sql in Supabase to enable all game leaderboards.':'This leaderboard is temporarily unavailable. Check that its game migrations are applied.');
 if(!result.data)fail(503,'This leaderboard is temporarily unavailable.');
 let sessions=[];
 if(board==='arena_session'){const list=await client.from('cb_arena_sessions').select('id,title,starts_at,ends_at').eq('owner_scheduled',true).order('starts_at',{ascending:false}).limit(50);if(!list.error)sessions=list.data??[];}
 return {...result.data,sessions};
}
