import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// base is '/' for local dev and root hosts (Cloudflare/Netlify).
// On GitHub Pages the workflow sets VITE_BASE to '/<repo-name>/'.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [vue(), tailwindcss()],
});
