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

let blacklistedSites: Set<string> = new Set(); //salva identificatori dei siti 
let pwaOrigin: string | undefined = undefined;
let userInfo: userDBentry | undefined = undefined

// --- Costanti ---
const TRACKING_INTERVAL_MS = 1000; //1s
const PWA_UPDATE_INTERVAL_MS = 60000; // 1m
const SAVE_STATE_DELAY_MS = 5000; // Ritardo per il salvataggio dello stato (debounce)

let bridgePWAport: chrome.runtime.Port | null = null
// Mappa per tenere traccia delle porte attive (content scripts), con la tab ID come chiave
const bridgeContentScriptPortMap = new Map<number, chrome.runtime.Port>();

// --- Gestione Stato (Carica/Salva) ---

// Carica lo stato all'avvio dell'estensione
async function loadState() {
    const storedData = await chrome.storage.local.get(['timeTrackerRules', 'blacklistedSites', 'pwaOrigin', "userInfo"]);
    userInfo = storedData.userInfo as userDBentry || undefined
    timeTrackerRules = storedData.timeTrackerRules || [];
    //conversione in set:
    blacklistedSites = new Set(storedData.blacklistedSites || []);
    pwaOrigin = storedData.pwaOrigin;
    console.log('Background: Stato caricato:', { timeTrackerRules, blacklistedSites: Array.from(blacklistedSites), pwaOrigin });

    timeTrackerRules.forEach(rule => {
        if (typeof rule.remainingTimeMin !== 'number') {
            rule.remainingTimeMin = rule.minutesDailyLimit; 
        }
    });

    scheduleSaveState();
}

//salva lo stato dopo un determinato delay
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
    await chrome.storage.local.set({ timeTrackerRules, blacklistedSites: Array.from(blacklistedSites), pwaOrigin });
    const data = { timeTrackerRules, blacklistedSites: Array.from(blacklistedSites), pwaOrigin }
    chrome.runtime.sendMessage({ type: 'UPDATED_STATE', data: data }, (response) => {
        if (chrome.runtime.lastError) {
            // (L'errore è normale se il popup non è aperto in quel momento)
            console.warn(prefisso + ' Error sending UPDATED_STATE to popup:', chrome.runtime.lastError.message);
        }
    });
}

// Salva lo stato immediatamente 
async function saveStateImmediate() {
    if (saveStateTimeout) {
        clearTimeout(saveStateTimeout); // Annulla qualsiasi salvataggio programmato
    }
    await saveState();
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
    console.log(prefisso+"updated tt rules: ",timeTrackerRules)
    const activeRuleSiteNames = new Set<string>(
        rules.map(rule => rule.site_or_app_name)
    );

    blacklistedSites.forEach(site => {
        if (!activeRuleSiteNames.has(site)) {
            blacklistedSites.delete(site);
        }
    });


    console.log('Background: Regole di tracking aggiornate dalla PWA:', timeTrackerRules);
    saveStateImmediate(); // Pianifica il salvataggio dopo l'aggiornamento
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
                                    // (L'errore è normale se il popup non è aperto in quel momento)
                                    console.warn(prefisso + ' Error sending USER_LOGGED_IN_VIA_PWA to popup:', chrome.runtime.lastError.message);
                                }
                            });
                        }

                        break;
                    case 'UPDATE_TIME_TRACKER_RULES':
                        // La PWA sta inviando un aggiornamento delle regole
                        if (Array.isArray(request.payload.rules)) {
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
            port.disconnect(); // Disconnetti la porta sconosciuta 
        }
    } else {
        console.warn(prefisso + "Connessione porta " + port.name + " senza un Tab ID valido.");
        port.disconnect();
    }

});

// --- Gestione Comunicazione (POPUP.svelte -> backrgound) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background: Messaggio ricevuto:', request.type, request.payload);
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
    checkAndNotifyBlacklist();
});

// Listener per gli aggiornamenti delle tab (es. navigazione, ricarica)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId === activeTabId && changeInfo.url && tab.status === 'complete' && tab.url !== activeTabUrl) {
        activeTabUrl = tab.url; // Aggiorna l'URL della tab attiva
        console.log('Background: Tab attiva (ID:', tabId, ') URL aggiornato:', activeTabUrl);
        // al cambio dell'URL check se tab è blacklisted
        checkAndNotifyBlacklist();
    } else if (tabId === activeTabId && tab.status === 'complete' && !changeInfo.url && tab.url !== activeTabUrl) {
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
        
    }
    scheduleSaveState();
});

