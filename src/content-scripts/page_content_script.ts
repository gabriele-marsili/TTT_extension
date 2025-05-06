import { TimeTrackerRuleObj } from "../types/timeTrackerTypes";

// --- Stato UI Content Script ---
let isBlockingUIInjected = false;
// Potrebbe essere utile memorizzare qui la regola che ha causato il blocco,
// in caso l'UI debba mostrare dettagli specifici o gestire interazioni.
let currentBlockingRule: TimeTrackerRuleObj | null = null;

// Sezione per l'iniezione della UI (concept Svelte)
const BLOCKING_UI_MOUNT_POINT_ID = 'ttt-block-extension-ui';
let blockingUIMountPoint: HTMLDivElement | null = null;

// Variabile per mantenere l'istanza Svelte montata
let svelteBlockerInstance: any | null = null; // Usiamo 'any' perché il tipo Blocker non è direttamente disponibile qui

// --- Gestione Comunicazione (Background Script) ---

// Listener per messaggi dal background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content Script: Messaggio ricevuto dal background', request.type, request.payload);

    switch (request.type) {
        case 'IS_BLACKLISTED_RESPONSE': //responso al messaggio iniziale di check blacklist all'avvio pagina
            handleBlacklistedSiteStatus(request.payload.isBlacklisted, request.payload.rule);
            // Non inviare sendResponse, il background non la aspetta più per questo tipo di messaggio
            break;
        case 'SITE_BLACKLISTED': // Messaggio quando il limite viene raggiunto *mentre* la pagina è aperta
            // Questo sito è ora blacklisted. Mostra la UI di blocco.
            handleBlacklistedSiteStatus(true, request.payload.rule);
            break;
        case 'BLACKLIST_RESET': // Messaggio quando la blacklist viene resettata giornalmente
            handleBlacklistReset();
            break;
        case 'USAGE_UPDATE': // Il background invia periodicamente gli aggiornamenti (se PWA è aperta)
             // Questo messaggio potrebbe non essere strettamente necessario per il content script,
             // a meno che tu non voglia visualizzare un contatore in tempo reale nella pagina.
             // Per ora, lo logghiamo ma non facciamo nulla di specifico, perché il tracking è nel background.
            console.log('Content Script: Ricevuto aggiornamento usage dal background (ignorato per logica UI)');
            break;
        default:
            console.warn('Content Script: Messaggio di tipo sconosciuto ricevuto dal background:', request.type);
            break;
    }

    // Restituisci true solo se *realmente* usi sendResponse in modo asincrono.
    // Per i tipi sopra, non stiamo inviando risposte asincrone.
    // return true; // Rimosso
});

// Funzione per inviare messaggi al background script
// (Al momento l'unico messaggio inviato dal content script è REQUEST_BLACKLIST_STATUS)
function sendMessageToBackground(type: string, payload?: any) {
    try {
        chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
         // Questo errore può accadere se il background script non è in esecuzione (es. estensione disabilitata/aggiornata)
        console.error('Content Script: Errore nell\'invio del messaggio al background:', error);
    }
}


// --- Logica UI di Blocco ---

// Gestisce lo stato di blacklist del sito corrente
function handleBlacklistedSiteStatus(isBlacklisted: boolean, rule?: TimeTrackerRuleObj) {
    const currentUrl = window.location.href;
    console.log(`Content Script: Stato blacklist per ${currentUrl}: ${isBlacklisted}`, rule);

    if (isBlacklisted) {
        // Il sito è nella blacklist o ha appena raggiunto il limite
        currentBlockingRule = rule || null; // Memorizza la regola, se disponibile
        console.log('Content Script: Sito blacklisted. Iniettando UI di blocco...');
        showBlockingUI(currentUrl, currentBlockingRule);
    } else {
        // Il sito NON è nella blacklist (o non lo è più)
        console.log('Content Script: Sito non blacklisted (o sbloccato). Rimuovendo UI di blocco...');
        removeBlockingUI();
        currentBlockingRule = null; // Resetta la regola di blocco
        // Nota: Il monitoraggio del tempo inizia e si ferma nel background script
        // basato sugli eventi chrome.tabs e sullo stato blacklist.
        // Il content script non deve avviare/fermare il monitoraggio qui.
    }
}

