export type AvatarFrame = { id: string; name: string; tier: "basic" | "premium" | "vanguard"; image?: string; index: number };

const basics = ["Pawn Crest", "Twin Knights", "Bishop Jewel", "Castle Guard", "Queen Tiara", "King Crown", "Checkered Crown", "Pawn Laurels", "Chess Clock", "Knight Gambit"];
const premiums = ["Royal Checkmate", "Diamond Queen", "Storm Knights", "Violet Bishop", "Obsidian Castle", "Celestial Gambit", "Platinum Checkmate", "Emerald Grandmaster", "Ruby Royalty", "Golden Champion"];

const vanguardNames = ["Obsidian Horns", "Ember Swords", "Amethyst Dragon", "Frostbone Crown", "Emerald Wolf", "Molten Shield", "Raven Talons", "Bloodhorn", "Cyan Gothic", "Emerald Serpent", "Crimson Knight", "Magenta Bat", "Amber Axes", "Sapphire Thorns", "Ruby Dragon", "Violet Gauntlets", "Emerald Spears", "Shattered Crown", "Warlord Horns", "Royal Vanguard"];
const vanguardFiles = ["01-obsidian-horns-with-crimson-ruby", "02-black-iron-swords-with-red-embers", "03-gunmetal-dragon-wings-with-violet-amethyst", "04-dark-silver-skeletal-crown-with-icy-blue-gems", "05-black-steel-wolf-fangs-with-emerald-gems", "06-charcoal-spiked-shield-with-molten-orange", "07-raven-feathers-and-iron-talons-with-purple-gems", "08-dark-bronze-demon-horns-with-blood-red-gems", "09-blackened-steel-gothic-arches-with-cyan-gems", "10-obsidian-serpent-coils-with-green-gems", "11-black-iron-chains-and-crimson-knight-helmet-crest", "12-dark-gunmetal-bat-wings-and-magenta-jewels", "13-weathered-black-steel-axe-blades-with-amber-gems", "14-dark-silver-thorn-crown-with-sapphire-jewels", "15-obsidian-dragon-scales-with-ruby-jewels", "16-charcoal-armored-gauntlets-with-violet-glow", "17-black-steel-spearheads-with-emerald-glow", "18-dark-iron-shattered-crown-with-icy-turquoise", "19-blackened-bronze-warlord-horns-with-molten-red", "20-obsidian-royal-vanguard-crown-with-gold-trim-and-crimson-gems"];

export const AVATAR_FRAMES: AvatarFrame[] = [
  ...basics.map((name, index) => ({ id: `basic-${index + 1}`, name, tier: "basic" as const, index })),
  ...premiums.map((name, index) => ({ id: `premium-${index + 1}`, name, tier: "premium" as const, index })),
  ...vanguardNames.map((name, index) => ({ id: `vanguard-${index + 1}`, name, tier: "vanguard" as const, index, image: `/avatar-frames/dark-vanguard/${vanguardFiles[index]}.webp` })),
];
export const avatarFrame = (id: string | null | undefined) => AVATAR_FRAMES.find(frame => frame.id === id);
export const AVATAR_FRAME_PRICES = { 7: 58, 21: 108, 30: 158 } as const;
export type AvatarFrameDays = keyof typeof AVATAR_FRAME_PRICES;
