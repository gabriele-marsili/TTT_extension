const extensionId = chrome.runtime.id;
const prefisso = "[PWA content script] "
console.log(prefisso + "Extension ID is", extensionId);

let bridgePort: chrome.runtime.Port | null = null

function connectBridgePort() {
    if (bridgePort) {
        console.warn(prefisso + "bridge port already connected")
    }

    console.log(prefisso + "Tentativo di connessione a bridge port...");
    bridgePort = chrome.runtime.connect({ name: 'TTT_PWA_BRIDGE' });

    //ascolta i messaggi dal backrgound dell'estensione
    bridgePort.onMessage.addListener((message) => {
        console.log(prefisso + 'message by backrgound (ext) in PWA bridge :', message.type, message.payload);

        //invio a --> PWA con window.postmessage
        /*ASK_RULES_FROM_EXT
        */
        window.postMessage({
            type: message.type,
            payload: message.payload,
            requestId: message.requestId,
            source: 'TTT_EXTENSION_BRIDGE'
        }, window.location.origin);
    });

    bridgePort.onDisconnect.addListener(() => {
        console.warn(prefisso + 'Porta al background disconnessa. Tentativo di riconnessione...');
        bridgePort = null; // Reset della porta
        // Implementa un retry con back-off esponenziale qui
        setTimeout(connectBridgePort, 1000); // Riprova dopo 1 secondo
        // Puoi aggiungere un contatore di tentativi e un limite
    });
}

window.postMessage({
    type: 'TTT_EXTENSION_ID_BROADCAST', // A unique message type
    payload: extensionId,
    source: 'TTT_EXTENSION_BRIDGE'
}, window.location.origin); // Send only to the PWA's origin


//listener for messages by PWA (-> to ext backrgound)
window.addEventListener('message', (event) => {
    //oriign check
    if (event.origin !== window.location.origin || !event.data || event.data.source !== 'TTT_PWA_CLIENT') {        
        return; // Ignora messaggi non dalla PWA o non formattati correttamente
    }

    const messageFromPwa = event.data;
    console.log(prefisso+"Messaggio ricevuto dal client PWA:", messageFromPwa.type, messageFromPwa.payload);
    try {
        if (!bridgePort) {
            connectBridgePort()
        }

        //inoltro il messaggio ottenuto da PWA tramite bridgeport a background estensione:
        const messageForBackground = {
            type: messageFromPwa.type,
            payload: messageFromPwa.payload,
            requestId: messageFromPwa.requestId
        }

        bridgePort!.postMessage(messageForBackground)
    } catch (error) {
        console.error(prefisso+"error in send message to background script of ext by pwa content script:\n", error)
    }
});

connectBridgePort()
