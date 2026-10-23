export function database({jsonb=false}={}){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort((a,b)=>a.length-b.length||a.localeCompare(b)).map(k=>[k,canonical(value[k])])):value;
 const stored=value=>jsonb?canonical(structuredClone(value)):structuredClone(value);
 const rows=new Map(),key=r=>[r.user_id,r.item_kind,r.item_id].join(':');
 class Query{
  constructor(){this.filters=[];this.action='select';this.bound=Infinity;}
  select(){return this;}eq(k,v){this.filters.push(r=>String(k.includes('->>')?r.metadata?.[k.split('->>')[1]]:r[k])===String(v));return this;}
  neq(k,v){this.filters.push(r=>r[k]!==v);return this;}gt(k,v){this.filters.push(r=>r[k]>v);return this;}in(k,values){this.filters.push(r=>values.includes(k.includes('->>')?r.metadata?.[k.split('->>')[1]]:r[k]));return this;}
  contains(k,v){this.filters.push(r=>Object.entries(v).every(([field,values])=>values.every(x=>r[k]?.[field]?.includes(x))));return this;}
  limit(n){this.bound=n;return this;}insert(v){this.action='insert';this.value=stored(v);return this;}update(v){this.action='update';this.value=stored(v);return this;}delete(){this.action='delete';return this;}
  async run(single=false){
   if(this.action==='insert'){if(rows.has(key(this.value)))return {error:{code:'23505'}};rows.set(key(this.value),{...this.value,updated_at:new Date().toISOString()});return {error:null,data:null};}
   const matches=[...rows.values()].filter(r=>this.filters.every(f=>f(r))).slice(0,this.bound);
   if(this.action==='update')for(const r of matches)Object.assign(r,structuredClone(this.value));if(this.action==='delete')for(const r of matches)rows.delete(key(r));
   const data=structuredClone(matches);return {error:null,data:single?data[0]||null:data};
  }
  maybeSingle(){return this.run(true);}then(resolve,reject){return this.run().then(resolve,reject);}
 }
 const feed=new Map();const db={rows,feed,feedError:false,from(table){if(table==='cb_feed')return {async upsert(events){if(db.feedError)return {error:{message:'Unavailable'}};for(const event of events)if(!feed.has(event.id))feed.set(event.id,stored(event));return {error:null};}};if(table==='cb_profiles')return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{display_name:'Test Player'},error:null};}};return new Query();},async rpc(){return {data:null,error:{code:'PGRST202',message:'Function is not installed in this fixture'}};}};return db;
}
