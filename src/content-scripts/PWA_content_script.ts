console.log("PWA Bridge Content Script: Iniettato nella pagina.");

// Get the extension ID
const extensionId = chrome.runtime.id;
console.log("PWA Content Script: Extension ID is", extensionId);


window.postMessage({
    type: 'TTT_EXTENSION_ID_BROADCAST', // A unique message type
    payload: extensionId,
    source: 'TTT_EXTENSION_BRIDGE'
}, window.location.origin); // Send only to the PWA's origin

// Ascolta i messaggi provenienti dal Background Script dell'estensione (-> per PWA)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("PWA Bridge Content Script: Messaggio ricevuto dal Background:", request.type, request.payload);

    window.postMessage({
        type: 'TTT_EXTENSION_ID_BROADCAST', // A unique message type
        payload: extensionId,
        source: 'TTT_EXTENSION_BRIDGE'
    }, window.location.origin); // Send only to the PWA's origin


    // Inoltra il messaggio al codice JavaScript della PWA (nella tab)
    // Specificare l'origine è importante per sicurezza!
    // window.location.origin è l'origine della pagina dove è iniettato lo script (cioè la PWA)
    window.postMessage({
        extensionId: extensionId,
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
window.addEventListener('message', (event) => {
    // IMPORTANTE: Controlla l'origine del messaggio per sicurezza!
    // L'origine deve essere quella della tua PWA.
    if (event.origin !== window.location.origin || !event.data || event.data.source !== 'TTT_PWA_CLIENT') {
        return; // Ignora messaggi non dalla PWA o non formattati correttamente
    }

    const messageFromPwa = event.data;
    console.log("PWA Bridge Content Script: Messaggio ricevuto dal client PWA:", messageFromPwa.type, messageFromPwa.payload);

    // Inoltra il messaggio al Background Script dell'ext
    try {

        chrome.runtime.sendMessage({
            type: messageFromPwa.type, // Tipo di messaggio dalla PWA
            payload: messageFromPwa.payload,// Payload dalla PWA
            requestId: messageFromPwa.requestId
        }, (responseFromBackground) => {
            console.log("PWA Bridge Content Script: Risposta ricevuta da background per request ID", messageFromPwa.requestId, ":", responseFromBackground);

            if (chrome.runtime.lastError) {
                console.error("PWA Bridge Content Script: Errore invio messaggio a background (callback):", chrome.runtime.lastError.message);
                // Inoltra l'errore alla PWA usando postMessage, mantenendo l'ID della richiesta
                window.postMessage({
                    type: messageFromPwa.type + '_RESPONSE', // Tipo di risposta
                    requestId: messageFromPwa.requestId,   // ID della richiesta originale
                    error: chrome.runtime.lastError.message, // Messaggio di errore
                    source: 'TTT_EXTENSION_BRIDGE'         // Identifica la fonte
                }, event.origin);
            } else {
                // Inoltra la risposta del background alla PWA usando postMessage, mantenendo l'ID della richiesta
                window.postMessage({
                    type: messageFromPwa.type + '_RESPONSE', // Tipo di risposta
                    requestId: messageFromPwa.requestId,   // ID della richiesta originale
                    payload: responseFromBackground,      // La risposta ricevuta dal background
                    source: 'TTT_EXTENSION_BRIDGE'         // Identifica la fonte
                }, event.origin);
            }
        });
    } catch (error) {
        console.error("error in send message to background script of ext by pwa content script:\n",error)
    }

    // Restituisci true qui se ti aspetti che sendResponse() venga chiamata.
    // È buona pratica se la callback di sendMessage può essere asincrona (anche se per CS->BG è solitamente sincrona).
    return true;
});
