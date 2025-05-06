// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import webExtension from 'vite-plugin-web-extension'; // Assicurati di usare il plugin corretto

export default defineConfig({
  plugins: [
    svelte(), // Plugin per Svelte
    webExtension({
      manifest: 'src/manifest.json',
    })
  ]
});