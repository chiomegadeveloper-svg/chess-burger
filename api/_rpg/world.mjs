export const heroIds=['rogue','theft','assassin','mage','tank','archer','queen','crusader'];
export function validatePresence(value){
 if(!value||!heroIds.includes(value.heroId)||typeof value.name!=='string'||value.name.trim().length<2||value.name.length>32||!Number.isInteger(value.level)||value.level<1||value.level>88)return null;
 for(const key of ['lat','lng','accuracy'])if(typeof value[key]!=='number'||!Number.isFinite(value[key]))return null;
 if(Math.abs(value.lat)>85||Math.abs(value.lng)>180||value.accuracy<0||value.accuracy>1000)return null;
 return {...value,name:value.name.trim()};
}
export function distanceMeters(a,b){const r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lng-a.lng)*r,x=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
export function nearbyPlayers(rows,self,now){return rows.filter(row=>row.updated_at>now-45000&&distanceMeters(self,row)<=5000).sort((a,b)=>distanceMeters(self,a)-distanceMeters(self,b)).slice(0,100).map(row=>({peerId:row.peer_id,heroId:row.hero_id,name:row.display_name,level:row.level,lat:row.lat,lng:row.lng,accuracy:row.accuracy,updatedAt:row.updated_at}));}
export function validateFix(value,now=Date.now()){
 if(!value||!['lat','lng','accuracy','time'].every(k=>Number.isFinite(value[k]))||Math.abs(value.lat)>85||Math.abs(value.lng)>180||value.accuracy<0||value.accuracy>1000||value.time>now+5000||now-value.time>30000)return null;
 return {lat:value.lat,lng:value.lng,accuracy:value.accuracy};
}
