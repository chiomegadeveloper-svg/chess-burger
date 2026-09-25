export type FeedBanner = {
  id: string;
  name: string;
  tier: "pastel" | "metallic" | "neon" | "cute" | "warrior" | "animated" | "robot";
  price: number;
  background: string;
  ink: string;
};

export type FeedBannerDuration = 3 | 5 | 7;
export const FEED_BANNER_DURATIONS: FeedBannerDuration[] = [3, 5, 7];
export const isGraphicBanner = (banner: FeedBanner) => !["pastel", "metallic", "neon"].includes(banner.tier);
export const feedBannerRentalPrice = (tier: FeedBanner["tier"], days: FeedBannerDuration, base = 0) => {
  if (tier === "metallic") return base + ({ 3: 0, 5: 60, 7: 120 } as const)[days];
  if (tier === "neon") return base + ({ 3: 0, 5: 40, 7: 80 } as const)[days];
  if (tier === "pastel") return base + ({ 3: 0, 5: 20, 7: 40 } as const)[days];
  return base;
};

export const FEED_BANNERS: FeedBanner[] = [
  { id: "pastel-blush", name: "Blush", tier: "pastel", price: 128, background: "linear-gradient(135deg,#ffd8e5,#f2a9c1)", ink: "#34242b" },
  { id: "pastel-peach", name: "Peach", tier: "pastel", price: 130, background: "linear-gradient(135deg,#ffe0c2,#f7b98f)", ink: "#38271f" },
  { id: "pastel-lemon", name: "Lemon", tier: "pastel", price: 132, background: "linear-gradient(135deg,#fff4b7,#efd979)", ink: "#332f1d" },
  { id: "pastel-mint", name: "Mint", tier: "pastel", price: 134, background: "linear-gradient(135deg,#d5f8df,#9bddb1)", ink: "#1f3326" },
  { id: "pastel-sage", name: "Sage", tier: "pastel", price: 136, background: "linear-gradient(135deg,#dbe9d7,#a9c4a6)", ink: "#253026" },
  { id: "pastel-sky", name: "Sky", tier: "pastel", price: 138, background: "linear-gradient(135deg,#d4ebff,#8fc7ed)", ink: "#21303b" },
  { id: "pastel-ice", name: "Ice Blue", tier: "pastel", price: 140, background: "linear-gradient(135deg,#e2f2ff,#a9d0f3)", ink: "#23313b" },
  { id: "pastel-lilac", name: "Lilac", tier: "pastel", price: 143, background: "linear-gradient(135deg,#efd9fa,#c8a3dd)", ink: "#33253a" },
  { id: "pastel-violet", name: "Violet", tier: "pastel", price: 146, background: "linear-gradient(135deg,#dec8fa,#aa83d7)", ink: "#2c2138" },
  { id: "pastel-coral", name: "Coral", tier: "pastel", price: 148, background: "linear-gradient(135deg,#ffc9c9,#f28a91)", ink: "#3a2225" },
  { id: "metal-gold", name: "Gold", tier: "metallic", price: 218, background: "linear-gradient(125deg,#6f4610 0%,#f8dc7a 28%,#9a6418 52%,#ffe79a 76%,#7a4b0e 100%)", ink: "#201608" },
  { id: "metal-rose", name: "Rose Gold", tier: "metallic", price: 224, background: "linear-gradient(125deg,#704039,#f3b6a8 30%,#92564c 52%,#f7c5b8 76%,#6c3732 100%)", ink: "#21100f" },
  { id: "metal-silver", name: "Silver", tier: "metallic", price: 230, background: "linear-gradient(125deg,#555d65,#eef2f5 28%,#858d94 52%,#f7fafc 76%,#4d555c 100%)", ink: "#15191d" },
  { id: "metal-gunmetal", name: "Gunmetal", tier: "metallic", price: 236, background: "linear-gradient(125deg,#111419,#717981 30%,#252a30 54%,#8b9298 76%,#111318 100%)", ink: "#f3f6f8" },
  { id: "metal-bronze", name: "Bronze", tier: "metallic", price: 242, background: "linear-gradient(125deg,#512a11,#e39855 30%,#83451d 52%,#f0ad6a 76%,#4e270f 100%)", ink: "#fff8ed" },
  { id: "metal-cyan", name: "Cyan", tier: "metallic", price: 248, background: "linear-gradient(125deg,#034a5e,#38d5ef 30%,#087d98 52%,#6de8f5 76%,#033e50 100%)", ink: "#f2feff" },
  { id: "metal-royal", name: "Royal Blue", tier: "metallic", price: 254, background: "linear-gradient(125deg,#071b59,#3980ff 30%,#103aa1 52%,#65a0ff 76%,#071747 100%)", ink: "#f4f8ff" },
  { id: "metal-emerald", name: "Emerald", tier: "metallic", price: 260, background: "linear-gradient(125deg,#063b29,#2ac987 30%,#087148 52%,#59e0a7 76%,#052e21 100%)", ink: "#f3fff9" },
  { id: "metal-amethyst", name: "Amethyst", tier: "metallic", price: 264, background: "linear-gradient(125deg,#35105a,#b968ee 30%,#642092 52%,#d194f2 76%,#2d0c4d 100%)", ink: "#fff7ff" },
  { id: "metal-ruby", name: "Ruby", tier: "metallic", price: 268, background: "linear-gradient(125deg,#5a080d,#ed4452 30%,#9b101d 52%,#ff7580 76%,#4c060a 100%)", ink: "#fff7f7" },
  { id: "pastel-rosewater", name: "Rosewater", tier: "pastel", price: 150, background: "linear-gradient(135deg,#fbe5e9,#eec3d2)", ink: "#27313a" },
  { id: "pastel-apricot", name: "Apricot", tier: "pastel", price: 152, background: "linear-gradient(135deg,#ffe9d3,#f7c49a)", ink: "#27313a" },
  { id: "pastel-buttercream", name: "Buttercream", tier: "pastel", price: 154, background: "linear-gradient(135deg,#fff4d8,#f5df9d)", ink: "#27313a" },
  { id: "pastel-pistachio", name: "Pistachio", tier: "pastel", price: 156, background: "linear-gradient(135deg,#e9f3d7,#bedb99)", ink: "#27313a" },
  { id: "pastel-seafoam", name: "Seafoam", tier: "pastel", price: 158, background: "linear-gradient(135deg,#d6f5eb,#9ddcca)", ink: "#27313a" },
  { id: "pastel-powder-blue", name: "Powder Blue", tier: "pastel", price: 160, background: "linear-gradient(135deg,#e4f3ff,#b9d7ef)", ink: "#27313a" },
  { id: "pastel-periwinkle", name: "Periwinkle", tier: "pastel", price: 162, background: "linear-gradient(135deg,#e1e7ff,#b7c5ee)", ink: "#27313a" },
  { id: "pastel-lavender-fog", name: "Lavender Fog", tier: "pastel", price: 164, background: "linear-gradient(135deg,#ede7f8,#cec0e5)", ink: "#27313a" },
  { id: "pastel-orchid-mist", name: "Orchid Mist", tier: "pastel", price: 166, background: "linear-gradient(135deg,#f9e3f4,#e7b4d8)", ink: "#27313a" },
  { id: "pastel-watermelon", name: "Watermelon", tier: "pastel", price: 168, background: "linear-gradient(135deg,#ffe1e3,#f4acb0)", ink: "#27313a" },
  { id: "pastel-pearl", name: "Pearl", tier: "pastel", price: 170, background: "linear-gradient(135deg,#f7f3f0,#dfd8d4)", ink: "#27313a" },
  { id: "pastel-sand", name: "Sand", tier: "pastel", price: 172, background: "linear-gradient(135deg,#f8eddc,#dccbb2)", ink: "#27313a" },
  { id: "pastel-chamomile", name: "Chamomile", tier: "pastel", price: 174, background: "linear-gradient(135deg,#fff1c8,#e5d5a0)", ink: "#27313a" },
  { id: "pastel-cloud", name: "Cloud", tier: "pastel", price: 176, background: "linear-gradient(135deg,#eaf4f6,#c4dce0)", ink: "#27313a" },
  { id: "pastel-cocoa-rose", name: "Cocoa Rose", tier: "pastel", price: 178, background: "linear-gradient(135deg,#eedbd8,#ceaead)", ink: "#27313a" },
  { id: "metal-platinum", name: "Platinum", tier: "metallic", price: 272, background: "linear-gradient(125deg,#545865 0%,#f8faff 28%,#7f8590 52%,#e9eff9 76%,#545865 100%)", ink: "#1b2430" },
  { id: "metal-titanium", name: "Titanium", tier: "metallic", price: 276, background: "linear-gradient(125deg,#343d46 0%,#bfcdd4 28%,#586873 52%,#e3eaf0 76%,#343d46 100%)", ink: "#ffffff" },
  { id: "metal-copper", name: "Copper", tier: "metallic", price: 280, background: "linear-gradient(125deg,#5b2917 0%,#f7ae76 28%,#a55b34 52%,#ffcea1 76%,#5b2917 100%)", ink: "#ffffff" },
  { id: "metal-champagne", name: "Champagne", tier: "metallic", price: 284, background: "linear-gradient(125deg,#725a38 0%,#fff0be 28%,#b79c6a 52%,#ffe6a7 76%,#725a38 100%)", ink: "#1b2430" },
  { id: "metal-steel-blue", name: "Steel Blue", tier: "metallic", price: 288, background: "linear-gradient(125deg,#223e56 0%,#a8d9f0 28%,#3e7092 52%,#d3effb 76%,#223e56 100%)", ink: "#ffffff" },
  { id: "metal-sapphire", name: "Sapphire", tier: "metallic", price: 292, background: "linear-gradient(125deg,#09255b 0%,#489cff 28%,#1250a1 52%,#a4cbff 76%,#09255b 100%)", ink: "#ffffff" },
  { id: "metal-jade", name: "Jade", tier: "metallic", price: 296, background: "linear-gradient(125deg,#103f3a 0%,#5bd4b2 28%,#197763 52%,#a3f2d9 76%,#103f3a 100%)", ink: "#ffffff" },
  { id: "metal-onyx", name: "Onyx", tier: "metallic", price: 300, background: "linear-gradient(125deg,#0b1019 0%,#748394 28%,#202e40 52%,#a9b4c1 76%,#0b1019 100%)", ink: "#ffffff" },
  { id: "metal-pewter", name: "Pewter", tier: "metallic", price: 304, background: "linear-gradient(125deg,#4f5d5c 0%,#dce8e3 28%,#708680 52%,#f0f7ee 76%,#4f5d5c 100%)", ink: "#1b2430" },
  { id: "metal-brass", name: "Brass", tier: "metallic", price: 308, background: "linear-gradient(125deg,#554216 0%,#ead47a 28%,#8d792b 52%,#ffe599 76%,#554216 100%)", ink: "#ffffff" },
  { id: "metal-cobalt", name: "Cobalt", tier: "metallic", price: 312, background: "linear-gradient(125deg,#061a54 0%,#5277e5 28%,#15388b 52%,#9cafff 76%,#061a54 100%)", ink: "#ffffff" },
  { id: "metal-garnet", name: "Garnet", tier: "metallic", price: 316, background: "linear-gradient(125deg,#490d25 0%,#dd5481 28%,#8a2448 52%,#f28db1 76%,#490d25 100%)", ink: "#ffffff" },
  { id: "metal-opal", name: "Opal", tier: "metallic", price: 320, background: "linear-gradient(125deg,#516468 0%,#d1f1e4 28%,#92c6d3 52%,#f9e9ea 76%,#516468 100%)", ink: "#1b2430" },
  { id: "metal-graphite", name: "Graphite", tier: "metallic", price: 324, background: "linear-gradient(125deg,#171e28 0%,#87959b 28%,#384952 52%,#bec6c2 76%,#171e28 100%)", ink: "#ffffff" },
  { id: "metal-iridescent", name: "Iridescent", tier: "metallic", price: 328, background: "linear-gradient(125deg,#2f3054 0%,#e9b7f2 28%,#679ea9 52%,#b9e4d7 76%,#2f3054 100%)", ink: "#1b2430" },
  { id: "neon-laser-pink", name: "Laser Pink", tier: "neon", price: 184, background: "radial-gradient(circle at 82% 28%,#ff3caa 0%,#9c0962 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-electric-coral", name: "Electric Coral", tier: "neon", price: 186, background: "radial-gradient(circle at 82% 28%,#ff6074 0%,#a92c45 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-voltage-orange", name: "Voltage Orange", tier: "neon", price: 188, background: "radial-gradient(circle at 82% 28%,#ff8a28 0%,#b84812 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-plasma-yellow", name: "Plasma Yellow", tier: "neon", price: 190, background: "radial-gradient(circle at 82% 28%,#f4fa39 0%,#aaa919 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-acid-lime", name: "Acid Lime", tier: "neon", price: 192, background: "radial-gradient(circle at 82% 28%,#a8ff32 0%,#3e9616 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-ion-green", name: "Ion Green", tier: "neon", price: 194, background: "radial-gradient(circle at 82% 28%,#25f577 0%,#138455 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-neon-mint", name: "Neon Mint", tier: "neon", price: 196, background: "radial-gradient(circle at 82% 28%,#2fffc2 0%,#088a7b 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-aqua-pulse", name: "Aqua Pulse", tier: "neon", price: 198, background: "radial-gradient(circle at 82% 28%,#2fffe8 0%,#057d83 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-electric-cyan", name: "Electric Cyan", tier: "neon", price: 200, background: "radial-gradient(circle at 82% 28%,#26ecff 0%,#08799a 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-azure-beam", name: "Azure Beam", tier: "neon", price: 202, background: "radial-gradient(circle at 82% 28%,#40b8ff 0%,#2250b4 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-cobalt-glow", name: "Cobalt Glow", tier: "neon", price: 204, background: "radial-gradient(circle at 82% 28%,#6c83ff 0%,#364ab7 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-ultraviolet", name: "Ultraviolet", tier: "neon", price: 206, background: "radial-gradient(circle at 82% 28%,#a35cff 0%,#6028a8 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-hyper-violet", name: "Hyper Violet", tier: "neon", price: 208, background: "radial-gradient(circle at 82% 28%,#d151ff 0%,#8224a3 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-hot-magenta", name: "Hot Magenta", tier: "neon", price: 210, background: "radial-gradient(circle at 82% 28%,#ff36e5 0%,#9d147d 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
  { id: "neon-neon-ruby", name: "Neon Ruby", tier: "neon", price: 212, background: "radial-gradient(circle at 82% 28%,#ff3456 0%,#9f1839 25%,transparent 55%),linear-gradient(135deg,#081119,#13232f)", ink: "#ffffff" },
];

// Keep active rentals visible in the Bag and feed until their original expiry.
const LEGACY_FEED_BANNERS: FeedBanner[] = [
  { id: "animated-1", name: "Dancing Pawn", tier: "animated", price: 1488, background: "url('/feed-banners/animated-1.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-2", name: "Winking Queen", tier: "animated", price: 1532, background: "url('/feed-banners/animated-2.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-3", name: "Bouncy Knight", tier: "animated", price: 1577, background: "url('/feed-banners/animated-3.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-4", name: "Confetti Rook", tier: "animated", price: 1622, background: "url('/feed-banners/animated-4.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-5", name: "Sparkle Bishop", tier: "animated", price: 1666, background: "url('/feed-banners/animated-5.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-6", name: "Happy Castle", tier: "animated", price: 1711, background: "url('/feed-banners/animated-6.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-7", name: "Party King", tier: "animated", price: 1755, background: "url('/feed-banners/animated-7.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-8", name: "Dreamy Check", tier: "animated", price: 1800, background: "url('/feed-banners/animated-8.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-9", name: "Rainbow Pawn", tier: "animated", price: 1844, background: "url('/feed-banners/animated-9.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "animated-10", name: "Twinkle Knight", tier: "animated", price: 1888, background: "url('/feed-banners/animated-10.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-1", name: "Bubblegum Pawn", tier: "cute", price: 488, background: "url('/feed-banners/cute-1.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-2", name: "Heart Queen", tier: "cute", price: 528, background: "url('/feed-banners/cute-2.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-3", name: "Strawberry Check", tier: "cute", price: 568, background: "url('/feed-banners/cute-3.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-4", name: "Pastel Castle", tier: "cute", price: 608, background: "url('/feed-banners/cute-4.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-5", name: "Cherry Knight", tier: "cute", price: 648, background: "url('/feed-banners/cute-5.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-6", name: "Candy Bishop", tier: "cute", price: 688, background: "url('/feed-banners/cute-6.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-7", name: "Starry Rook", tier: "cute", price: 728, background: "url('/feed-banners/cute-7.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-8", name: "Ribbon Royalty", tier: "cute", price: 768, background: "url('/feed-banners/cute-8.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-9", name: "Peach Pawn", tier: "cute", price: 828, background: "url('/feed-banners/cute-9.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "cute-10", name: "Moonlit Queen", tier: "cute", price: 888, background: "url('/feed-banners/cute-10.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-1", name: "Neon Robo Pawn", tier: "robot", price: 388, background: "url('/feed-banners/robot-1.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-2", name: "Cyber Queen", tier: "robot", price: 444, background: "url('/feed-banners/robot-2.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-3", name: "Circuit Knight", tier: "robot", price: 499, background: "url('/feed-banners/robot-3.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-4", name: "Holo Rook", tier: "robot", price: 555, background: "url('/feed-banners/robot-4.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-5", name: "Pixel Bishop", tier: "robot", price: 610, background: "url('/feed-banners/robot-5.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-6", name: "Quantum King", tier: "robot", price: 666, background: "url('/feed-banners/robot-6.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-7", name: "Chrome Castle", tier: "robot", price: 721, background: "url('/feed-banners/robot-7.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-8", name: "Astro Bot Pawn", tier: "robot", price: 777, background: "url('/feed-banners/robot-8.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-9", name: "Laser Queen", tier: "robot", price: 832, background: "url('/feed-banners/robot-9.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "robot-10", name: "Mecha Mate", tier: "robot", price: 888, background: "url('/feed-banners/robot-10.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-1", name: "Obsidian Knight", tier: "warrior", price: 688, background: "url('/feed-banners/warrior-1.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-2", name: "Storm Rook", tier: "warrior", price: 722, background: "url('/feed-banners/warrior-2.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-3", name: "Volt Bishop", tier: "warrior", price: 755, background: "url('/feed-banners/warrior-3.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-4", name: "Crimson Queen", tier: "warrior", price: 788, background: "url('/feed-banners/warrior-4.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-5", name: "Titan Pawn", tier: "warrior", price: 822, background: "url('/feed-banners/warrior-5.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-6", name: "Iron Castle", tier: "warrior", price: 855, background: "url('/feed-banners/warrior-6.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-7", name: "Thunder King", tier: "warrior", price: 888, background: "url('/feed-banners/warrior-7.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-8", name: "Phantom Check", tier: "warrior", price: 922, background: "url('/feed-banners/warrior-8.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-9", name: "Steel Vanguard", tier: "warrior", price: 955, background: "url('/feed-banners/warrior-9.webp') center / cover no-repeat", ink: "#ffffff" },
  { id: "warrior-10", name: "Solar Blade", tier: "warrior", price: 988, background: "url('/feed-banners/warrior-10.webp') center / cover no-repeat", ink: "#ffffff" },
];

export const feedBanner = (id?: string | null) => [...FEED_BANNERS, ...LEGACY_FEED_BANNERS].find((banner) => banner.id === id);
