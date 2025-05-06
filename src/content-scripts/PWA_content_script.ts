console.log("PWA Bridge Content Script: Iniettato nella pagina.");

// Ascolta i messaggi provenienti dal Background Script dell'estensione (per PWA)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("PWA Bridge Content Script: Messaggio ricevuto dal Background:", request.type, request.payload);

    // IMPORTANTE: Qui puoi filtrare i messaggi se necessario,
    // ma in generale, inoltra i messaggi destinati alla PWA.

    // Inoltra il messaggio al codice JavaScript della PWA (nella tab)
    // Specificare l'origine è importante per sicurezza!
    // window.location.origin è l'origine della pagina dove è iniettato lo script (cioè la PWA)
    window.postMessage({
        type: request.type, // Tipo di messaggio dal background (es. 'USAGE_UPDATE', 'LIMIT_REACHED')
        payload: request.payload, // Il payload dal background
        source: 'TTT_EXTENSION_BRIDGE' // Identifica la fonte
    }, window.location.origin); // Assicurati che l'origine corrisponda a quella della PWA

    // Se il background script si aspetta una risposta a questo messaggio, inviala (raro per notifiche)
    // sendResponse({ status: 'message forwarded' });
    // Restituisci true se sendResponse è asincrona
    // return true;
});

// Opzionale: Se la PWA deve inviare messaggi che non sono gestiti da chrome.runtime.onMessageExternal
// (ad esempio, se esternally_connectable non è sufficiente o per flussi specifici),
// la PWA può inviare messaggi a *questo* content script via window.postMessage,
// e questo content script li inoltrerà al background via chrome.runtime.sendMessage
/*
window.addEventListener('message', (event) => {
    // IMPORTANTE: Controlla l'origine del messaggio per sicurezza!
    // L'origine deve essere quella della tua PWA.
    if (event.origin !== window.location.origin || !event.data || event.data.source !== 'TTT_PWA_CLIENT') {
        return; // Ignora messaggi non dalla PWA o non formattati correttamente
    }

    const message = event.data;
    console.log("PWA Bridge Content Script: Messaggio ricevuto dal client PWA:", message.type, message.payload);

    // Inoltra il messaggio al Background Script
    chrome.runtime.sendMessage({
        type: message.type, // Tipo di messaggio dalla PWA
        payload: message.payload // Payload dalla PWA
        // Non includere 'source' per evitare confusione nel background
    }, (response) => {
         if (chrome.runtime.lastError) {
             console.error("PWA Bridge Content Script: Errore invio messaggio a background:", chrome.runtime.lastError.message);
             // Puoi inviare una risposta di errore alla PWA se necessario
             // window.postMessage({ type: message.type + '_ERROR', error: chrome.runtime.lastError.message }, event.origin);
         } else {
             console.log("PWA Bridge Content Script: Risposta ricevuta da background:", response);
             // Puoi inviare la risposta del background alla PWA se necessario
             // window.postMessage({ type: message.type + '_RESPONSE', payload: response }, event.origin);
         }
    });
});
*/