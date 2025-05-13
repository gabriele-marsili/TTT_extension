import { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
import { userDBentry } from "../types/userTypes";

// --- Stato Globale ---
let timeTrackerRules: TimeTrackerRuleObj[] = [];
let activeTabId: number | null = null;
let activeTabUrl: string | undefined = undefined;
let trackingInterval: any = null;
let pwaUpdateInterval: any = null;
let saveStateTimeout: any = null; // Per il salvataggio debounce/ritardato
let ruleRequestMap: Map<string, (response?: any) => void> = new Map()
const prefisso = "[Ext backrgound script] "
// Utilizziamo un Set per blacklistedSites per ricerche più veloci
let blacklistedSites: Set<string> = new Set(); // Salverà gli identificatori dei siti (es. hostname o dominio)
let pwaOrigin: string | undefined = undefined;
let userInfo: userDBentry | undefined = undefined

// --- Costanti ---
const TRACKING_INTERVAL_MS = 1000; // Controlla ogni secondo
const PWA_UPDATE_INTERVAL_MS = 60000; // Invia aggiornamenti alla PWA ogni minuto
const SAVE_STATE_DELAY_MS = 5000; // Ritardo per il salvataggio dello stato (debounce)

// Mappe per tenere traccia delle porte attive, con la tab ID come chiave
let bridgePWAport: chrome.runtime.Port | null = null
const bridgeContentScriptPortMap = new Map<number, chrome.runtime.Port>();

// --- Gestione Stato (Carica/Salva) ---

// Carica lo stato all'avvio dell'estensione
async function loadState() {
    const storedData = await chrome.storage.local.get(['timeTrackerRules', 'blacklistedSites', 'pwaOrigin', "userInfo"]);
    userInfo = storedData.userInfo as userDBentry || undefined
    timeTrackerRules = storedData.timeTrackerRules || [];
    // Converti l'array salvato in un Set
    blacklistedSites = new Set(storedData.blacklistedSites || []);
    pwaOrigin = storedData.pwaOrigin;
    console.log('Background: Stato caricato:', { timeTrackerRules, blacklistedSites: Array.from(blacklistedSites), pwaOrigin });

    // Assicurati che i tempi rimanenti siano trattati come numeri
    timeTrackerRules.forEach(rule => {
        if (typeof rule.remainingTimeMin !== 'number') {
            rule.remainingTimeMin = rule.minutesDailyLimit; // Resetta se non è un numero valido (es. primo avvio)
        }
    });

    // Avvia il timer di salvataggio dopo aver caricato lo stato iniziale
    scheduleSaveState();
}

// Pianifica un salvataggio dello stato dopo un breve ritardo
function scheduleSaveState() {
    if (saveStateTimeout) {
        clearTimeout(saveStateTimeout);
    }
    saveStateTimeout = setTimeout(async () => {
        await saveState();
    }, SAVE_STATE_DELAY_MS);
}

// Salva lo stato nel local storage
async function saveState() {
    // Salva il Set come Array
    await chrome.storage.local.set({ timeTrackerRules, blacklistedSites: Array.from(blacklistedSites), pwaOrigin });
    //console.log('Background: Stato salvato'); // Meno log per non intasare la console

    const data = { timeTrackerRules, blacklistedSites: Array.from(blacklistedSites), pwaOrigin }
    chrome.runtime.sendMessage({ type: 'UPDATED_STATE', data: data }, (response) => {
        if (chrome.runtime.lastError) {
            // L'errore è normale se il popup non è aperto in quel momento
            console.warn(prefisso + ' Error sending UPDATED_STATE to popup:', chrome.runtime.lastError.message);
        }
    });
}

// Salva lo stato immediatamente (usato per eventi importanti come limite raggiunto)
async function saveStateImmediate() {
    if (saveStateTimeout) {
        clearTimeout(saveStateTimeout); // Annulla qualsiasi salvataggio programmato
    }
    await saveState();
    //console.log('Background: Stato salvato immediatamente.');
}

function updateRules(rules: TimeTrackerRuleObj[]) {
    // Mantieni i tempi rimanenti esistenti se le regole corrispondono, altrimenti usa il limite
    const updatedRules: TimeTrackerRuleObj[] = rules.map((newRule: TimeTrackerRuleObj) => {
        const existingRule = timeTrackerRules.find(r => r.id === newRule.id);
        return {
            ...newRule,
            //mantiene il remaining time se :
            //remaining time new rule > remaining time existing rule && la differenza è di meno di 2m
            remainingTimeMin: existingRule && existingRule.site_or_app_name === newRule.site_or_app_name && existingRule.minutesDailyLimit === newRule.minutesDailyLimit && newRule.minutesDailyLimit - existingRule.remainingTimeMin <= 2
                ? existingRule.remainingTimeMin
                : newRule.remainingTimeMin
        };
    });
    timeTrackerRules = updatedRules;//aggiorna lista locale

    const activeRuleSiteNames = new Set<string>(
        rules.map(rule => rule.site_or_app_name)
    );

    blacklistedSites.forEach(site => {
        if (!activeRuleSiteNames.has(site)) {
            blacklistedSites.delete(site);
        }
    });


    console.log('Background: Regole di tracking aggiornate dalla PWA:', timeTrackerRules);
    scheduleSaveState(); // Pianifica il salvataggio dopo l'aggiornamento
    checkAndNotifyBlacklist(); // Controlla se la tab attiva è blacklisted con le nuove regole

    //response to waiting requests
    for (let entry of ruleRequestMap.entries()) {
        let id = entry[0]
        let sendResponseCallback = entry[1]
        sendResponseCallback({ timeTrackerRules: timeTrackerRules })
        ruleRequestMap.delete(id);
    }

}

function sendErrorLogToExtUI(errorMessage: string) {
    const errMsg = {
        type: "ERROR_LOG",
        errorMessage
    }
    chrome.runtime.sendMessage(errMsg, (response) => {
        if (chrome.runtime.lastError) {
            console.warn(prefisso + ' Error sending ERROR_LOG to popup:', chrome.runtime.lastError.message);
        }
    });
}

/**
 * send ask rules from ext request to pwa content script that will bridge it to PWA
 * @returns void
 */
function askRulesToPWA() {
    if (!bridgePWAport) {
        console.error(prefisso + "bridgePWAport is null in ask rules to pwa")
        sendErrorLogToExtUI("Open PWA to update and syncronize rules")
        return;
    }

    bridgePWAport!.postMessage({ type: "ASK_RULES_FROM_EXT" })
}

// --- Gestione Comunicazione (Content Script, PWA) ---

//litener for PWA bridge port && content script bridge port 
chrome.runtime.onConnect.addListener(port => {
    // Ottieni l'ID della tab da cui proviene la connessione
    const tabId = port.sender?.tab?.id;

    console.log(prefisso + `Connessione in arrivo. Nome porta: "${port.name}" | tab id : ${tabId}`);

    // Controlla il nome della porta per determinare il tipo di connessione
    if (tabId) {
        if (port.name === 'TTT_PWA_BRIDGE') { //messages from pwa content script (inoltrati da PWA)        
            if (!bridgePWAport) {
                bridgePWAport = port;
            }

            console.log(prefisso + `Porta PWA_BRIDGE aperta per Tab ID: ${tabId}.`);

            port.onMessage.addListener(async request => {
                console.log(prefisso + `(PWA Port ${tabId}): Ricevuto`, request.type, request.payload);
                switch (request.type) {
                    case 'PWA_READY':
                        // Il content script PWA è pronto
                        if (port.sender?.origin) {
                            pwaOrigin = port.sender.origin; // Salva l'origine della PWA
                            await chrome.storage.local.set({ pwaOrigin });
                            console.log('Background: PWA Origin set to:', pwaOrigin);
                        }

                        if (request.payload) {
                            userInfo = request.payload as userDBentry;
                            await chrome.storage.local.set({ userInfo, lastUserInfoUpdateTimestamp: Date.now() });
                            // notifica popup
                            // send message to popup svelte to notify the user login
                            chrome.runtime.sendMessage({ type: 'USER_LOGGED_IN_VIA_PWA' }, (response) => {
                                if (chrome.runtime.lastError) {
                                    // L'errore è normale se il popup non è aperto in quel momento
                                    console.warn(prefisso + ' Error sending USER_LOGGED_IN_VIA_PWA to popup:', chrome.runtime.lastError.message);
                                }
                            });
                        }

                        break;
                    case 'UPDATE_TIME_TRACKER_RULES':
                        // La PWA sta inviando un aggiornamento delle regole
                        if (Array.isArray(request.payload.rules)) {
                            // Qui aggiorni il tuo stato globale `timeTrackerRules` nel background
                            // e poi chiami la tua funzione `updateRules`
                            updateRules(request.payload.rules);
                        } else {
                            console.error(prefisso + "Invalid payload in update time tracker rules")
                        }
                        break;
                    case 'REQUEST_TIME_TRACKER_RULES': // La PWA richiede le regole attuali dall'estensione
                        console.log('Background: Ricevuta richiesta regole da PWA.');
                        const msgContent = {
                            type: "REQUEST_TIME_TRACKER_RULES_RESPONSE",
                            payload: timeTrackerRules,
                            requestId: request.requestId
                        }
                        port.postMessage(msgContent); // Invia le regole correnti al PWA content script (bridge) che le inoltra alla PWA

                        break;
                    default:
                        console.warn(prefisso + ` (PWA Port ${tabId}): Tipo di messaggio sconosciuto:`, request.type);
                }
            });

            port.onDisconnect.addListener(() => {
                console.log(prefisso + `Porta PWA_BRIDGE chiusa per Tab ID: ${tabId}.`);
            });

        } else if (port.name === 'TTT_CONTENT_SCRIPT_BRIDGE') {//messages from content script        

            bridgeContentScriptPortMap.set(tabId, port); // Memorizza la porta
            console.log(prefisso + `Porta NORMAL_PAGE_BRIDGE aperta per Tab ID: ${tabId}.`);

            port.onMessage.addListener(async request => {
                console.log(`Background (Normal Page Port ${tabId}): Ricevuto`, request.type, request.payload);
                switch (request.type) {
                    case 'REQUEST_BLACKLIST_STATUS':
                        // La pagina normale richiede lo stato di blacklist
                        const urlToCheckNormal = request.payload.url as string;
                        const comparableRuleNormal = getComparableSiteIdentifier(urlToCheckNormal);
                        let isBlacklistedNormal = comparableRuleNormal ? blacklistedSites.has(comparableRuleNormal.site_or_app_name) : false;

                        if (comparableRuleNormal && comparableRuleNormal.remainingTimeMin > 0) {
                            isBlacklistedNormal = false;
                            blacklistedSites.delete(comparableRuleNormal.site_or_app_name)
                            await saveStateImmediate()
                        }
                        await loadState() //=>update user info
                        let isTimeTrackerActive = userInfo ? userInfo.timeTrackerActive : false

                        port.postMessage({
                            type: 'IS_BLACKLISTED_RESPONSE',
                            payload: { url: urlToCheckNormal, isBlacklisted: isBlacklistedNormal, rule: comparableRuleNormal, isTimeTrackerActive: isTimeTrackerActive },
                            requestId: request.requestId
                        });
                        break;
                    default:
                        console.warn(prefisso + ` (Normal Page Port ${tabId}): Tipo di messaggio sconosciuto:`, request.type);
                }
            });

            port.onDisconnect.addListener(() => {
                console.log(prefisso + `Porta NORMAL_PAGE_BRIDGE chiusa per Tab ID: ${tabId}.`);
            });

        } else {
            console.warn(prefisso + `Connessione con nome sconosciuto ricevuta: "${port.name}". Disconnessione.`);
            port.disconnect(); // Disconnetti la porta sconosciuta per sicurezza
        }
    } else {
        console.warn(prefisso + "Connessione porta " + port.name + " senza un Tab ID valido.");
        port.disconnect();
    }

});

// --- Gestione Comunicazione (POPUP.svelte -> backrgound) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background: Messaggio ricevuto:', request.type, request.payload); // Log dettagliato se serve debug
    switch (request.type) {
        case 'GET_TIME_TRACKER_RULES': // Richiesta da Popup per le regole attuali            
            console.log("request.requestId = ", request.requestId)
            if (request.requestId) {
                ruleRequestMap.set(request.requestId, sendResponse)
                askRulesToPWA()
                return true; //sendresponse asincrona
            } else {
                sendResponse({ timeTrackerRules: timeTrackerRules });
            }
            break;
        default:
            console.warn(prefisso + ' Messaggio di tipo sconosciuto ricevuto:', request.type);
            break;

    }
})



