import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// `npm run dev` serves the front end on :5173 and proxies /api (including WebSockets) to
// `wrangler dev` on :8787. `npm run build` writes ./dist, which the Worker serves as static assets.
export default defineConfig({
  plugins: [svelte()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { proxy: { '/api': { target: 'http://localhost:8787', ws: true } } },
});
