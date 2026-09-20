import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

// A local-only fixture. It never authenticates, requests GPS, or contacts a DB.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {alias: {'./arena-client': fileURLToPath(new URL('./mock-arena.ts', import.meta.url))}},
  server: {host: '127.0.0.1', port: 4179, strictPort: true},
});
