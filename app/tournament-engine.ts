export type Entrant = {
  id: number;
  name: string;
  userId?: string;
  rating: number;
};
export type Result = "1-0" | "0-1" | "1/2-1/2" | "bye" | "";
export type Pairing = { white: number; black: number; result: Result };
export type TournamentRewards = {
  champion: number;
  second: number;
  third: number;
};
export type Tournament = {
  id: string;
  code: string;
  title: string;
  hostId: string;
  hostName: string;
  rounds: number;
  players: Entrant[];
  history: Pairing[][];
  mode: "offline" | "api";
  status: "registration" | "playing" | "completed";
  updatedAt: string;
  goldRewards?: TournamentRewards;
  cbrRewards?: TournamentRewards;
  startsAt?: string;
  finishedAt?: string;
  goldAwarded?: boolean;
  revision?: number;
};
export function standings(t: Tournament) {
  const rows = t.players.map((p) => ({
    ...p,
    score: 0,
    opponents: [] as number[],
    colors: [] as string[],
    byes: 0,
    buchholz: 0,
  }));
  const map = new Map(rows.map((p) => [p.id, p]));
  for (const round of t.history)
    for (const g of round) {
      const w = map.get(g.white),
        b = map.get(g.black);
      if (!w) continue;
      if (g.black === 0) {
        if (g.result === "bye") {
          w.score++;
          w.byes++;
        }
        continue;
      }
      if (!b) continue;
      w.opponents.push(b.id);
      b.opponents.push(w.id);
      w.colors.push("w");
      b.colors.push("b");
      if (g.result === "1-0") w.score++;
      if (g.result === "0-1") b.score++;
      if (g.result === "1/2-1/2") {
        w.score += 0.5;
        b.score += 0.5;
      }
    }
  for (const p of rows)
    p.buchholz = p.opponents.reduce(
      (s, id) => s + (map.get(id)?.score ?? 0),
      0,
    );
  return rows.sort(
    (a, b) =>
      b.score - a.score ||
      b.buchholz - a.buchholz ||
      b.rating - a.rating ||
      a.id - b.id,
  );
}
export function assertReady(t: Tournament) {
  if (t.status === "completed" || t.history.length >= t.rounds)
    throw new Error("All rounds are complete.");
  if (t.players.length < 3)
    throw new Error("At least three players are required to start a tournament.");
  if (t.startsAt && Date.now() < new Date(t.startsAt).getTime())
    throw new Error("The tournament has not reached its scheduled start time.");
  if (t.history.at(-1)?.some((g) => !g.result))
    throw new Error("Record every result before pairing the next round.");
}
// Club Swiss fallback: no repeat opponents, score proximity, rotating byes and color preference.
// This is intentionally not described as a FIDE-certified Dutch engine.
export function pairOffline(t: Tournament): Pairing[] {
  assertReady(t);
  const rows = standings(t);
  let visits = 0;
  type Row = (typeof rows)[number];
  const balance = (p: Row) =>
    p.colors.reduce((s, c) => s + (c === "w" ? 1 : -1), 0);
  const colorCost = (p: Row, c: string) =>
    Math.abs(balance(p) + (c === "w" ? 1 : -1)) +
    (p.colors.slice(-2).join("") === c + c ? 20 : 0);
  const oriented = (a: Row, b: Row) =>
    colorCost(a, "w") + colorCost(b, "b") <=
    colorCost(a, "b") + colorCost(b, "w")
      ? { white: a.id, black: b.id, result: "" as Result }
      : { white: b.id, black: a.id, result: "" as Result };
  function solve(left: Row[]): Pairing[] | null {
    if (!left.length) return [];
    if (++visits > 100000)
      throw new Error(
        "Pairing search limit reached. Export TRF for an arbiter or use the online engine.",
      );
    const a = left[0];
    const choices = left
      .slice(1)
      .filter((b) => !a.opponents.includes(b.id))
      .sort(
        (b, c) =>
          Math.abs(a.score - b.score) - Math.abs(a.score - c.score) ||
          Math.abs(balance(a) + balance(b)) -
            Math.abs(balance(a) + balance(c)) ||
          b.rating - c.rating ||
          b.id - c.id,
      );
    for (const b of choices) {
      const rest = solve(left.filter((p) => p !== a && p !== b));
      if (rest) return [oriented(a, b), ...rest];
    }
    return null;
  }
  const byeCandidates =
    rows.length % 2 ? [...rows].reverse().filter((p) => !p.byes) : [null];
  for (const bye of byeCandidates) {
    const pairs = solve(rows.filter((p) => p !== bye));
    if (pairs)
      return bye
        ? [...pairs, { white: bye.id, black: 0, result: "bye" }]
        : pairs;
  }
  throw new Error(
    "No pairing without repeat opponents or repeated byes exists. End the event or ask the arbiter to review it.",
  );
}
export function validatePairs(t: Tournament, value: unknown): Pairing[] {
  if (!Array.isArray(value)) throw new Error("Invalid pairing response.");
  const seen = new Set<number>(),
    valid = new Set(t.players.map((p) => p.id));
  let byes = 0;
  const table = standings(t);
  const pairs = value.map((raw) => {
    const p = raw as Record<string, unknown>;
    let white = Number(p.w ?? p.white),
      black = Number(p.b ?? p.black);
    if (white === 0 && black > 0) {
      white = black;
      black = 0;
    }
    if (
      !Number.isInteger(white) ||
      !Number.isInteger(black) ||
      !valid.has(white) ||
      seen.has(white) ||
      white === black ||
      (black !== 0 && (!valid.has(black) || seen.has(black)))
    )
      throw new Error(
        "Pairing response contains an invalid or repeated player.",
      );
    seen.add(white);
    if (black) seen.add(black);
    else byes++;
    const row = table.find((p) => p.id === white)!;
    if ((black && row.opponents.includes(black)) || (!black && row.byes))
      throw new Error("Pairing response repeats an opponent or bye.");
    return { white, black, result: (black ? "" : "bye") as Result };
  });
  if (seen.size !== valid.size || byes !== t.players.length % 2)
    throw new Error("Pairing response does not include every player.");
  return pairs;
}
export function exportTrf(t: Tournament) {
  const table = standings(t);
  const lines = [
    "012 " + t.title.replace(/[\r\n]/g, " "),
    "XXR " + t.rounds,
    "XXC white1",
  ];
  for (const p of [...t.players].sort((a, b) => a.id - b.id)) {
    const row = table.find((r) => r.id === p.id)!;
    const chars = Array(89).fill(" ");
    const put = (start: number, text: string) =>
      [...text].forEach((c, i) => (chars[start + i] = c));
    put(0, "001");
    put(4, String(p.id).padStart(4));
    put(
      14,
      p.name
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "")
        .slice(0, 33)
        .padEnd(33),
    );
    put(48, String(p.rating).padStart(4));
    put(80, row.score.toFixed(1).padStart(4));
    put(85, String(table.indexOf(row) + 1).padStart(4));
    let line = chars.join("") + " ";
    for (const round of t.history) {
      const g = round.find((g) => g.white === p.id || g.black === p.id);
      if (!g || !g.result)
        throw new Error("Record all results before exporting TRF.");
      const white = g.white === p.id;
      const opponent = white ? g.black : g.white;
      const score =
        g.result === "bye"
          ? "U"
          : g.result === "1/2-1/2"
            ? "="
            : (g.result === "1-0") === white
              ? "1"
              : "0";
      line +=
        " " +
        String(opponent).padStart(4) +
        " " +
        (opponent ? (white ? "w" : "b") : "-") +
        " " +
        score +
        " ";
    }
    lines.push(line);
  }
  return lines.join("\r\n");
}
export function parseTournament(value: unknown): Tournament {
  const t = value as Tournament;
  if (
    !t ||
    typeof t.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(t.id) ||
    typeof t.code !== "string" ||
    !/^[A-Z0-9]{8}$/.test(t.code) ||
    typeof t.title !== "string" ||
    !t.title.trim() ||
    t.title.length > 100 ||
    typeof t.hostId !== "string" ||
    typeof t.hostName !== "string" ||
    !["offline", "api"].includes(t.mode) ||
    !["registration", "playing", "completed"].includes(t.status) ||
    !Number.isInteger(t.rounds) ||
    t.rounds < 1 ||
    t.rounds > 23 ||
    !Array.isArray(t.players) ||
    t.players.length > 100 ||
    !Array.isArray(t.history) ||
    t.history.length > t.rounds
  )
    throw new Error("Invalid tournament file.");
  const rewards = t.goldRewards ?? { champion: 0, second: 0, third: 0 };
  if (
    ![rewards.champion, rewards.second, rewards.third].every(
      (amount) => Number.isInteger(amount) && amount >= 0 && amount <= 10000,
    )
  )
    throw new Error("Invalid Gold rewards.");
  t.goldRewards = rewards;
  const cbrRewards = t.cbrRewards ?? { champion: 0, second: 0, third: 0 };
  if (![cbrRewards.champion, cbrRewards.second, cbrRewards.third].every(amount => Number.isInteger(amount) && amount >= 0 && amount <= 1000))
    throw new Error("Invalid CBR rewards.");
  t.cbrRewards = cbrRewards;
  if (t.startsAt && !Number.isFinite(new Date(t.startsAt).getTime())) throw new Error("Invalid tournament start time.");
  t.goldAwarded = !!t.goldAwarded;
  const ids = new Set<number>();
  for (const p of t.players) {
    if (
      !Number.isInteger(p.id) ||
      p.id < 1 ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 60 ||
      !Number.isInteger(p.rating) ||
      p.rating < 0 ||
      p.rating > 4000
    )
      throw new Error("Invalid player data.");
    ids.add(p.id);
  }
  for (const round of t.history) {
    if (!Array.isArray(round)) throw new Error("Invalid round.");
    for (const g of round)
      if (
        !["", "bye", "1-0", "0-1", "1/2-1/2"].includes(g.result) ||
        !ids.has(g.white) ||
        (g.black !== 0 && !ids.has(g.black))
      )
        throw new Error("Invalid game.");
  }
  return t;
}
