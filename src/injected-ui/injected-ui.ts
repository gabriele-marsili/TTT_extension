// src/blocker/injected-ui.ts
import Blocker from './Blocker.svelte';
import type { TimeTrackerRuleObj } from '../types/timeTrackerTypes';

// Variabile per mantenere l'istanza del componente Svelte montato
let svelteBlockerInstance: Blocker | null = null;

/**
 * Monta il componente Blocker Svelte su un elemento del DOM.
 * @param mountElement L'elemento del DOM dove montare il componente.
 * @param data Dati da passare al componente (es. rule, url).
 * @returns L'istanza del componente montato.
 */
function mountBlocker(mountElement: HTMLElement, data: { url: string, rule: TimeTrackerRuleObj | null }): Blocker {
    console.log('Injected UI: Montaggio Blocker Svelte su', mountElement, 'con dati:', data);
    svelteBlockerInstance = new Blocker({
        target: mountElement,
        props: data // Passa i dati come props
    });
    return svelteBlockerInstance;
}

/**
 * Aggiorna le props del componente Blocker Svelte montato.
 * @param data Dati aggiornati da passare al componente.
 */
function updateBlocker(data: { url: string, rule: any | null }): void {
    if (svelteBlockerInstance && svelteBlockerInstance.$set) {
        console.log('Injected UI: Aggiornamento props Blocker Svelte con dati:', data);
        svelteBlockerInstance.$set(data);
    } else {
        console.warn('Injected UI: Tentativo di aggiornare Blocker non montato o senza metodo $set.');
    }
}

/**
 * Smonta (distrugge) il componente Blocker Svelte montato.
 */
function unmountBlocker(): void {
    if (svelteBlockerInstance && svelteBlockerInstance.$destroy) {
        console.log('Injected UI: Smontaggio Blocker Svelte.');
        svelteBlockerInstance.$destroy();
        svelteBlockerInstance = null; // Resetta l'istanza
    } else {
        console.warn('Injected UI: Tentativo di smontare Blocker non montato.');
    }
}

// Espone le funzioni nel global scope (window) sotto un namespace specifico
// per renderle accessibili dal content script.
(window as any).TTTBlockUI = {
    mount: mountBlocker,
    update: updateBlocker,
    unmount: unmountBlocker
};

console.log('Injected UI: Script bundle caricato. Funzioni TTTBlockUI esposte.');

// Nota: Questo script non fa nulla al caricamento *immediatamente*.
// Aspetta che il content script chiami le funzioni esposte (TTTBlockUI.mount, ecc.).