// --- Gestione Eventi Tab del Browser ---

// Listener per i cambi di tab attiva
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    activeTabId = activeInfo.tabId;
    await updateActiveTabInfo(); // Aggiorna URL e altri info della tab attiva
    console.log('Background: Tab attiva cambiata a ID:', activeTabId, 'URL:', activeTabUrl);
    // Quando cambia la tab attiva, controlliamo subito se è blacklisted e notifichiamo il content script
    checkAndNotifyBlacklist();
    // La logica di tracking si basa sul timer trackTime che controllerà l'activeTabUrl corrente
});

// Listener per gli aggiornamenti delle tab (es. navigazione, ricarica)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Interessato solo agli aggiornamenti della tab attiva e quando l'URL è pronto (status complete)
    // e solo se l'URL è effettivamente cambiato per evitare notifiche duplicate
    if (tabId === activeTabId && changeInfo.url && tab.status === 'complete' && tab.url !== activeTabUrl) {
        activeTabUrl = tab.url; // Aggiorna l'URL della tab attiva
        console.log('Background: Tab attiva (ID:', tabId, ') URL aggiornato:', activeTabUrl);
        // Quando l'URL della tab attiva cambia, controlliamo subito se è blacklisted e notifichiamo
        checkAndNotifyBlacklist();
        // La logica di tracking si basa sul timer trackTime che controllerà l'activeTabUrl corrente
    } else if (tabId === activeTabId && tab.status === 'complete' && !changeInfo.url && tab.url !== activeTabUrl) {
        // Gestisce casi dove l'URL potrebbe non essere in changeInfo ma è aggiornato in tab (raro)
        activeTabUrl = tab.url;
        console.log('Background: Tab attiva (ID:', tabId, ') URL aggiornato (from tab object):', activeTabUrl);
        checkAndNotifyBlacklist();
    }
});