// Funzione per ottenere e aggiornare l'URL della tab attiva
async function updateActiveTabInfo() {
    if (activeTabId !== null) {
        try {
            const tab = await chrome.tabs.get(activeTabId);
            // Filtra URL speciali 
            if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
                activeTabUrl = tab.url;
            } else {
                activeTabUrl = undefined; // Non traccia URL speciali
                console.log('Background: URL tab attiva (ID:', activeTabId, ') è speciale o non valido:', tab.url);
            }
        } catch (error) {
            activeTabUrl = undefined; 
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
        console.log('Background: Nessuna tab attiva con URL valido da tracciare.'); 
        return;
    }

    //check se time tracker mode non è attiva :    
    if (userInfo && !userInfo.timeTrackerActive) return;

    // Trova la regola che corrisponde all'URL della tab attiva
    const matchingRule = findMatchingRule(activeTabUrl);
    if (matchingRule) {
        const rule = getComparableSiteIdentifier(activeTabUrl);
        const comparableIdentifier = rule ? rule.site_or_app_name : undefined
        // Controlla se il sito è blacklisted
        if (comparableIdentifier && blacklistedSites.has(comparableIdentifier)) {
            // Se il sito è blacklisted, non traccia il tempo (blocco gestito da content script)         
            return;
        }


        // Decrementa il tempo rimanente per la regola trovata
        // Converte in secondi, decrementa di 1 secondo, riconverte in minuti
        matchingRule.remainingTimeMin = parseFloat(((matchingRule.remainingTimeMin * 60 - 1) / 60).toFixed(4)); // Usiamo toFixed per gestire la precisione

        // Controlla se il limite è stato raggiunto o superato
        if (matchingRule.remainingTimeMin <= 0) {
            console.log(prefisso + `Limite raggiunto per ${matchingRule.site_or_app_name}`);
            matchingRule.remainingTimeMin = 0; 
            await handleLimitReached(matchingRule);
        }

        await saveStateImmediate()
    }
}

// Funzione helper per trovare la regola corrispondente all'URL
function findMatchingRule(url: string): TimeTrackerRuleObj | undefined {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const hostnameAndPath = hostname + urlObj.pathname;
        let rule;

        //Cerca una regola che corrisponda all'hostname esatto (case-insensitive)
        rule = timeTrackerRules.find(rule => rule.site_or_app_name.toLowerCase() === hostname.toLowerCase());

        // prova a cercare una corrispondenza sul dominio (suffix)
        if (!rule) {
            rule = timeTrackerRules.find(rule => {
                if (rule.site_or_app_name.includes('.')) {
                    const ruleDomain = rule.site_or_app_name.toLowerCase();
                    const hostnameLower = hostname.toLowerCase();
                    return hostnameLower === ruleDomain || hostnameLower.endsWith('.' + ruleDomain);
                }
                return false; 
            });


        }

        // cerca il nome della regola (o una sua versione)
        if (!rule) {
            rule = timeTrackerRules.find(rule => {
                const ruleNameLower = rule.site_or_app_name.toLowerCase();
                const hostnameAndPathLower = hostnameAndPath.toLowerCase();
                const searchStrings = [ruleNameLower];
                if (!ruleNameLower.includes('.') && ruleNameLower.length > 2) {
                    searchStrings.push(ruleNameLower + ".com");
                }
                return searchStrings.some(searchStr => {
                    const regex = new RegExp(`(?:^|[.\\/\\-_])` + searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + `(?:[.\\/\\-_]|$)`);

                    return regex.test(hostnameAndPathLower);

                });

            });
        }


        return rule;

    } catch (e) {
        console.error('Background: Errore parsing URL per matching rule:', url, e);
        return undefined;
    }
}

// Funzione helper per ottenere un identificatore comparabile del sito per blacklist/matching
function getComparableSiteIdentifier(url: string): TimeTrackerRuleObj | null {
    try {
        const matchingRule = findMatchingRule(url);
        if (matchingRule) {
            return matchingRule
        }
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

    // Notifica i content script (specialmente quello della tab attiva) che il sito è blacklisted e la PWA che il limite è stato raggiunto.

    await loadState() //=>update user info
    let isTimeTrackerActive = userInfo ? userInfo.timeTrackerActive : false


    // Messaggio per i content script
    const blacklistMessageToCS = {
        type: 'SITE_BLACKLISTED', 
        payload: { siteIdentifier: rule.site_or_app_name, rule: rule, isBlacklisted: true, isTimeTrackerActive:isTimeTrackerActive }
    };

    // Messaggio per la PWA
    const pwaNotificationMessage = {
        type: 'LIMIT_REACHED',
        payload: { rule: rule }
    };

    //Invia il messaggio al content script della tab attiva (se monitorata)
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


    // Invia il messaggio alla PWA
    if (bridgePWAport) {
        try {
            bridgePWAport.postMessage(pwaNotificationMessage)
            console.log("LIMIT_REACHED message sent")
        } catch (error) {
            console.error(prefisso + ` Errore nell'invio di LIMIT_REACHED alla tab PWA con origine ${pwaOrigin} o durante la query:`, error);
        }
    } else {
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



        if (activeTabId) {
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
        return; 
    }

    if (timeTrackerRules.length === 0) {
        return;
    }

    const pwaNotificationMessage = {
        type: 'RULES_UPDATED_FROM_EXT',
        payload: { timeTrackerRules: timeTrackerRules }
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
    //rimuove allarmi esistenti con lo stesso nome per evitare duplicati
    chrome.alarms.clear('resetBlacklist', (wasCleared) => {
        if (wasCleared) {
            console.log('Background: Allarme resetBlacklist precedente rimosso.');
        }
        // Crea il nuovo allarme
        chrome.alarms.create('resetBlacklist', {
            when: getMidnightTimestamp(), // reset a mezzanotte 
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
            await saveStateImmediate(); 
            console.log('Background: Blacklist e tempi rimanenti resettati.');
            
            broadcastMessageToAllContentScripts({ type: 'BLACKLIST_RESET' });
            
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
    saveStateImmediate(); 
});


// --- Inizializzazione del background script ---

console.log('Background: Inizializzazione...');
loadState().then(() => {

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