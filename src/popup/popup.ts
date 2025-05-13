import { mount } from 'svelte';
import Popup from './Popup.svelte';
import { TimeTrackerRuleObj } from '../types/timeTrackerTypes';

interface IPopupProps {
    timeTrackerRules: TimeTrackerRuleObj[];
}

// --- Logica di Mount e Gestione Dati ---
const appMountPoint = document.getElementById('app');
let appInstance: any;

if (appMountPoint) {
    try {
        const initialProps: IPopupProps = {
            timeTrackerRules: []     
        };
        console.log("Popup: mount point:", appMountPoint);
        console.log("Popup: initialProps:", initialProps);

        appInstance = mount(Popup, { target: appMountPoint, props: initialProps })
        console.log("appInstance:\n", appInstance)


        console.log('Popup: App Svelte montata nel DOM.');

       
        //Ascolta i messaggi dal background script :
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === "USAGE_UPDATE" || request.type === "UPDATE_SITE_TIMERS") {
                console.log("Popup: Ricevuto aggiornamento regole/timer dal background", request.payload);
                if (request.payload && Array.isArray(request.payload.timeTrackerRules) && appInstance && appInstance.$set) {
                    const update: Partial<IPopupProps> = { timeTrackerRules: request.payload.timeTrackerRules };
                    appInstance.$set(update);
                }
            }
        });

    } catch (error) {
        console.log("error mounting app in DOM :\n", error)
    }
} else {
    console.error('Popup: Elemento di mount per Svelte (#app) non trovato nell\'HTML del popup!');
}