// Listener per la rimozione delle tab
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === activeTabId) {
        console.log('Background: Tab attiva rimossa (ID:', tabId, '). Reset activeTab info.');
        activeTabId = null;
        activeTabUrl = undefined;
        // Quando la tab attiva viene chiusa, non c'è nulla da tracciare fino all'attivazione di una nuova tab
        // La logica trackTime gestirà questo perché activeTabUrl sarà undefined
    }
    // Potresti voler salvare lo stato qui per assicurarti che il tempo tracciato
    // fino alla chiusura della tab venga preservato, anche se il timer di salvataggio è attivo.
    scheduleSaveState(); // Pianifica un salvataggio per sicurezza
});

// Funzione per ottenere e aggiornare l'URL della tab attiva
async function updateActiveTabInfo() {
    if (activeTabId !== null) {
        try {
            const tab = await chrome.tabs.get(activeTabId);
            // Filtra URL speciali delle estensioni o interne di Chrome dove non si traccia il tempo
            if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
                activeTabUrl = tab.url;
            } else {
                activeTabUrl = undefined; // Non tracciare URL speciali
                console.log('Background: URL tab attiva (ID:', activeTabId, ') è speciale o non valido:', tab.url);
            }
        } catch (error) {
            activeTabUrl = undefined; // Tab non trovata o errore
            console.error('Background: Errore nel recupero info tab (ID:', activeTabId, '):\n', error);
        }
    } else {
        activeTabUrl = undefined;
    }
}


