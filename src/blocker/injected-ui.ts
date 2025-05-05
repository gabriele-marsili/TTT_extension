import Blocker from './Blocker.svelte';

// Trova il punto di mount creato dal content script
const mountPoint = document.getElementById('ttt-block-extension-ui');

if (mountPoint) {
    // Monta il componente Svelte
    const app = new Blocker({
        target: mountPoint,
        // Potresti passare delle props qui se necessario
        // props: { siteUrl: window.location.href }
    });
} else {
    console.error('Punto di mount per UI di blocco non trovato.');
}