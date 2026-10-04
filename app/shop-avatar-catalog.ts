export type ShopAvatar={id:string;name:string;price:number;image:string};
const names=[
  "Burger Prince","Sunny Baker","Beat Knight","Chess Skater","Golden Rook","Royal Scholar","Grand King","Queen Ember",
  "Chess Ace","Little Crown","Chef Champion","Silver Spark","Royal Cat","Lion King","Cyan Bot","Pink Star",
  "Young Strategist","Clever Curly","Puppy Knight","Queen Joy","Silver Knight","Moon Queen","Little Scholar","Captain Gold",
  "Urban Champion","Chess Dreamer","Grandmother Grace","Happy King","Golden Princess","Chef Bot","Royal Rider","Chess Rebel",
  "Ice Knight","Burger Skater","White Charger","Purple Queen","Blue Challenger","Panda Pal","Young Champion","Golden Dreamer"
];
export const SHOP_AVATARS:ShopAvatar[]=names.map((name,index)=>({id:`avatar-${String(index+1).padStart(2,"0")}`,name,price:2+index%7,image:`/shop-avatars/avatar-${String(index+1).padStart(2,"0")}.webp`}));
export const shopAvatar=(id:string|undefined|null)=>SHOP_AVATARS.find(item=>item.id===id);