// --- Logica di Tracking del Tempo ---

// Inizializza il timer di tracking se non già attivo
if (trackingInterval === null) {
    trackingInterval = setInterval(trackTime, TRACKING_INTERVAL_MS);
    console.log('Background: Timer di tracking avviato');
}

// Funzione principale per il tracking del tempo (eseguita ogni secondo)
async function trackTime() {
    if (!activeTabUrl || (userInfo && !userInfo.timeTrackerActive)) {
        console.log('Background: Nessuna tab attiva con URL valido da tracciare.'); // Meno log se è normale
        return; // Non c'è nulla da tracciare
    }

    //check se time tracker mode è attiva :
    await loadState()//=>update user info
    if (userInfo && !userInfo.timeTrackerActive) return;

    // Trova la regola che corrisponde all'URL della tab attiva
    const matchingRule = findMatchingRule(activeTabUrl);
    if (matchingRule) {
        // Ottieni l'identificatore comparabile per il controllo blacklist
        const rule = getComparableSiteIdentifier(activeTabUrl);
        const comparableIdentifier = rule ? rule.site_or_app_name : undefined
        // Controlla se il sito è blacklisted
        if (comparableIdentifier && blacklistedSites.has(comparableIdentifier)) {
            // Se il sito è blacklisted, non tracciare il tempo, ma assicurati che il content script sappia
            // Questo è gestito da checkAndNotifyBlacklist negli eventi onActivated/onUpdated,
            // ma potresti volerlo rinforzare qui se necessario (probabilmente non serve ogni secondo).
            return;
        }


        // Decrementa il tempo rimanente per la regola trovata
        // Converti in secondi, decrementa di 1 secondo, riconverti in minuti
        //console.log(`remaining time before decrease : ${matchingRule.remainingTimeMin} (rule ${matchingRule.site_or_app_name})`)
        matchingRule.remainingTimeMin = parseFloat(((matchingRule.remainingTimeMin * 60 - 1) / 60).toFixed(4)); // Usiamo toFixed per gestire la precisione
        //console.log(`remaining time after decrease : ${matchingRule.remainingTimeMin} (rule ${matchingRule.site_or_app_name})`)

        // console.log(prefisso+`Tracciando ${matchingRule.site_or_app_name}. Rimanente: ${matchingRule.remainingTimeMin} min`); // Log dettagliato se serve

        // Controlla se il limite è stato raggiunto o superato
        if (matchingRule.remainingTimeMin <= 0) {
            console.log(prefisso + `Limite raggiunto per ${matchingRule.site_or_app_name}`);
            matchingRule.remainingTimeMin = 0; // Assicurati che non vada sotto zero
            await handleLimitReached(matchingRule);
        }

        // Pianifica il salvataggio dello stato (debounce)
        await saveStateImmediate()
    }
}

