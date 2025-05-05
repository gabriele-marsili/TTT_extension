// Listener per messaggi dalla PWA
window.addEventListener('message', (event) => {
    // IMPORTANTE: Controlla l'origine del messaggio per sicurezza!
    // Non fidarti di messaggi da origini sconosciute.
    if (event.origin !== 'http://localhost:3000' /* || !event.data || !event.data.type */) { // Sostituisci con l'origine della tua PWA
        return;
    }

    const message = event.data;

    if (message.type === 'TTT_UPDATE_MONITORED_SITES') {
        console.log('Content Script: Ricevuti siti aggiornati dalla PWA', message.payload);
        // Invia i dati al background script
        chrome.runtime.sendMessage({
            type: 'UPDATE_MONITORED_SITES',
            payload: message.payload // payload dovrebbe contenere la lista siti con limiti
        });
    }
    // Aggiungi altri tipi di messaggi se la PWA invia altro
});

// Funzione per inviare messaggi alla PWA
function sendMessageToPWA(type, payload) {
    window.postMessage({ type, payload, source: 'TTT_EXTENSION' }, window.location.origin); // Specifica l'origine se possibile
}

// Esempio: Invia un messaggio alla PWA al caricamento (opzionale)
// sendMessageToPWA('EXTENSION_LOADED', { status: 'ready' });


// Listener per messaggi dal background script (per es. azioni da eseguire)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_RULE_ACTION') {
        console.log('Content Script: Ricevuta richiesta di eseguire regola', request.payload);
        handleRuleAction(request.payload); // Implementa questa funzione
        sendResponse({ status: 'action handled' });
    }
    // Aggiungi altri tipi di messaggi dal background
    if (request.type === 'IS_BLACKLISTED') {
        // Questo messaggio arriva quando si carica una pagina
        handleBlacklistedSite(request.payload); // Payload: true/false
        sendResponse({ status: 'checked' });
    }

    // Restituisci true se vuoi che sendResponse sia asincrona
    return true;
});

function handleRuleAction(ruleDetails) {
    const { ruleType, site, limit } = ruleDetails;
    const notificationMessage = `Hai superato il limite di ${limit} minuti per ${site}. Regola: ${ruleType}`;

    console.log(notificationMessage); // Notifica via console per ora

    // Qui implementerai le azioni specifiche in base a ruleType
    if (ruleType === 'notify & close' || ruleType === 'notify, close & block') {
        // Potresti voler mostrare una UI di notifica prima di chiudere
        alert(notificationMessage); // Notifica semplice via alert (blocca UI)
        window.close(); // Chiude la tab
    } else if (ruleType === 'only notify') {
        // Mostra una notifica non bloccante. Potresti iniettare un componente Svelte qui.
        alert(notificationMessage); // Notifica semplice via alert
    }
}

function handleBlacklistedSite(isBlacklisted) {
    if (isBlacklisted) {
        console.log('Content Script: Questo sito è nella blacklist.');
        // Qui inietti la tua UI di blocco Svelte o reindirizzi
        // Reindirizzare è difficile direttamente dal content script senza lampi
        // Iniettare un componente Svelte è più pulito
        injectBlockingUI(); // Implementa questa funzione
    } else {
        console.log('Content Script: Sito non in blacklist.');
        // Avvia il monitoraggio del focus per questa tab
        setupFocusMonitoring();
    }
}

function injectBlockingUI() {
    // Esempio concettuale di iniezione di un componente Svelte
    // Dovrai creare un App.svelte o Blocker.svelte per questo
    // E buildarlo separatamente con Vite, poi includerlo in web_accessible_resources
    console.log('Iniettando UI di blocco...');
    const body = document.body;
    if (body) {
        const mountPoint = document.createElement('div');
        mountPoint.id = 'ttt-block-extension-ui'; // ID univoco
        // Stili base per coprire la pagina
        mountPoint.style.position = 'fixed';
        mountPoint.style.top = '0';
        mountPoint.style.left = '0';
        mountPoint.style.width = '100%';
        mountPoint.style.height = '100%';
        mountPoint.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        mountPoint.style.zIndex = '99999'; // Alto z-index per coprire tutto
        mountPoint.style.display = 'flex';
        mountPoint.style.flexDirection = 'column';
        mountPoint.style.justifyContent = 'center';
        mountPoint.style.alignItems = 'center';
        mountPoint.style.fontSize = '24px';
        mountPoint.style.textAlign = 'center';
        body.appendChild(mountPoint);

        // Carica e monta il componente Svelte compilato
        // Questo richiede che 'injected-ui-bundle.js' sia buildato e disponibile
        // e dichiarato in web_accessible_resources.
        // Potrebbe essere necessario un approccio diverso a seconda del plugin Vite usato.
        // L'idea è che il bundle compilato (es. Blocker.svelte) venga importato o caricato dinamicamente qui
        // e montato sul mountPoint.
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected-ui-bundle.js'); // Path relativo a web_accessible_resources
        document.head.appendChild(script);

        // Il bundle 'injected-ui-bundle.js' conterrà il codice per trovare #ttt-block-extension-ui
        // e montare il componente Svelte Blocker.svelte al suo interno.
    }
}

// La PWA dovrebbe probabilmente inviare la lista dei siti e i limiti
// subito dopo che il content script segnala di essere pronto.