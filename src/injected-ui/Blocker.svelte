<script lang="ts">
    import {TimeTrackerRuleObj} from '../types/timeTrackerTypes'

    // Dichiarazione delle props passate dal content script tramite injected-ui.ts
    export let url: string;
    export let rule: TimeTrackerRuleObj | null = null; // Può essere null se c'è un errore o logica diversa

    let message = "This site is temporarily blocked.";
    let actionButtonText = "Go To TimeTracker (TTT PWA)";

    // Aggiorna il messaggio e il testo del pulsante quando le props (in particolare la rule) cambiano
    $: if (rule) {
        message = `Tempo esaurito per ${rule.site_or_app_name}. Limite giornaliero: ${rule.minutesDailyLimit} minuti.`;
        // Puoi personalizzare ulteriormente il messaggio in base a rule.rule qui se vuoi
        if (
            rule.rule === "notify & close" ||
            rule.rule === "notify, close & block"
        ) {
            // Non mostriamo un pulsante "Chiudi Tab" automatico, è meglio che l'utente clicchi un pulsante
            // o che la chiusura avvenga dopo un timer gestito dalla UI stessa se specificato.
            // Per ora, il pulsante porta alla PWA.
            actionButtonText = "Gestisci in TTT PWA";
        } else if (rule.rule === "only notify") {
            actionButtonText = "Gestisci in TTT PWA";
        }
    } else {
        // Messaggio di fallback se la regola non è disponibile (es. errore di caricamento o blacklisted per altra ragione)
        message = `Questo sito (${url}) è temporaneamente bloccato.`;
        actionButtonText = "Vai a TTT PWA";
    }

    // Funzione chiamata al click sul pulsante
    function handleActionButtonClick() {
        if (
            rule &&
            (rule.rule === "notify & close" ||
                rule.rule === "notify, close & block")
        ) {
            // Se la regola prevede la chiusura, chiudi la tab.
            // È importante che il content script che ha iniettato questa UI sia ancora vivo.
            // Questo chiuderà la tab dove è iniettato il content script.
            console.log("Blocker UI: Chiusura tab richiesta dalla regola.");
            window.close();
        } else {
            // Altrimenti, reindirizza alla PWA.
            console.log("Blocker UI: Reindirizzamento alla PWA.");
            // Assicurati che l'origine della PWA sia corretta.
            // Questo reindirizzerà la tab corrente.
            if (window != null && window.top != null) {
                window.top.location.href = "http://localhost:3000/timetracker"; // *** Sostituisci con l'URL corretto della tua PWA ***
            }
        }
    }

    // Opzionale: Aggiungi logica onMount/onDestroy se il componente ha bisogno
    // di fare setup o cleanup specifici non legati alla UI stessa.
    // onMount(() => { console.log("Blocker mounted"); });
    // onDestroy(() => { console.log("Blocker destroyed"); });
</script>

<div class="block-container">
    <div class="block-message">
        {message}
    </div>
    <div class="blocked-url">
        {url}
    </div>
    {#if rule && (rule.rule === "notify & close" || rule.rule === "notify, close & block")}
        <button on:click={handleActionButtonClick}>Chiudi Tab</button>
    {:else}
        <button on:click={handleActionButtonClick}>{actionButtonText}</button>
    {/if}
</div>

<style>
    /* Mantieni gli stili forniti, assicurandoti che coprano l'intera viewport */
    .block-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(
            255,
            255,
            255,
            0.98
        ); /* Sfondo semi-trasparente */
        /* Usiamo uno z-index molto alto per essere sicuri di coprire quasi tutto. */
        /* chrome.runtime.getURL z-index max è 2147483647 */
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: sans-serif;
        color: #333;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto; /* Permetti lo scroll se il contenuto è troppo grande */
    }

    .block-message {
        font-size: 2em;
        margin-bottom: 20px;
        text-align: center;
        max-width: 90%; /* Evita che il messaggio sia troppo largo su schermi piccoli */
    }

    .blocked-url {
        font-size: 1.2em;
        margin-bottom: 30px;
        color: #e53935; /* Rosso per l'URL */
        word-break: break-all; /* Evita overflow per URL lunghi */
        padding: 0 20px;
        text-align: center;
    }

    button {
        padding: 10px 20px;
        font-size: 1.1em;
        cursor: pointer;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 5px;
        transition: background-color 0.3s ease;
        margin-top: 20px; /* Spazio sopra il pulsante */
    }

    button:hover {
        background-color: #0056b3;
    }
</style>