// Funzione helper per trovare la regola corrispondente all'URL
function findMatchingRule(url: string): TimeTrackerRuleObj | undefined {
    // Ottieni l'URL object per analizzare l'hostname e il percorso
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        // Combina hostname e pathname per una ricerca più ampia
        const hostnameAndPath = hostname + urlObj.pathname;
        let rule;

        // 1. Cerca una regola che corrisponda all'hostname esatto (case-insensitive)
        rule = timeTrackerRules.find(rule => rule.site_or_app_name.toLowerCase() === hostname.toLowerCase());

        // 2. Se non trovi una corrispondenza esatta sull'hostname, prova a cercare una corrispondenza sul dominio (suffix)
        // Questo richiede che rule.site_or_app_name sia un dominio come 'google.com'
        if (!rule) {
            rule = timeTrackerRules.find(rule => {
                // Evita di matchare il dominio con sottodomini se la regola è "com" o "org" etc.
                if (rule.site_or_app_name.includes('.')) {
                    const ruleDomain = rule.site_or_app_name.toLowerCase();
                    const hostnameLower = hostname.toLowerCase();
                    // Controlla se l'hostname è esattamente il dominio della regola
                    // O se l'hostname termina con '.' + il nome del sito della regola
                    // Questo copre www.google.com, mail.google.com per una regola "google.com"
                    // Aggiungiamo anche il caso in cui l'hostname potrebbe essere un sottodominio che inizia con il nome della regola
                    // (es. google.com matchato con google.cloud.google.com, anche se meno comune per questo tipo di regole)
                    // La condizione principale `endsWith('.' + ruleDomain)` è la più importante per i sottodomini.
                    return hostnameLower === ruleDomain || hostnameLower.endsWith('.' + ruleDomain);
                    // || hostnameLower.startsWith(ruleDomain + '.'); // Questa parte è meno comune e potrebbe causare falsi positivi, la manteniamo commentata per ora
                }
                return false; // Non matchare domini di primo livello come ".com"
            });


        }

        // 3. Se ancora non trovi una corrispondenza, cerca il nome della regola (o una sua versione)
        //    nel nome host O nel percorso. Questo è un approccio più generale.
        //    Potrebbe matchare "YouTube" con un URL che contiene "youtube" o "youtube.com" nel hostname o nel path.
        if (!rule) {
            rule = timeTrackerRules.find(rule => {
                const ruleNameLower = rule.site_or_app_name.toLowerCase();
                const hostnameAndPathLower = hostnameAndPath.toLowerCase();

                // Strategia: cerchiamo la versione lowercased del nome della regola,
                // ed eventualmente la versione con ".com" aggiunto se il nome non è già un dominio,
                // all'interno del hostname e pathname combinati.
                // Questo è un approccio euristico e potrebbe avere falsi positivi,
                // ma risponde al requisito di essere generale e copre l'esempio di YouTube.

                const searchStrings = [ruleNameLower];

                // Se il nome della regola non contiene un punto (probabilmente non è già un dominio)
                // e ha almeno 3 caratteri (per evitare match banali come 'it', 'fr', etc.),
                // proviamo a cercare anche la versione con .com
                if (!ruleNameLower.includes('.') && ruleNameLower.length > 2) {
                    searchStrings.push(ruleNameLower + ".com");
                }

                // Controlla se una delle stringhe di ricerca è inclusa nel hostname e pathname (minuscolo)
                // Aggiungiamo controlli per evitare match parziali indesiderati (es. "tube" in "toothpaste")
                // rendendo la ricerca un po' più robusta, cercando come "parola" (circondata da non-caratteri alfanumerici o inizio/fine stringa)
                return searchStrings.some(searchStr => {
                    // Creiamo una regex per cercare la stringa esatta come "parola"
                    // \b match una boundary di parola. [.\/]? gestisce separatori comuni tra hostname/path
                    const regex = new RegExp(`(?:^|[.\\/\\-_])` + searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + `(?:[.\\/\\-_]|$)`);

                    // Testiamo sia l'inclusione semplice (meno sicura) sia la regex (più sicura)
                    // Per essere più generali ma minimizzare falsi positivi, usiamo la regex sul hostnameAndPath.
                    // In alternativa, una semplice inclusione (`.includes(searchStr)`) è più "generale" ma meno precisa.
                    // Optiamo per la regex per un compromesso migliore tra generalità e precisione.

                    return regex.test(hostnameAndPathLower);

                    // Se preferisci la massima generalità (con più rischio di falsi positivi), usa solo .includes():
                    // return hostnameAndPathLower.includes(searchStr);
                });

            });
            //console.log("rule found by substring (regex word boundary) in hostname and path: ", rule);
        }


        return rule;

    } catch (e) {
        console.error('Background: Errore parsing URL per matching rule:', url, e);
        return undefined; // URL non valido
    }
}

