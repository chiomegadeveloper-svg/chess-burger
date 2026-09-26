export type AvatarFrame = { id: string; name: string; tier: "basic" | "premium"; index: number };

const basics = ["Pawn Crest", "Twin Knights", "Bishop Jewel", "Castle Guard", "Queen Tiara", "King Crown", "Checkered Crown", "Pawn Laurels", "Chess Clock", "Knight Gambit"];
const premiums = ["Royal Checkmate", "Diamond Queen", "Storm Knights", "Violet Bishop", "Obsidian Castle", "Celestial Gambit", "Platinum Checkmate", "Emerald Grandmaster", "Ruby Royalty", "Golden Champion"];

export const AVATAR_FRAMES: AvatarFrame[] = [
  ...basics.map((name, index) => ({ id: `basic-${index + 1}`, name, tier: "basic" as const, index })),
  ...premiums.map((name, index) => ({ id: `premium-${index + 1}`, name, tier: "premium" as const, index })),
];
export const avatarFrame = (id: string | null | undefined) => AVATAR_FRAMES.find(frame => frame.id === id);
export const AVATAR_FRAME_PRICES = { 7: 58, 21: 108, 30: 158 } as const;
export type AvatarFrameDays = keyof typeof AVATAR_FRAME_PRICES;
