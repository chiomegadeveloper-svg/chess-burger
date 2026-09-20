import { Chess } from "chess.js";
import type {GameMeta} from './match-actions';

export const TIME_CONTROLS = [
  { id: "1+0", group: "Bullet", label: "1 min", seconds: 60, increment: 0 },
  { id: "1+1", group: "Bullet", label: "1 + 1", seconds: 60, increment: 1 },
  { id: "2+1", group: "Bullet", label: "2 + 1", seconds: 120, increment: 1 },
  { id: "3+0", group: "Blitz", label: "3 min", seconds: 180, increment: 0 },
  { id: "3+2", group: "Blitz", label: "3 + 2", seconds: 180, increment: 2 },
  { id: "5+0", group: "Blitz", label: "5 min", seconds: 300, increment: 0 },
  { id: "10+0", group: "Rapid", label: "10 min", seconds: 600, increment: 0 },
  { id: "10+5", group: "Rapid", label: "10 + 5", seconds: 600, increment: 5 },
  {
    id: "15+10",
    group: "Rapid",
    label: "15 + 10",
    seconds: 900,
    increment: 10,
  },
];
export function timeControl(id: string) {
  const control = TIME_CONTROLS.find((t) => t.id === id);
  if (!control) throw Error("Choose a valid time control.");
  return control;
}
export function winDelta(
  winnerCbr: number,
  loserCbr: number,
  nextStreak: number,
) {
  return (
    8 +
    (nextStreak >= 4 ? 2 : 0) +
    (Math.abs(winnerCbr - loserCbr) > 10 ? Math.floor(loserCbr * 0.1) : 0)
  );
}
export function gameFromPgn(pgn: string) {
  const chess = new Chess();
  if (pgn) chess.loadPgn(pgn);
  return chess;
}
export function boardResult(chess: Chess): "white" | "black" | "draw" | null {
  return chess.isCheckmate()
    ? chess.turn() === "w"
      ? "black"
      : "white"
    : chess.isDraw()
      ? "draw"
      : null;
}
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a.lat * rad) *
              Math.cos(b.lat * rad) *
              Math.sin(dlng / 2) ** 2,
        ),
      ),
    )
  );
}
export type ArenaPlayer = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  country_code: string;
  cbr: number;
  ocbr?: number;
  gold_points: number;
  wins: number;
  losses: number;
  win_streak: number;
  rank?: number;
};
export type MatchReaction = { emote: string; at: number };
export type ArenaMatch = {
  id: string;
  host_id: string;
  white_id: string;
  black_id: string | null;
  invite_to: string | null;
  code: string;
  control: string;
  status: "waiting" | "active" | "finished" | "cancelled";
  pgn: string;
  white_ms: number;
  black_ms: number;
  last_tick: number;
  version: number;
  result: "white" | "black" | "draw" | null;
  white_cbr: number;
  black_cbr: number;
  rating_applied: number;
  created_at: number;
  reactions?: string;
  game_meta?: GameMeta;
  white?: ArenaPlayer;
  black?: ArenaPlayer;
  server_now?: number;
  rating_changes?: Record<string, number>;
  gold_changes?: Record<string, number>;
};
