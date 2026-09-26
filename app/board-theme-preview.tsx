"use client";
import { boardThemeStyle, type BoardTheme } from "./board-themes";
import "./board-themes.css";

const back = "rnbqkbnr";
const glyphs: Record<string, string> = { r: "♜", n: "♞", b: "♝", q: "♛", k: "♚", p: "♟" };

export function BoardThemePreview({ theme }: { theme: BoardTheme }) {
  return <div className={`board-preview board-preview-${theme.id}`} style={boardThemeStyle(theme)} role="img" aria-label={`${theme.name} board preview`}>
    <div className="board-preview-squares" aria-hidden="true">
      {Array.from({ length: 64 }, (_, index) => {
        const row = Math.floor(index / 8), col = index % 8;
        const piece = row === 0 || row === 7 ? back[col] : row === 1 || row === 6 ? "p" : "";
        return <span key={index} className={`${(row + col) % 2 ? "dark" : "light"} ${row < 2 ? "black" : "white"}`}>{piece && glyphs[piece]}</span>;
      })}
    </div>
  </div>;
}
