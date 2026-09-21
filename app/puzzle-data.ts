export type DailyPuzzle = {
  id: string;
  title: string;
  theme: string;
  fen: string;
  solution: string;
  hint: string;
};

// A small, deterministic daily pack keeps the mode available offline from paid
// services. The server owns this same catalogue and validates every claim.
export const DAILY_PUZZLES: DailyPuzzle[] = [
  { id: "back-rank-1", title: "Close the back rank", theme: "Mate in one", fen: "7k/6pp/8/8/8/8/6PP/5RK1 w - - 0 1", solution: "f1f8", hint: "The rook can reach the eighth rank. The pawns block every escape." },
  { id: "queen-net-1", title: "Build the queen net", theme: "Mate in one", fen: "8/8/8/8/8/8/8/k1KQ4 w - - 0 1", solution: "d1a4", hint: "Use the queen on the long diagonal. Your king covers b1 and b2." },
  { id: "queen-net-2", title: "Diagonal delivery", theme: "Mate in one", fen: "8/8/8/8/8/8/8/k1K1Q3 w - - 0 1", solution: "e1a5", hint: "Look for a checking move to the a-file." },
  { id: "rook-wall-1", title: "Rook wall", theme: "Mate in one", fen: "8/8/8/8/8/1R6/8/k1K5 w - - 0 1", solution: "b3a3", hint: "Move the rook beside the king. Your king guards the escape squares." },
  { id: "queen-net-3", title: "Long range queen", theme: "Mate in one", fen: "8/8/8/8/8/6Q1/8/k1K5 w - - 0 1", solution: "g3a3", hint: "The third rank is open all the way to a3." },
  { id: "rook-wall-2", title: "Seal the third rank", theme: "Mate in one", fen: "8/8/8/8/8/3R4/8/k1K5 w - - 0 1", solution: "d3a3", hint: "A horizontal rook check leaves no flight square." },
  { id: "queen-net-4", title: "Queen sweep", theme: "Mate in one", fen: "8/8/8/8/5Q2/8/8/k1K5 w - - 0 1", solution: "f4a4", hint: "Sweep across the fourth rank." },
  { id: "rook-wall-3", title: "Fourth-rank finish", theme: "Mate in one", fen: "8/8/8/8/2R5/8/8/k1K5 w - - 0 1", solution: "c4a4", hint: "The rook belongs on a4." },
  { id: "queen-net-5", title: "Corner lockdown", theme: "Mate in one", fen: "8/8/7Q/8/8/8/8/k1K5 w - - 0 1", solution: "h6a6", hint: "Deliver the check from a6." },
  { id: "rook-wall-4", title: "Final file", theme: "Mate in one", fen: "8/8/8/8/8/7R/8/k1K5 w - - 0 1", solution: "h3a3", hint: "Travel along the open third rank." },
];
