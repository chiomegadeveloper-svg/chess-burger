import type { CSSProperties } from "react";

export type BoardTheme = {
  id: string;
  name: string;
  group: "included" | "theme" | "color";
  light: string;
  dark: string;
  frame: string;
  accent: string;
};

export const BOARD_THEME_PRICES = { 7: 28, 21: 78, 30: 98 } as const;
export type BoardRentalDays = keyof typeof BOARD_THEME_PRICES;
export const DEFAULT_BOARD_IDS = ["slate", "classic", "wood", "bubble-gum", "jungle"] as const;

export const BOARD_THEMES: BoardTheme[] = [
  { id: "slate", name: "Chess Burger", group: "included", light: "#e1e3e6", dark: "#778996", frame: "#53606b", accent: "#64d6e3" },
  { id: "classic", name: "Classic Green", group: "included", light: "#f4e8c9", dark: "#63945a", frame: "#486b3f", accent: "#72aa73" },
  { id: "wood", name: "Warm Wood", group: "included", light: "#f0d5a5", dark: "#9a603b", frame: "#704225", accent: "#c89360" },
  { id: "meta-blue", name: "Meta Blue", group: "included", light: "#e8edf2", dark: "#0e2d52", frame: "#174579", accent: "#64cce9" },
  { id: "bubble-gum", name: "Bubble Gum", group: "included", light: "#ffe3e5", dark: "#f176a4", frame: "#d52670", accent: "#ff9fc3" },
  { id: "robotic", name: "Robotic", group: "theme", light: "#c9d9df", dark: "#355967", frame: "#162e3c", accent: "#4ee5ed" },
  { id: "cyanotype-glass", name: "Cyanotype Glass", group: "theme", light: "#c9f2fb", dark: "#2775a8", frame: "#103b67", accent: "#7deaff" },
  { id: "dark-warlock", name: "Dark Warlock", group: "theme", light: "#a695bb", dark: "#382245", frame: "#24132f", accent: "#dc8dff" },
  { id: "emerald-glass", name: "Emerald Glass", group: "theme", light: "#c5f5dc", dark: "#197453", frame: "#0a4835", accent: "#7bf6b4" },
  { id: "cody-ramey", name: "Cody Ramey", group: "theme", light: "#f8f5ef", dark: "#443d39", frame: "#111111", accent: "#f3c99f" },
  { id: "jungle", name: "Jungle", group: "included", light: "#e5d3a0", dark: "#45764a", frame: "#315036", accent: "#b2dc70" },
  { id: "black-white", name: "Black and White", group: "color", light: "#f5f6f7", dark: "#21272e", frame: "#30363c", accent: "#ccd6dc" },
  { id: "wood-texture", name: "Wood Texture", group: "color", light: "#efcf9e", dark: "#915734", frame: "#61361e", accent: "#dbad70" },
  { id: "maroon-pink", name: "Maroon and Light Pink", group: "color", light: "#f7d4df", dark: "#75334c", frame: "#572639", accent: "#f38da9" },
  { id: "sunset", name: "Sunset", group: "color", light: "#ffe5b3", dark: "#cf694b", frame: "#963d3d", accent: "#ffbf70" },
  { id: "black-cyan", name: "Black and Light Cyan", group: "color", light: "#baf4f5", dark: "#1a232b", frame: "#101b22", accent: "#4ce5eb" },
];

export const boardTheme = (id: string) => BOARD_THEMES.find(theme => theme.id === id);
export const boardThemeStyle = (theme: BoardTheme): CSSProperties => ({
  "--board-light": theme.light,
  "--board-dark": theme.dark,
  "--board-frame": theme.frame,
  "--board-accent": theme.accent,
} as CSSProperties);
