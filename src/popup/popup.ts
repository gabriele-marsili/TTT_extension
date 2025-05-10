import { mount } from 'svelte';
import Popup from './Popup.svelte';
import { TimeTrackerRuleObj } from '../types/timeTrackerTypes';

// --- Definizione esplicita dei tipi delle props attese ---
// Questa interfaccia riflette le 'export let' props definite in Popup.svelte
interface IPopupProps {
    timeTrackerRules: TimeTrackerRuleObj[]; // timeTrackerRules è un array di TimeTrackerRuleObj
}

// --- Logica di Mount e Gestione Dati ---

// Trova l'elemento DOM dove montare l'app Svelte
const appMountPoint = document.getElementById('app');

// Dichiara la variabile per l'istanza dell'app Svelte con il tipo corretto se possibile,
// altrimenti usa 'any' come fallback se TypeScript non riesce ancora a inferire il tipo corretto
let appInstance: any;
// Nota: SvelteComponent è un tipo generico da 'svelte'. La tipizzazione precisa qui può variare.
// Se l'errore persiste su questa linea, usa let appInstance: any | null = null; come workaround TypeScript.


// Assicurati che l'elemento di mount esista nell'HTML del popup
if (appMountPoint) {
    try {


        // Crea una nuova istanza del componente Svelte principale
        // Passa le props iniziali tipizzate esplicitamente
        const initialProps: IPopupProps = {
            timeTrackerRules: []     // Valore iniziale, un array vuoto del tipo corretto
        };
        console.log("Popup: mount point:", appMountPoint);
        console.log("Popup: initialProps:", initialProps);

        appInstance = mount(Popup, { target: appMountPoint, props: initialProps })
        console.log("appInstance:\n", appInstance)


        console.log('Popup: App Svelte montata nel DOM.');

        // --- Recupera dati iniziali e passali all'app Svelte ---
       
        // 2. Ascolta i messaggi dal background script per aggiornamenti in tempo reale.
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === "USAGE_UPDATE" || request.type === "UPDATE_SITE_TIMERS") {
                console.log("Popup: Ricevuto aggiornamento regole/timer dal background", request.payload);
                // Controlla la struttura del payload prima di aggiornare
                if (request.payload && Array.isArray(request.payload.timeTrackerRules) && appInstance && appInstance.$set) {
                    // Passa un oggetto parziale tipizzato per $set
                    const update: Partial<IPopupProps> = { timeTrackerRules: request.payload.timeTrackerRules };
                    appInstance.$set(update);
                }
            }
            // Non inviare sendResponse qui a meno che il background non lo aspetti.
        });

        // Nota: La richiesta iniziale delle regole ('GET_TIME_TRACKER_RULES') viene fatta dal componente Popup.svelte stesso in onMount.
    } catch (error) {
        console.log("error mounting app in DOM :\n", error)
    }
} else {
    console.error('Popup: Elemento di mount per Svelte (#app) non trovato nell\'HTML del popup!');
}