// Funzione helper per ottenere un identificatore comparabile del sito per blacklist/matching
function getComparableSiteIdentifier(url: string): TimeTrackerRuleObj | null {
    try {
        const urlObj = new URL(url);
        //const hostname = urlObj.hostname;

        // Cerca una regola che corrisponda a questo URL
        const matchingRule = findMatchingRule(url);

        // Se c'è una regola, usa l'identificatore definito nella regola
        if (matchingRule) {
            // Decidi se usare hostname o rule.site_or_app_name per l'identificatore blacklist
            // Se rule.site_or_app_name è un dominio (es. google.com) e matchiamo sottodomini,
            // è meglio usare rule.site_or_app_name come identificatore blacklist.
            // Se rule.site_or_app_name è un hostname esatto (es. www.google.com), usiamo quello.
            // Una strategia semplice è usare sempre rule.site_or_app_name
            return matchingRule
        }

        // Se nessuna regola corrisponde, non abbiamo un identificatore valido per la blacklist
        return null;

    } catch (e) {
        console.error('Background: Errore parsing URL per identificatore comparabile:', url, e);
        return null;
    }
}


// --- Gestione Limite Raggiunto e Blacklist ---

// Funzione per gestire il limite raggiunto per una regola
async function handleLimitReached(rule: TimeTrackerRuleObj) {
    console.log(prefisso + `Gestione limite raggiunto per ${rule.site_or_app_name}. Regola: ${rule.rule}`);

    // Aggiungi il sito (identificatore della regola) alla blacklist
    blacklistedSites.add(rule.site_or_app_name);
    await saveStateImmediate(); // Salva subito lo stato aggiornato

    // Notifica i content script (specialmente quello della tab attiva) che il sito è blacklisted
    // e la PWA che il limite è stato raggiunto.


    await loadState() //=>update user info
    let isTimeTrackerActive = userInfo ? userInfo.timeTrackerActive : false


    // Messaggio per i content script
    const blacklistMessageToCS = {
        type: 'SITE_BLACKLISTED', // Nuovo tipo di messaggio per notificare la blacklist in tempo reale
        payload: { siteIdentifier: rule.site_or_app_name, rule: rule, isBlacklisted: true, isTimeTrackerActive:isTimeTrackerActive }
    };

    // Messaggio per la PWA
    const pwaNotificationMessage = {
        type: 'LIMIT_REACHED',
        payload: { rule: rule } // Invia la regola completa
    };

    // 1. Invia il messaggio al content script della tab attiva (se monitorata)
    if (activeTabId !== null && activeTabUrl !== undefined) {
        const associatedRule = getComparableSiteIdentifier(activeTabUrl);
        const activeTabComparableIdentifier = associatedRule ? associatedRule.site_or_app_name : undefined

        // Solo invia se la tab attiva corrisponde al sito blacklisted
        if (activeTabComparableIdentifier && activeTabComparableIdentifier === rule.site_or_app_name) {
            try {
                console.log(prefisso + `Invio notifica SITE_BLACKLISTED a tab attiva ${activeTabId}.`);
                const relatedPort = bridgeContentScriptPortMap.get(activeTabId)
                if (relatedPort) {
                    relatedPort.postMessage(blacklistMessageToCS)
                    console.log(prefisso + "sent blacklistMessageToCS:\n", blacklistMessageToCS)
                }

            } catch (error: any) {
                console.error(prefisso + ` Errore invio SITE_BLACKLISTED a tab attiva ${activeTabId}:`, error);
            }
        }

        if (rule.rule.includes("close")) { //close page after 1s
            setTimeout(async () => {
                if (activeTabId) {
                    try {
                        await chrome.tabs.remove(activeTabId)
                    } catch (error) {
                        console.error(prefisso + "Error in close page:\n", error);
                    }
                }
            }, 1000)
        }
    }


    // 2. Invia il messaggio alla PWA
    // Controlla se l'origine della PWA è stata impostata
    if (bridgePWAport) {
        try {
            bridgePWAport.postMessage(pwaNotificationMessage)
            console.log("LIMIT_REACHED message sent")
        } catch (error) {
            console.error(prefisso + ` Errore nell'invio di LIMIT_REACHED alla tab PWA con origine ${pwaOrigin} o durante la query:`, error);
        }
    } else {
        // L'origine della PWA non è ancora stata impostata.
        console.warn(prefisso + ' Origine PWA non impostata, non posso inviare notifica LIMIT_REACHED.');
    }
}