// Gestisce il reset giornaliero della blacklist
function handleBlacklistReset() {
    console.log('Content Script: Ricevuto Blacklist Reset. Rimuovendo UI di blocco se presente.');
    removeBlockingUI();
    currentBlockingRule = null; // Resetta la regola di blocco
    // Dopo il reset, il background controllerà di nuovo lo stato blacklist
    // quando la tab attiva cambia o l'URL viene aggiornato.
    // Potrebbe essere utile fare un nuovo check esplicito qui per sicurezza,
    // ma gli eventi onActivated/onUpdated dovrebbero coprire la maggior parte dei casi.
    // Invia una nuova richiesta al background per lo stato attuale
    requestBlacklistStatus();
}


// Inietta la UI di blocco nella pagina o la aggiorna
function showBlockingUI(url: string, rule: TimeTrackerRuleObj | null) {
    // Se l'UI è già iniettata, aggiorna semplicemente i dati nel componente Svelte
    if (isBlockingUIInjected && svelteBlockerInstance && (window as any).TTTBlockUI && (window as any).TTTBlockUI.update) {
        console.log('Content Script: UI di blocco già iniettata. Aggiornamento dati...');
        (window as any).TTTBlockUI.update({ url, rule });
        currentBlockingRule = rule; // Assicurati che lo stato interno sia aggiornato
        return;
    }

    // Se non è iniettata, procedi con l'iniezione
    console.log('Content Script: Iniezione nuova UI di blocco...');

    // Rimuovi qualsiasi istanza precedente o mount point in caso di stato inconsistente
    removeBlockingUI(); // Pulizia preventiva

    blockingUIMountPoint = document.createElement('div');
    blockingUIMountPoint.id = BLOCKING_UI_MOUNT_POINT_ID;

    // Stili base per coprire la pagina (assicurati che siano sufficientemente alti come z-index)
     blockingUIMountPoint.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.98);
        z-index: 2147483647; /* Massimo z-index possibile */
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: sans-serif;
        color: #333;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
     `;

    document.body.appendChild(blockingUIMountPoint);
    isBlockingUIInjected = true;
    currentBlockingRule = rule; // Imposta la regola associata

    // Inietta lo script compilato del bundle Svelte
    const scriptUrl = chrome.runtime.getURL('injected-ui-bundle.js'); // Assicurati che il nome file sia corretto
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.type = 'text/javascript'; // Specifica il tipo

    // Usa script.onload per sapere quando il bundle è caricato e le funzioni esposte sono disponibili
    script.onload = () => {
        // Controlla che il namespace e la funzione di mount siano disponibili
        if ((window as any).TTTBlockUI && (window as any).TTTBlockUI.mount) {
            console.log('Content Script: Bundle UI di blocco caricato. Montaggio componente...');
            // Chiama la funzione di mount esposta dal bundle iniettato
            svelteBlockerInstance = (window as any).TTTBlockUI.mount(blockingUIMountPoint, { url: window.location.href, rule: currentBlockingRule });
            console.log('Content Script: Componente Svelte montato.', svelteBlockerInstance);
        } else {
            console.error('Content Script: Bundle UI di blocco caricato, ma namespace/funzione di mount non trovati.');
             // Gestisci l'errore mostrando un messaggio di fallback HTML
             showFallbackBlockingUI(url, rule);
        }
    };
     script.onerror = (e) => {
        console.error('Content Script: Errore caricamento bundle UI di blocco:', e);
        isBlockingUIInjected = false; // Resetta lo stato
        currentBlockingRule = null;
        removeBlockingUI(); // Rimuovi il mount point vuoto/errato
        // Mostra un messaggio di fallback HTML
        showFallbackBlockingUI(url, rule);
     };

    document.head.appendChild(script);

    // Impedisci lo scroll sulla pagina sottostante
    document.body.style.overflow = 'hidden';

    // Nota: La logica di chiusura tab immediata basata sulla regola
    // dovrebbe essere gestita dal componente Svelte stesso nel suo handler
    // del pulsante o in un lifecycle hook se vuoi un countdown automatico.
}

// Mostra un messaggio di blocco semplice in HTML se il bundle Svelte fallisce
function showFallbackBlockingUI(url: string, rule: TimeTrackerRuleObj | null) {
     // Rimuovi UI Svelte errata se presente
     removeBlockingUI();

     console.log('Content Script: Mostrando fallback UI di blocco...');

    blockingUIMountPoint = document.createElement('div');
    blockingUIMountPoint.id = BLOCKING_UI_MOUNT_POINT_ID; // Riutilizza lo stesso ID

    // Stili base (simili a showBlockingUI ma senza logica Svelte)
     blockingUIMountPoint.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.98);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: sans-serif;
        color: #333;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
     `;

     // Contenuto HTML semplice di fallback
     blockingUIMountPoint.innerHTML = `
         <div>
             <h1>Questo sito è bloccato</h1>
             <p>Hai superato il tempo limite consentito.</p>
             ${rule ? `<p>Regola: ${rule.site_or_app_name} (Limite: ${rule.minutesDailyLimit} minuti)</p>` : ''}
             <p>URL: ${url}</p>
             <button id="ttt-fallback-gotopwa">Vai a TTT PWA</button>
         </div>
     `;

     document.body.appendChild(blockingUIMountPoint);
     isBlockingUIInjected = true; // Considera anche il fallback iniettato

     // Aggiungi listener al pulsante di fallback
     const goToPwaButton = blockingUIMountPoint.querySelector('#ttt-fallback-gotopwa');
     if(goToPwaButton) {
         goToPwaButton.addEventListener('click', () => {
              console.log("Fallback UI: Reindirizzamento alla PWA.");
              if (window != null && window.top != null) {
                 window.top.location.href = "http://localhost:3000/timetracker"; // *** Sostituisci con l'URL corretto della tua PWA ***
              }
         });
     }

     // Impedisci lo scroll
     document.body.style.overflow = 'hidden';
}


