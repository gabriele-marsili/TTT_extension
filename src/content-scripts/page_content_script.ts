import { mount } from "svelte";
import { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
import Blocker from "../injected-ui/Blocker.svelte";

const prefisso = "[PWA content script] "
let bridgePort_pageContentScript: chrome.runtime.Port | null = null

// --- Stato UI Content Script ---
let isBlockingUIInjected = false;
let currentBlockingRule: TimeTrackerRuleObj | null = null;
let currentTheme: 'light' | 'dark' = 'light';

// Sezione per l'iniezione della UI (concept Svelte)
const BLOCKING_UI_MOUNT_POINT_ID = 'ttt-block-extension-ui';
let blockingUIMountPoint: HTMLDivElement | null = null;

// Variabile per mantenere l'istanza Svelte montata
let svelteBlockerInstance: any | null = null;

// --- Gestione Comunicazione (Background Script) ---
function connectBridgePort_pageContentScript() {
    if (bridgePort_pageContentScript) {
        console.warn(prefisso + "bridge port already connected")
    }

    console.log(prefisso + "Tentativo di connessione a bridge port...");
    bridgePort_pageContentScript = chrome.runtime.connect({ name: 'TTT_CONTENT_SCRIPT_BRIDGE' });

    //ascolta i messaggi dal backrgound dell'estensione
    bridgePort_pageContentScript.onMessage.addListener((message) => {
        console.log(prefisso + 'message by backrgound (ext) in CONTENT SCRIPT bridge :', message);

        switch (message.type) {
            case 'IS_BLACKLISTED_RESPONSE': // responso al messaggio iniziale di check blacklist all'avvio pagina
                handleBlacklistedSiteStatus(message.payload.isBlacklisted, message.payload.rule);
                break;
            case 'SITE_BLACKLISTED': // Messaggio quando il limite viene raggiunto *mentre* la pagina è aperta
                console.log("blacklisting site ",message.payload.rule.site_or_app_name);
                currentTheme = message.payload.theme || 'light'; // Aggiorna il tema corrente
                handleBlacklistedSiteStatus(true, message.payload.rule);
                break;
            case 'BLACKLIST_RESET': // Messaggio quando la blacklist viene resettata giornalmente
                handleBlacklistReset();
                break;
            case 'USAGE_UPDATE': // Il background invia periodicamente gli aggiornamenti (se PWA è aperta)
                console.log('Content Script: Ricevuto aggiornamento usage dal background (ignorato per logica UI)');
                break;
            default:
                console.warn('Content Script: Messaggio di tipo sconosciuto ricevuto dal background:', message.type);
                break;
        }


        //invio a --> PWA con window.postmessage


    });

    bridgePort_pageContentScript.onDisconnect.addListener(() => {
        console.warn(prefisso + 'Porta al background disconnessa. Tentativo di riconnessione...');
        bridgePort_pageContentScript = null; // Reset della porta
        // Implementa un retry con back-off esponenziale qui
        setTimeout(connectBridgePort_pageContentScript, 1000); // Riprova dopo 1 secondo
        // Puoi aggiungere un contatore di tentativi e un limite
    });
}


// Funzione per inviare messaggi al background script
function sendMessageToBackground(type: string, payload?: any) {
    try {
        if(!bridgePort_pageContentScript){
            connectBridgePort_pageContentScript()
        }

        bridgePort_pageContentScript!.postMessage({type, payload})        
    } catch (error) {
        console.error(prefisso+'Errore nell\'invio del messaggio al background:', error);
    }
}


// --- Logica UI di Blocco ---

// Gestisce lo stato di blacklist del sito corrente
function handleBlacklistedSiteStatus(isBlacklisted: boolean, rule?: TimeTrackerRuleObj) {
    const currentUrl = window.location.href;
    console.log(`Content Script: Stato blacklist per ${currentUrl}: ${isBlacklisted}`, rule);

    if (isBlacklisted) {
        currentBlockingRule = rule || null; // Memorizza la regola, se disponibile
        console.log('Content Script: Sito blacklisted. Iniettando UI di blocco...');
        showBlockingUI(currentUrl, currentBlockingRule);
    } else {
        console.log('Content Script: Sito non blacklisted (o sbloccato). Rimuovendo UI di blocco...');
        removeBlockingUI();
        currentBlockingRule = null; // Resetta la regola di blocco
    }
}

// Gestisce il reset giornaliero della blacklist
function handleBlacklistReset() {
    console.log('Content Script: Ricevuto Blacklist Reset. Rimuovendo UI di blocco se presente.');
    removeBlockingUI();
    currentBlockingRule = null; // Resetta la regola di blocco
    requestBlacklistStatus(); // Invia una nuova richiesta al background per lo stato attuale
}

// Inietta la UI di blocco nella pagina o la aggiorna
function showBlockingUI(url: string, rule: TimeTrackerRuleObj | null) {
    const props: {
        url: string;
        rule?: TimeTrackerRuleObj | null;
    } = { url: url, rule: rule }

    // Se l'UI è già iniettata, aggiorna semplicemente i dati nel componente Svelte
    if (isBlockingUIInjected && svelteBlockerInstance) {
        svelteBlockerInstance.$set(props);
        currentBlockingRule = rule; // Assicurati che lo stato interno sia aggiornato
        return;
    }

    // Se non è iniettata, procedi con l'iniezione
    console.log('Content Script: Iniezione nuova UI di blocco...');

    // Rimuovi qualsiasi istanza precedente o mount point in caso di stato inconsistente
    removeBlockingUI(); // Pulizia preventiva

    blockingUIMountPoint = document.createElement('div');
    blockingUIMountPoint.id = BLOCKING_UI_MOUNT_POINT_ID;
    // Applica la classe del tema al punto di mount
    blockingUIMountPoint.classList.add(currentTheme);

    // Stili base per coprire la pagina (saranno gestiti dal componente Svelte per colori e font)
    blockingUIMountPoint.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647; /* Massimo z-index possibile */
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
    `;

    document.body.appendChild(blockingUIMountPoint);
    isBlockingUIInjected = true;
    currentBlockingRule = rule; // Imposta la regola associata

    // Inietta le variabili CSS globali e il font Poppins nell'head della pagina
    const styleElementId = 'ttt-injected-theme-styles';
    if (!document.getElementById(styleElementId)) {
        const style = document.createElement('style');
        style.id = styleElementId;
        style.textContent = `
            /* Global variables from style.css for the theme */
            :root {
                --background-light: #fefefed7;
                --background-dark: #131212;
                --color-light: black;
                --color-dark: white;
                --accent-color-light: #10B981;
                --accent-color-dark: #34D399;
                --button-background-light: #ffffff00;
                --button-background-dark: #131212;
                --button-border-light: #15b680d4;
                --button-border-dark: #15b680d4;
                --shadow-light: 0px 4px 6px rgba(0, 0, 0, 0.352);
                --shadow-dark: 0px 4px 6px rgba(255, 255, 255, 0.375);
            }

            /* Theme application via classes (these will be on the mount point div) */
            .light {
                --background: var(--background-light);
                --color: var(--color-light);
                --accent-color: var(--accent-color-light);
                --button-background: var(--button-background-light);
                --button-border: var(--button-border-light);
                --shadow: var(--shadow-light);
                --text-color: black;
            }
            .dark {
                --background: var(--background-dark);
                --color: var(--color-dark);
                --accent-color: var(--accent-color-dark);
                --button-background: var(--button-background-dark);
                --button-border: var(--button-border-dark);
                --shadow: var(--shadow-dark);
                --text-color: white;
            }
        `;
        document.head.appendChild(style);
    }

    // Inietta Google Fonts Poppins
    const fontLinkElementId = 'ttt-injected-font-link';
    if (!document.getElementById(fontLinkElementId)) {
        const fontLink = document.createElement('link');
        fontLink.id = fontLinkElementId;
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
    }


    svelteBlockerInstance = mount(Blocker, { target: blockingUIMountPoint, props: props })


    // Impedisci lo scroll sulla pagina sottostante
    document.body.style.overflow = 'hidden';
}

// Rimuove la UI di blocco dalla pagina
function removeBlockingUI() {
    // Se è stata iniettata la UI Svelte e abbiamo l'istanza, smontala
    if (isBlockingUIInjected && svelteBlockerInstance) {
        console.log('Content Script: Smontaggio componente Svelte...');
        svelteBlockerInstance.$destroy();
        svelteBlockerInstance = null; // Resetta l'istanza
    }

    // Rimuovi il mount point dal DOM
    if (blockingUIMountPoint) {
        console.log('Content Script: Rimozione mount point UI di blocco...');
        blockingUIMountPoint.remove();
        blockingUIMountPoint = null;
    }

    // Rimuovi il tag <style> e <link> del font iniettati
    const styleElement = document.getElementById('ttt-injected-theme-styles');
    if (styleElement) {
        styleElement.remove();
    }
    const fontLink = document.getElementById('ttt-injected-font-link');
    if (fontLink) {
        fontLink.remove();
    }

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
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', requestBlacklistStatus);
} else {
    requestBlacklistStatus(); // DOM già pronto o quasi
}