// Funzione per verificare la blacklist e notificare il content script della tab attiva
async function checkAndNotifyBlacklist() {
    if (activeTabId !== null && activeTabUrl !== undefined) {
        const rule = getComparableSiteIdentifier(activeTabUrl);
        const comparableIdentifier = rule ? rule.site_or_app_name : undefined
        const isBlacklisted = comparableIdentifier ? blacklistedSites.has(comparableIdentifier) : false;

        console.log(prefisso + `Check blacklist per tab attiva ${activeTabId} (${activeTabUrl}). Blacklisted: ${isBlacklisted}`);



        if (activeTabId) { // Assicurati che activeTabId non sia null
            try {
                const relatePort = bridgeContentScriptPortMap.get(activeTabId)
                if (!relatePort) throw new Error("Related port not found for tab id : " + activeTabId)

                await loadState() //=>update user info
                let isTimeTrackerActive = userInfo ? userInfo.timeTrackerActive : false

                const msgContent = {
                    type: 'IS_BLACKLISTED_RESPONSE', // Messaggio per notificare lo stato blacklist corrente
                    payload: { url: activeTabUrl, isBlacklisted: isBlacklisted, rule: rule, isTimeTrackerActive: isTimeTrackerActive }
                }
                relatePort.postMessage(msgContent)
                console.log("sent msgContent:", msgContent)
            } catch (error: any) {
                console.error(prefisso + ` Errore invio IS_BLACKLISTED_RESPONSE a tab ${activeTabId}:`, error);
            }
        }
    }
}


// --- Invio Aggiornamenti Usage alla PWA ---

// Avvia il timer per inviare aggiornamenti alla PWA
if (pwaUpdateInterval === null) {
    pwaUpdateInterval = setInterval(sendUsageUpdateToPWA, PWA_UPDATE_INTERVAL_MS);
    console.log('Background: Timer aggiornamento PWA avviato');
}

