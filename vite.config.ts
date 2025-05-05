import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import webExtension from 'vite-plugin-web-extension'; // Assicurati che la versione sia installata

export default defineConfig({
  plugins: [
    svelte(),
    webExtension({
      manifest: 'manifest.json',
    })
  ],

  build: {
    rollupOptions: {
       input: {         
         'manifest': 'manifest.json', // Spesso incluso qui per far processare il manifest
         'content-script-bundle': 'src/content-script.ts', // Nome del bundle per il content script
         'background': 'src/background.ts', // Nome del bundle per il background script
         'popup': 'src/popup/popup.ts', // Nome del bundle per lo script del popup
         'injected-ui-bundle': 'src/blocker/injected-ui.ts' // Nome del bundle per l'UI iniettata
       },
       output: {
           // Queste opzioni controllano come i file compilati vengono nominati nell'output
           chunkFileNames: '[name].js', // Per chunk di codice condiviso (se Vite li crea)
           entryFileNames: '[name].js', // Per i tuoi entry points principali definiti sopra
           assetFileNames: 'assets/[name].[ext]' // Per asset come CSS, immagini, ecc.
       }
    }
  }
});