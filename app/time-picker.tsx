import {Timer,Zap,Flame} from 'lucide-react';
import {TIME_CONTROLS} from './game-rules';
export default function TimePicker({value,onChange,disabled=false}:{value:string;onChange:(id:string)=>void;disabled?:boolean}){
 return <fieldset className="time-picker" disabled={disabled}><legend>Time control</legend>{['Bullet','Blitz','Rapid'].map((group,index)=>{const Icon=[Flame,Zap,Timer][index];return <div key={group}><h3><Icon size={15}/>{group}</h3><div className="time-options">{TIME_CONTROLS.filter(t=>t.group===group).map(t=><button key={t.id} type="button" aria-pressed={value===t.id} className={value===t.id?'selected':''} onClick={()=>onChange(t.id)}>{t.label}</button>)}</div></div>})}</fieldset>;
}
