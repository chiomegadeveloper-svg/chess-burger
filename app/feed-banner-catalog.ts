export type FeedBanner = {
  id: string;
  name: string;
  tier: "pastel" | "metallic";
  price: number;
  background: string;
  ink: string;
};

export const FEED_BANNERS: FeedBanner[] = [
  { id: "pastel-blush", name: "Blush", tier: "pastel", price: 38, background: "linear-gradient(135deg,#ffd8e5,#f2a9c1)", ink: "#34242b" },
  { id: "pastel-peach", name: "Peach", tier: "pastel", price: 40, background: "linear-gradient(135deg,#ffe0c2,#f7b98f)", ink: "#38271f" },
  { id: "pastel-lemon", name: "Lemon", tier: "pastel", price: 42, background: "linear-gradient(135deg,#fff4b7,#efd979)", ink: "#332f1d" },
  { id: "pastel-mint", name: "Mint", tier: "pastel", price: 44, background: "linear-gradient(135deg,#d5f8df,#9bddb1)", ink: "#1f3326" },
  { id: "pastel-sage", name: "Sage", tier: "pastel", price: 46, background: "linear-gradient(135deg,#dbe9d7,#a9c4a6)", ink: "#253026" },
  { id: "pastel-sky", name: "Sky", tier: "pastel", price: 48, background: "linear-gradient(135deg,#d4ebff,#8fc7ed)", ink: "#21303b" },
  { id: "pastel-ice", name: "Ice Blue", tier: "pastel", price: 50, background: "linear-gradient(135deg,#e2f2ff,#a9d0f3)", ink: "#23313b" },
  { id: "pastel-lilac", name: "Lilac", tier: "pastel", price: 52, background: "linear-gradient(135deg,#efd9fa,#c8a3dd)", ink: "#33253a" },
  { id: "pastel-violet", name: "Violet", tier: "pastel", price: 55, background: "linear-gradient(135deg,#dec8fa,#aa83d7)", ink: "#2c2138" },
  { id: "pastel-coral", name: "Coral", tier: "pastel", price: 58, background: "linear-gradient(135deg,#ffc9c9,#f28a91)", ink: "#3a2225" },
  { id: "metal-gold", name: "Gold", tier: "metallic", price: 68, background: "linear-gradient(125deg,#6f4610 0%,#f8dc7a 28%,#9a6418 52%,#ffe79a 76%,#7a4b0e 100%)", ink: "#201608" },
  { id: "metal-rose", name: "Rose Gold", tier: "metallic", price: 69, background: "linear-gradient(125deg,#704039,#f3b6a8 30%,#92564c 52%,#f7c5b8 76%,#6c3732 100%)", ink: "#21100f" },
  { id: "metal-silver", name: "Silver", tier: "metallic", price: 70, background: "linear-gradient(125deg,#555d65,#eef2f5 28%,#858d94 52%,#f7fafc 76%,#4d555c 100%)", ink: "#15191d" },
  { id: "metal-gunmetal", name: "Gunmetal", tier: "metallic", price: 71, background: "linear-gradient(125deg,#111419,#717981 30%,#252a30 54%,#8b9298 76%,#111318 100%)", ink: "#f3f6f8" },
  { id: "metal-bronze", name: "Bronze", tier: "metallic", price: 72, background: "linear-gradient(125deg,#512a11,#e39855 30%,#83451d 52%,#f0ad6a 76%,#4e270f 100%)", ink: "#fff8ed" },
  { id: "metal-cyan", name: "Cyan", tier: "metallic", price: 73, background: "linear-gradient(125deg,#034a5e,#38d5ef 30%,#087d98 52%,#6de8f5 76%,#033e50 100%)", ink: "#f2feff" },
  { id: "metal-royal", name: "Royal Blue", tier: "metallic", price: 74, background: "linear-gradient(125deg,#071b59,#3980ff 30%,#103aa1 52%,#65a0ff 76%,#071747 100%)", ink: "#f4f8ff" },
  { id: "metal-emerald", name: "Emerald", tier: "metallic", price: 75, background: "linear-gradient(125deg,#063b29,#2ac987 30%,#087148 52%,#59e0a7 76%,#052e21 100%)", ink: "#f3fff9" },
  { id: "metal-amethyst", name: "Amethyst", tier: "metallic", price: 76, background: "linear-gradient(125deg,#35105a,#b968ee 30%,#642092 52%,#d194f2 76%,#2d0c4d 100%)", ink: "#fff7ff" },
  { id: "metal-ruby", name: "Ruby", tier: "metallic", price: 78, background: "linear-gradient(125deg,#5a080d,#ed4452 30%,#9b101d 52%,#ff7580 76%,#4c060a 100%)", ink: "#fff7f7" },
];

export const feedBanner = (id?: string | null) => FEED_BANNERS.find((banner) => banner.id === id);
