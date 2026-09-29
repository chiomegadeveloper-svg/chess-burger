import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {APP_VERSION} from '../app/app-version';

const buildId = `${Date.now()}-${randomUUID()}`;
const outputDirectory = fileURLToPath(new URL('../vercel-dist/',import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.',import.meta.url)),
  publicDir: fileURLToPath(new URL('../public',import.meta.url)),
  plugins: [react(), {
    name: 'chess-burger-deployment-version',
    apply: 'build',
    async closeBundle() {
      await writeFile(new URL('../vercel-dist/version.json',import.meta.url),JSON.stringify({buildId,version:APP_VERSION}));
      const sw = new URL('../vercel-dist/sw.js',import.meta.url);
      await writeFile(sw,(await readFile(sw,'utf8')).replace('__BUILD_ID__',buildId));
    },
  }],
  define: {__CHESS_BURGER_BUILD_ID__: JSON.stringify(buildId)},
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: {'@': fileURLToPath(new URL('..',import.meta.url))},
  },
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
  },
});
