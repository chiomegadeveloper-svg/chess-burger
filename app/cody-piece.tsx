const columns: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

export function CodyPiece({ color, type }: { color: string; type: string }) {
  const column = columns[type];
  if (column === undefined || (color !== "w" && color !== "b")) return null;
  return <span className="cody-piece" data-color={color} style={{ backgroundPosition: `${column * 20}% ${color === "w" ? 100 : 0}%` }} aria-hidden="true" />;
}
