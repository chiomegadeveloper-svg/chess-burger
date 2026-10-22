export type HomeReminder = 'quest'|'rewards'|'arena'|'done';
export const reminderDay=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
const steps=['quest','rewards','arena'] as const;
type Store=Pick<Storage,'getItem'|'setItem'>;
const key=(user:string)=>'cb-home-reminders:v2:'+user;
function seen(storage:Store,user:string,day:string):string[]{try{const value=JSON.parse(storage.getItem(key(user))||'null');return value?.day===day&&Array.isArray(value.seen)?value.seen:[];}catch{return [];}}
export function nextHomeReminder(storage:Store,user:string,now=Date.now()):HomeReminder{const read=seen(storage,user,reminderDay(now));return steps.find(step=>!read.includes(step))||'done';}
export function markHomeReminder(storage:Store,user:string,step:HomeReminder,now=Date.now()){if(step==='done')return;const day=reminderDay(now);try{storage.setItem(key(user),JSON.stringify({day,seen:[...new Set([...seen(storage,user,day),step])]}));}catch{}}
