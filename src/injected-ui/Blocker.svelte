<script lang="ts">
    import { onMount } from "svelte";
    import { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
    import { PWA_URL, THEME_STORAGE_KEY } from "../types/userTypes";

    // Props passate dal content script
    export let url: string;
    export let rule: TimeTrackerRuleObj | null = null;
    let theme: "light" | "dark" = "light"; // Nuova prop per il tema

    let message: string;
    let actionButtonText: string;

    // Reactive declarations to update message and button text based on rule and theme
    $: {
        if (rule) {
            message = `Time limit reached for ${rule.site_or_app_name}. Daily limit: ${rule.minutesDailyLimit} minutes.`;
            actionButtonText = "Manage in TTT PWA";
        } else {
            // Messaggio di fallback se i dati della regola non sono disponibili o il sito è bloccato per un motivo sconosciuto
            message = `This site (${url}) is temporarily blocked.`;
            actionButtonText = "Go To TTT PWA";
        }
    }

    // Funzione chiamata al click sul pulsante
    function handleActionButtonClick() {
        console.log("Blocker UI: Redirecting to PWA.");
        if (window != null && window.top != null) {
            window.top.location.href = PWA_URL;
        }
    }

    function updateCurrentTheme() {
        chrome.storage.local.get(THEME_STORAGE_KEY, (result) => {
            if (result[THEME_STORAGE_KEY]) {
                theme = result[THEME_STORAGE_KEY];
                console.log("Popup Svelte: Loaded theme preference:", theme);
            } else {
                // Default to user's system preference if no preference is saved
                const prefersDark = window.matchMedia(
                    "(prefers-color-scheme: dark)",
                ).matches;
                theme = prefersDark ? "dark" : "light";
                console.log(
                    "Popup Svelte: No theme preference saved, defaulting to system preference:",
                    theme,
                );
            }
        });
    }

    // Opzionale: Aggiungi logica onMount/onDestroy se il componente ha bisogno
    // di fare setup o cleanup specifici non legati alla UI stessa.
    // import { onMount, onDestroy } from 'svelte';
    onMount(() => {
        updateCurrentTheme();
        console.log("Blocker mounted, theme " + theme);
    });
    // onDestroy(() => { console.log("Blocker destroyed"); });
</script>

<div class="block-container {theme}">
    <div class="block-message">
        {message}
    </div>
    <div class="blocked-url">
        {url}
    </div>
    <button
        on:click={handleActionButtonClick}
        class="baseButtonHigher elevated"
    >
        {actionButtonText}
    </button>
</div>

<style>
    /* Import TailwindCSS, presumendo sia processato durante il build per questo componente.
       Se non lo è, dovrai replicare manualmente gli stili specifici di Tailwind o usare le variabili.
       La linea @import "tailwindcss"; è qui solo come nota, ma non funzionerà direttamente
       se Tailwind non è compilato per questo componente Svelte. Gli stili sono stati replicati
       usando le variabili CSS globali iniettate dal content script. */

    .block-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        /* Questi colori saranno presi dalla classe `theme` impostata dal content script */
        background-color: var(--background);
        color: var(--color);
        z-index: 2147483647; /* Il più alto z-index possibile */
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: "Poppins", sans-serif; /* Usa Poppins se caricato dal content script o un fallback */
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto; /* Permetti lo scroll se il contenuto è troppo grande */
        transition:
            background-color 0.3s ease,
            color 0.3s ease; /* Transizione fluida per il cambio tema */
    }

    .block-message {
        font-size: 2em;
        margin-bottom: 20px;
        text-align: center;
        max-width: 90%;
        font-weight: 600; /* Rendi il messaggio più prominente */
    }

    .blocked-url {
        font-size: 1.2em;
        margin-bottom: 30px;
        color: var(--accent-color); /* Usa il colore accento per l'URL */
        word-break: break-all;
        padding: 0 20px;
        text-align: center;
        font-family: monospace; /* Monospace per gli URL */
    }

    /* Stili per il pulsante, che imitano direttamente .baseButtonHigher da style.css */
    button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        color: var(--color); /* Colore del testo dal tema */
        background: var(--button-background); /* Sfondo dal tema */
        border: 2px solid var(--button-border); /* Bordo dal tema */
        height: 40px; /* Altezza di .baseButtonHigher */
        padding: 0 15px;
        border-radius: 4px;
        font-size: 0.9rem;
        cursor: pointer;
        transition:
            background-color 0.3s ease,
            border-color 0.3s ease;
        text-align: center;
        min-width: 150px; /* Assicura una larghezza minima ragionevole */
        font-weight: 500;
    }

    button:hover {
        /* Questo hover hardcoded replica lo stile fornito per .baseButton:hover.
           Idealmente, potresti voler definire una nuova variabile in style.css per questo. */
        background-color: rgba(16, 185, 129, 0.305);
    }

    /* Imitando .elevated da style.css */
    .elevated {
        box-shadow: var(--shadow);
        transition: box-shadow 0.3s ease-in-out;
    }

    .elevated:hover {
        /* Usa il colore accento per l'ombra al passaggio del mouse, come suggerito */
        box-shadow: 0px 4px 6px var(--accent-color);
    }
</style>