// Funzione per inviare lo stato attuale delle regole alla PWA
async function sendUsageUpdateToPWA() {
    if (!pwaOrigin) {
        // console.log('Background: Origine PWA non impostata, salto invio aggiornamenti.'); // Meno log
        return; // Non possiamo inviare aggiornamenti se non sappiamo dove
    }

    // Solo invia se ci sono regole da tracciare
    if (timeTrackerRules.length === 0) {
        // console.log('Background: Nessuna regola di tracking configurata, salto invio aggiornamenti alla PWA.'); // Meno log
        return;
    }

    const pwaNotificationMessage = {
        type: 'RULES_UPDATED_FROM_EXT',
        payload: { timeTrackerRules: timeTrackerRules } // Invia l'intera lista di regole aggiornata
    };

    try {
        if (!bridgePWAport) throw new Error("bridge pwa port is null in send usage update to pwa")
        bridgePWAport.postMessage(pwaNotificationMessage)



    } catch (error) {
        console.error(prefisso + ` Errore nell'invio di RULES_UPDATED_FROM_EXT alla tab PWA con origine ${pwaOrigin} o durante la query:`, error);
    }
}


// --- Reset Giornaliero Blacklist ---

// Imposta l'allarme per il reset giornaliero della blacklist a mezzanotte
function setupDailyBlacklistReset() {
    // Prima, rimuovi allarmi esistenti con lo stesso nome per evitare duplicati
    chrome.alarms.clear('resetBlacklist', (wasCleared) => {
        if (wasCleared) {
            console.log('Background: Allarme resetBlacklist precedente rimosso.');
        }
        // Crea il nuovo allarme
        chrome.alarms.create('resetBlacklist', {
            when: getMidnightTimestamp(), // Primo reset a mezzanotte successiva
            periodInMinutes: 24 * 60 // Ripeti ogni giorno
        });
        console.log('Background: Allarme resetBlacklist impostato per la mezzanotte successiva.');
    });


    chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === 'resetBlacklist') {
            console.log('Background: Allarme reset blacklist attivato.');
            blacklistedSites.clear(); // Svuota la blacklist (Set)
            // Resetta i tempi rimanenti di tutte le regole ai limiti giornalieri
            timeTrackerRules.forEach(rule => {
                rule.remainingTimeMin = rule.minutesDailyLimit;
            });
            await saveStateImmediate(); // Salva subito dopo il reset
            console.log('Background: Blacklist e tempi rimanenti resettati.');
            // Notifica i content script (opzionale) che la blacklist è stata resettata.
            // Potrebbe essere utile se un content script sta mostrando un modal di blocco.
            broadcastMessageToAllContentScripts({ type: 'BLACKLIST_RESET' });
            // Notifica anche la PWA del reset
            if (pwaOrigin) {
                sendUsageUpdateToPWA(); // Invia lo stato con i tempi resettati
            }
        }
    });
}

// Funzione helper per ottenere il timestamp della mezzanotte successiva
function getMidnightTimestamp(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Imposta a mezzanotte del giorno dopo
    return midnight.getTime();
}


// --- Funzioni Utility per Broadcast ---

// Funzione helper per inviare un messaggio a tutti i content scripts in tab valide
async function broadcastMessageToAllContentScripts(message: any) {
    for (let port of bridgeContentScriptPortMap.values()) {
        port.postMessage(message);
    }


}

// --- Gestione Chiusura Browser ---
// Salva lo stato quando l'estensione sta per essere sospesa (browser in chiusura)
chrome.runtime.onSuspend.addListener(() => {
    console.log('Background: Estensione sospesa, salvataggio stato finale.');
    saveStateImmediate(); // Salva subito
    // clearTimeout e clearInterval non sono strettamente necessari qui,
    // il browser li gestirà alla sospensione.
});


// --- Inizializzazione del background script ---

console.log('Background: Inizializzazione...');
loadState().then(() => {
    // Dopo aver caricato lo stato, aggiorna l'info sulla tab attiva corrente
    // (utile se il browser viene riaperto con tab precedenti)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id !== undefined) {
            activeTabId = tabs[0].id;
            updateActiveTabInfo(); // Aggiorna URL e controlla blacklist per questa tab iniziale
        }
    });

    // Imposta l'allarme per il reset giornaliero
    setupDailyBlacklistReset();

    console.log('Background: Inizializzazione completata.');
});