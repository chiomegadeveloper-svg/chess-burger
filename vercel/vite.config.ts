import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.',import.meta.url)),
  publicDir: fileURLToPath(new URL('../public',import.meta.url)),
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: {'@': fileURLToPath(new URL('..',import.meta.url))},
  },
  build: {
    outDir: fileURLToPath(new URL('../vercel-dist',import.meta.url)),
    emptyOutDir: true,
  },
});
