export type RewardId =
  | "rookie-flame" | "knights-steel" | "burger-blitz" | "first-checkmate" | "golden-pawn"
  | "cbr-climber" | "neon-board" | "burger-master" | "silver-rook" | "friendly-challenger"
  | "tactical-thinker" | "midnight-board" | "golden-king" | "cb-champion" | "flaming-queen"
  | "community-legend" | "cyber-knight" | "burger-crown" | "grandmaster-gold" | "cb-supreme";

export type RewardDefinition={id:RewardId;name:string;requirement:string;kind:"frame"|"banner"|"badge"|"background"|"title"|"theme"};
export const REWARDS:RewardDefinition[]=[
 {id:"rookie-flame",name:"Rookie Flame Frame",requirement:"Unlock at Level 2",kind:"frame"},
 {id:"knights-steel",name:"Knight’s Steel Avatar Frame",requirement:"Win 3 matches",kind:"frame"},
 {id:"burger-blitz",name:"Burger Blitz Profile Banner",requirement:"Play 10 matches",kind:"banner"},
 {id:"first-checkmate",name:"First Checkmate Badge",requirement:"Get your first checkmate",kind:"badge"},
 {id:"golden-pawn",name:"Golden Pawn Avatar Frame",requirement:"Reach Level 5",kind:"frame"},
 {id:"cbr-climber",name:"CBR Climber Badge",requirement:"Gain 100 total CBR",kind:"badge"},
 {id:"neon-board",name:"Chessboard Neon Background",requirement:"Win 10 matches",kind:"background"},
 {id:"burger-master",name:"Burger Master Title",requirement:"Reach Level 10",kind:"title"},
 {id:"silver-rook",name:"Silver Rook Frame",requirement:"Maintain a 3-match winning streak",kind:"frame"},
 {id:"friendly-challenger",name:"Friendly Challenger Badge",requirement:"Add 5 friends",kind:"badge"},
 {id:"tactical-thinker",name:"Tactical Thinker Title",requirement:"Win 5 matches by checkmate",kind:"title"},
 {id:"midnight-board",name:"Midnight Chessboard Profile Theme",requirement:"Play 30 matches",kind:"theme"},
 {id:"golden-king",name:"Golden King Avatar Frame",requirement:"Reach Level 15",kind:"frame"},
 {id:"cb-champion",name:"ChessBurger Champion Badge",requirement:"Gain 500 total CBR",kind:"badge"},
 {id:"flaming-queen",name:"Flaming Queen Profile Banner",requirement:"Maintain a 5-match winning streak",kind:"banner"},
 {id:"community-legend",name:"Community Legend Badge",requirement:"Receive 25 reactions on feed posts",kind:"badge"},
 {id:"cyber-knight",name:"Cyber Knight Profile Theme",requirement:"Win 25 ranked matches",kind:"theme"},
 {id:"burger-crown",name:"Burger Crown Title",requirement:"Reach Level 20",kind:"title"},
 {id:"grandmaster-gold",name:"Grandmaster Gold Frame",requirement:"Reach 1,000 CBR",kind:"frame"},
 {id:"cb-supreme",name:"ChessBurger Supreme Badge",requirement:"Win 100 total matches",kind:"badge"},
];
