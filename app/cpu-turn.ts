import type { Chess } from "chess.js";

// A reply from a stopped search may be stale or illegal for the current board.
// Always finish the CPU turn with a legal move while the game is still active.
export function chooseCpuMove(chess: Chess, uci: string | null, level: number, random = Math.random): boolean {
  const legal = chess.moves({ verbose: true });
  if (!legal.length) return false;
  const chance = [0.78, 0.6, 0.42, 0.22, 0][level - 1] ?? 0;
  const engineMove = uci && legal.find(move =>
    `${move.from}${move.to}${move.promotion ?? ""}` === uci,
  );
  const choice = engineMove && random() >= chance
    ? engineMove
    : legal[Math.floor(random() * legal.length)];
  chess.move(choice);
  return true;
}