// Rimuove la UI di blocco dalla pagina
function removeBlockingUI() {
    // Se è stata iniettata la UI Svelte e abbiamo l'istanza, smontala
    if (isBlockingUIInjected && svelteBlockerInstance && (window as any).TTTBlockUI && (window as any).TTTBlockUI.unmount) {
        console.log('Content Script: Smontaggio componente Svelte...');
        (window as any).TTTBlockUI.unmount();
        svelteBlockerInstance = null; // Resetta l'istanza
    }

    // Rimuovi il mount point dal DOM (questo rimuove sia l'UI Svelte che il fallback HTML)
    if (blockingUIMountPoint) {
        console.log('Content Script: Rimozione mount point UI di blocco...');
        blockingUIMountPoint.remove();
        blockingUIMountPoint = null;
    }

    // Rimuovi lo script iniettato del bundle se presente e necessario (spesso non è strettamente necessario rimuoverlo)
    // const script = document.head.querySelector(`script[src="${chrome.runtime.getURL('injected-ui-bundle.js')}"]`);
    // if (script) {
    //     script.remove();
    // }

    // Resetta lo stato interno
    isBlockingUIInjected = false;
    currentBlockingRule = null;

    // Ripristina lo scroll
    document.body.style.overflow = '';

    console.log('Content Script: UI di blocco rimossa.');
}



// --- Inizializzazione Content Script ---

// Funzione per richiedere lo stato blacklist al background appena il content script viene iniettato
function requestBlacklistStatus() {
    console.log('Content Script: Richiesta stato blacklist al background per', window.location.href);
    sendMessageToBackground('REQUEST_BLACKLIST_STATUS', { url: window.location.href });
}


// Esegui la richiesta iniziale al background script al caricamento del content script
// Assicurati che il DOM sia pronto se la UI di blocco deve essere iniettata immediatamente.
// 'loading' significa che il documento sta ancora caricando.
// 'interactive' significa che il documento è stato completamente caricato e analizzato,
// ma le sub-risorse (immagini, script secondari) potrebbero essere ancora in fase di caricamento.
// 'complete' significa che la pagina è completamente caricata, incluse tutte le risorse.
// Per iniettare UI che copre tutto, 'interactive' o 'complete' sono solitamente sicuri.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', requestBlacklistStatus);
} else {
    requestBlacklistStatus(); // DOM già pronto o quasi
}
