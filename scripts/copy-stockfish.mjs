import { copyFile, mkdir } from "node:fs/promises";

const source = new URL("../node_modules/stockfish/bin/", import.meta.url);
const destination = new URL("../public/stockfish/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"])
  await copyFile(new URL(file, source), new URL(file, destination));
await copyFile(new URL("../node_modules/stockfish/Copying.txt", import.meta.url), new URL("COPYING.txt", destination));
