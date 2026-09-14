import type {PlayerProfile} from "./supabase";

export const LEVELS=[
 {level:1,name:"Wandering Pawn",min:0,max:88},{level:2,name:"Vanguard Knight",min:89,max:176},
 {level:3,name:"Zealot Bishop",min:177,max:352},{level:4,name:"Fortress Rook",min:353,max:616},
 {level:5,name:"Gambit Stalker",min:617,max:1056},{level:6,name:"Promoted Champion",min:1057,max:1760},
 {level:7,name:"Sovereign Queen",min:1761,max:2904},{level:8,name:"Zugzwang Sphinx",min:2905,max:4752},
 {level:9,name:"Grandmaster Phoenix",min:4753,max:7744},{level:10,name:"Mythical Endgame Dragon",min:7745,max:12584},
 {level:11,name:"Crowned Commander",min:12585,max:20380},{level:12,name:"Royal Marshal",min:20381,max:33000},
 {level:13,name:"Chess Burger Warden",min:33001,max:53500},{level:14,name:"Imperial Knight",min:53501,max:86500},
 {level:15,name:"Gold Sovereign",min:86501,max:140000},{level:16,name:"Arcane Rook",min:140001,max:226000},
 {level:17,name:"Titan Bishop",min:226001,max:365000},{level:18,name:"Burger Monarch",min:365001,max:590000},
 {level:19,name:"Endgame Oracle",min:590001,max:955000},{level:20,name:"ChessBurger Supreme",min:955001,max:999999999},
];
export function levelFor(cbr=88){return LEVELS.find(level=>cbr>=level.min&&cbr<=level.max)??LEVELS[LEVELS.length-1];}
export function applyResult<T extends Pick<PlayerProfile,"cbr"|"win_streak"|"wins"|"losses">>(profile:T,result:"win"|"loss"|"draw"){
 const streak=profile.win_streak??0;
 const nextStreak=result==="win"?streak+1:0;
 const delta=result==="win"?8+(nextStreak>=4?2:0):result==="loss"?-10:0;
 return {...profile,cbr:Math.max(0,(profile.cbr??88)+delta),win_streak:nextStreak,wins:(profile.wins??0)+(result==="win"?1:0),losses:(profile.losses??0)+(result==="loss"?1:0),rating_delta:delta};
}
