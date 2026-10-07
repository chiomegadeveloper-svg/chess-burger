export type ArenaRepeat = 'none' | 'daily' | 'weekly';
export function arenaOccurrences(start:string,end:string,repeat:ArenaRepeat,count:number){
  if(!['none','daily','weekly'].includes(repeat)||!Number.isInteger(count)||(repeat==='none'?count!==1:count<2||count>28))throw Error('Choose a repeat option and 2–28 sessions.');
  const from=Date.parse(start),to=Date.parse(end);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to-from<30*60000||to-from>24*3600000)throw Error('Choose a battle lasting 30 minutes to 24 hours.');
  const step=(repeat==='weekly'?7:1)*24*3600000;
  return Array.from({length:count},(_,index)=>({starts_at:new Date(from+index*step).toISOString(),ends_at:new Date(to+index*step).toISOString()}));
}
