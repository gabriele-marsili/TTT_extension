<script lang="ts">
  import { onMount } from "svelte";
  import type { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
  import { userDBentry } from "../types/userTypes";

  // --- Component State ---
  // 'loading': Show spinner and message
  // 'ready': Show main content
  let currentState: "loading" | "ready" = "loading";

  let activeTabUrl: string | undefined = undefined;
  // timeTrackerRules is initially an empty array, updated in onMount here or via background messages.
  export let timeTrackerRules: TimeTrackerRuleObj[] = [];

  // --- Local State ---
  // Theme preference ('light' or 'dark')
  let currentTheme: "light" | "dark" = "light";
  const THEME_STORAGE_KEY = "ttt-theme-preference"; // Key for Chrome storage
  const LOGIN_VALIDITY_DURATION_MS = 24 * 60 * 60 * 1000;

  $: if (typeof document !== "undefined") {
    document.body.className = currentTheme;
  }

  function checkLoginStatus() {
    // Check login status from storage
    chrome.storage.local.get(
      ["userInfo", "lastUserInfoUpdateTimestamp"],
      (result) => {
        const userInfo: userDBentry | undefined = result.userInfo;
        const lastUserInfoUpdateTimestamp: number | undefined =
          result.lastUserInfoUpdateTimestamp;
        const now = Date.now();

        if (
          userInfo &&
          lastUserInfoUpdateTimestamp &&
          now - lastUserInfoUpdateTimestamp < LOGIN_VALIDITY_DURATION_MS
        ) {
          // User is logged in and login is recent (within 24h)
          console.log(
            "Popup Svelte: User logged in recently. Transitioning to ready state.",
          );
          currentState = "ready";
          // Immediately request rules since we know the user is ready
          requestTimeTrackerRules();
        } else {
          // User not logged in or login expired
          console.log(
            "Popup Svelte: User not logged in or login expired. Showing loading/wait state.",
          );
          currentState = "loading";
          // Stay in loading state, waiting for the PWA_READY signal via background script
        }
      },
    );
  }

  function requestTimeTrackerRules() {
    console.log("Popup Svelte: Requesting tracking rules from background.");
    let reqID = "ID:" + Date.now();
    // Request the current list of rules from the background script
    chrome.runtime.sendMessage(
      { type: "GET_TIME_TRACKER_RULES", requestId: reqID },
      (response) => {
        console.log(
          "Popup Svelte: Received GET_TIME_TRACKER_RULES response:\n",
          response,
        );
        if (response && Array.isArray(response.timeTrackerRules)) {
          const rulesMap: { [id: string]: TimeTrackerRuleObj } = {};
          for (const rule of timeTrackerRules) {
            rulesMap[rule.id] = rule;
          }

          for (const pwaRule of response.timeTrackerRules as TimeTrackerRuleObj[]) {
            // Aggiunto cast per sicurezza tipo in TS
            const existingRule = rulesMap[pwaRule.id]; // Accesso rapido O(1)

            if (existingRule) {
              // La regola esiste già nella mappa. Controlla remainingTimeMin.
              if (pwaRule.remainingTimeMin < existingRule.remainingTimeMin) {
                // La regola in arrivo è migliore (tempo rimanente minore), aggiorna nella mappa.
                rulesMap[pwaRule.id] = pwaRule;
                console.log(
                  `Aggiornata regola con ID ${pwaRule.id}. Nuovo remainingTimeMin: ${pwaRule.remainingTimeMin}`,
                );
              }
              // Altrimenti, se la regola esistente è uguale o migliore, non fare nulla (mantieni quella nella mappa).
            } else {
              // La regola non esiste nella mappa, aggiungila.
              rulesMap[pwaRule.id] = pwaRule;
              console.log(`Aggiunta nuova regola con ID ${pwaRule.id}.`);
            }
          }

          timeTrackerRules = Object.values(rulesMap);

          console.log(
            "Popup Svelte: Tracking rules received:",
            timeTrackerRules,
          );
        } else {
          console.error(
            "Popup Svelte: Invalid response or missing 'timeTrackerRules' from background.",
          );
          // Optionally set a visible message here
        }
      },
    );
  }

  // --- Lifecycle: Actions to perform after mount ---
  onMount(async () => {
    console.log(
      "Popup Svelte: Component mounted. Requesting tracking rules from background.",
    );

    // Load theme preference from Chrome storage
    chrome.storage.local.get(THEME_STORAGE_KEY, (result) => {
      if (result[THEME_STORAGE_KEY]) {
        currentTheme = result[THEME_STORAGE_KEY];
        console.log("Popup Svelte: Loaded theme preference:", currentTheme);
      } else {
        // Default to user's system preference if no preference is saved
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        currentTheme = prefersDark ? "dark" : "light";
        console.log(
          "Popup Svelte: No theme preference saved, defaulting to system preference:",
          currentTheme,
        );
      }
      // Ensure the theme class is applied initially based on loaded preference
      // (redundant with class="{currentTheme}" but good for clarity)
      // document.body.className = currentTheme; // If applying to body
    });

    //load time tracker rules by local storage :
    chrome.storage.local.get("timeTrackerRules", (result) => {
      console.log("chrome storage get timeTrackerRules res :\n", result);
      if (result["timeTrackerRules"]) {
        timeTrackerRules = result["timeTrackerRules"];
      }
    });

    // --- Logic for Initial State (Loading vs. Ready) ---
    checkLoginStatus();

    // --- Listener for messages from background script ---
    // This listener handles the signal that the PWA has logged the user in
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === "USER_LOGGED_IN_VIA_PWA") {
        console.log(
          "Popup Svelte: Received USER_LOGGED_IN_VIA_PWA signal. Checking storage for user info...",
        );

        checkLoginStatus();
        // Send an empty response back to acknowledge receipt if needed by sender
        // sendResponse({ status: "ack" });
        // Return true if sendResponse will be called async (not strictly needed here as it's sync)
        // return true;
      }

      if (request.type === "UPDATED_STATE" && request.data != undefined) {
        const data: {
          timeTrackerRules: TimeTrackerRuleObj[];
          blacklistedSites: string[];
          pwaOrigin?: undefined | string;
        } = request.data;

        timeTrackerRules = data.timeTrackerRules;
      }
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const activeTab = tabs[0];
        console.log("Popup: URL tab attiva recuperato:", activeTab.url);
        activeTabUrl = activeTab.url;
      } else {
        console.log("Popup: Nessuna tab attiva trovata.");
        activeTabUrl = "default value";
      }
    });
  });

  // --- Actions ---
  // Function to toggle between themes
  function toggleTheme() {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    console.log("Popup Svelte: Toggling theme to", currentTheme);
    // Save theme preference to Chrome storage
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: currentTheme }, () => {
      console.log("Popup Svelte: Theme preference saved:", currentTheme);
    });
    // Apply theme class to body if needed (if applying variables globally)
    // document.body.className = currentTheme;
  }

  // --- Utility functions for display ---

  // Function to format remaining minutes into a readable format (e.g., 1m 30s)
  function formatRemainingTime(minutes: number | undefined): string {
    if (minutes === undefined || minutes === null) return "N/A"; // Use N/A for Not Available
    if (minutes <= 0) return "Limit Reached!"; // Use English text
    const totalSeconds = Math.max(0, Math.floor(minutes * 60));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mins}m ${formattedSecs}s`;
  }

  // Function to handle click on "Go to TTT PWA" button
  function goToPwa() {
    console.log("Popup Svelte: Opening PWA in a new tab.");
    // Retrieve PWA origin from storage if available, otherwise use default
    chrome.storage.local.get(["pwaOrigin"], (result) => {
      const pwaUrl = result.pwaOrigin || "https://localhost:5173/home"; // Fallback
      chrome.tabs.create({ url: pwaUrl });
    });
  }

  // The getSiteInfo function was not used in the template and is removed for clarity.
  // If you need it, add it back and ensure it's correctly implemented.
</script>

<div class="app-container {currentTheme} state-{currentState}">
  {#if currentState === "loading"}
    <div class="loading-container">
      <div class="spinner"></div>
      <h3>Waiting for PWA...</h3>
      <p>
        Please log in to the Time Tracker PWA to sync your rules and status.
      </p>
      <div class="button-container">
        <button on:click={goToPwa}>Go to TTT PWA</button>
      </div>
      {#if activeTabUrl !== undefined}
        <div class="status loading-status">
          Checking Status for: <strong>
            {#if activeTabUrl}
              {activeTabUrl}
            {:else}
              No active or valid tab
            {/if}
          </strong>
        </div>
      {/if}
    </div>
  {:else if currentState === "ready"}
    <h3>TTT Time Tracker Status</h3>

    <div class="status">
      Active Tab: <strong>
        {#if activeTabUrl === undefined || activeTabUrl == "default value"}
          Loading URL...
        {:else if activeTabUrl}
          {activeTabUrl}
        {:else}
          No active or valid tab
        {/if}
      </strong>
    </div>

    <h4>Monitored Sites:</h4>
    {#if timeTrackerRules.length > 0}
      <ul class="site-list custom-scrollbar">
        {#each timeTrackerRules as rule (rule.id)}
          <li class="site-item">
            <strong>{rule.site_or_app_name}</strong>
            <span>Daily Limit: {rule.minutesDailyLimit} minutes</span><br />
            <span
              class="time-remaining"
              class:expired={rule.remainingTimeMin <= 0}
            >
              Time Remaining: {formatRemainingTime(rule.remainingTimeMin)}
            </span>
            {#if rule.remainingTimeMin <= 0}
              <span class="rule-action">Action: {rule.rule}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p>No monitored sites configured.</p>
    {/if}

    <div class="button-container">
      <button on:click={goToPwa}>Go to TTT PWA</button>
    </div>

    <div class="theme-switcher centered">
      <button
        type="button"
        class="theme-toggle-container"
        on:click={toggleTheme}
      >
        <div class="toggle-track">
          <div class="toggle-thumb" class:dark-mode={currentTheme === "dark"}>
            {#if currentTheme === "light"}
              <svg
                class="theme-icon sun-icon"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            {/if}

            {#if currentTheme === "dark"}
              <svg
                class="theme-icon moon-icon"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                ></path>
              </svg>
            {/if}
          </div>
        </div>
      </button>
    </div>
  {/if}
</div>

<style>
  /* --- Stili Contenitore App e Stati (Mantieni) --- */
  .app-container {
    width: 400px;
    min-height: 450px;
    max-height: 700px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 15px;
    font-family: sans-serif;
    text-align: center;
    background-color: var(--background);
    color: var(--color);
    margin: 0;
    border: 2px solid var(--button-border);

    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .app-container.state-ready {
    justify-content: flex-start;
    align-items: stretch;
  }
  /* Scrollbar styles (Mantieni) */
  .app-container::-webkit-scrollbar {
    width: 8px;
  }
  .app-container::-webkit-scrollbar-track {
    background: var(--background);
    border-radius: 4px;
  }
  .app-container::-webkit-scrollbar-thumb {
    background-color: var(--accent-color);
    border-radius: 4px;
    border: 2px solid var(--background);
  }

  /* Loading State Styles (Mantieni) */
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-grow: 1;
    padding: 20px;
    width: 100%;
  }
  .spinner {
    /* Mantieni stili spinner */
    border: 4px solid var(--button-border);
    border-top: 4px solid var(--accent-color);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .loading-container h3,
  .loading-container p {
    color: var(--text-color);
    text-align: center;
  }
  .loading-container h3 {
    margin-bottom: 10px;
  }
  .loading-container p {
    margin-bottom: 20px;
    font-size: 0.9em;
  }

  .loading-status {
    margin-top: 20px;
    font-size: 0.8em;
    opacity: 0.7;
    color: var(--color);
  }
  .loading-status strong {
    color: var(--accent-color);
    display: block;
  }

  /* --- Stili Contenitore Pulsante Go to PWA (Mantieni) --- */
  .button-container {
    text-align: center; /* Centra il pulsante */
    margin-top: 25px; /* Spazio sopra */
    margin-bottom: 15px; /* Spazio SOTTO il pulsante per staccarlo dallo switcher */
    width: 100%; /* Prendi la larghezza completa nel container 'ready' */
  }
  /* Stili per il pulsante Go to PWA (Mantieni o modifica se vuoi) */
  .button-container button {
    padding: 10px 20px;
    font-size: 1em;
    cursor: pointer;
    border-radius: 5px;
    transition:
      background-color 0.3s ease,
      border-color 0.3s ease,
      color 0.3s ease;
    background-color: var(--button-background);
    color: var(--color);
    border: 2px solid var(--button-border);
  }
  .button-container button:hover {
    /* Mantieni hover */
    background-color: color-mix(in srgb, var(--accent-color) 30%, transparent);
    border-color: var(--accent-color);
    color: var(--color);
  }

  /* --- Stili per il contenitore dello switcher (Aggiornato per centratura) --- */
  .theme-switcher {
    /* text-align: right; Rimosso */
    text-align: center; /* Centra il contenuto (il button.theme-toggle-container) */
    margin-top: 10px; /* Spazio sopra lo switcher (sotto il bottone) */
    margin-bottom: 10px; /* Spazio sotto (se ci fosse altro contenuto) */
    width: 100%; /* Prendi la larghezza completa nel container 'ready' */
  }

  /* --- Stili per il contenitore del toggle e icone (Aggiornato per dimensioni ridotte e icona dentro) --- */
  .theme-toggle-container {
    /* display: inline-flex; Rimosso */
    /* align-items: center; Rimosso */
    /* gap: 8px; Rimosso */
    /* Le icone sono dentro il thumb ora, non a lato */

    /* Resetta default button styles (Mantieni) */
    background: none;
    border: none;
    margin: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    outline: none;
    text-align: initial;

    /* --- Nuove/modificate proprietà per il layout interno --- */
    display: inline-block; /* O flex con width/justify-content */
    width: auto; /* La larghezza sarà data dai suoi contenuti (il track) */
    /* align-items: center; */ /* Se display: flex, allinea verticalmente */
    /* justify-content: center; */ /* Se display: flex, centra orizzontalmente */
    vertical-align: middle; /* Utile se display: inline-block */

    cursor: pointer;
    user-select: none;
    /* Aggiunto padding per l'area cliccabile se necessario */
    padding: 4px;
    box-sizing: border-box;
    /* Rimuovi margin-right se c'era */
  }

  /* Stili per la "traccia" del toggle (Aggiornato dimensioni) */
  .toggle-track {
    width: 40px; /* Larghezza più piccola */
    height: 20px; /* Altezza più piccola */
    background-color: var(--input-field-border);
    border-radius: 10px; /* Metà altezza per farlo a capsula */
    position: relative;
    transition: background-color 0.3s ease;
    /* Opzionale: aggiungi un'ombra leggera per profondità */
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  /* Colore traccia leggermente diverso in dark mode */
  :global(body.dark) .toggle-track {
    background-color: var(
      --input-field-border
    ); /* O un colore diverso, es. #555 */
  }

  /* Stili per il "thumb" (Aggiornato dimensioni e per contenere icone) */
  .toggle-thumb {
    width: 18px; /* Dimensione della pallina (poco meno dell'altezza traccia) */
    height: 18px; /* Dimensione della pallina */
    background-color: var(--accent-color); /* Colore della pallina/thumb */
    border-radius: 50%; /* Rendi circolare */
    position: absolute;
    top: 1px; /* Centra verticalmente (20px - 18px) / 2 = 1px */
    left: 1px; /* Posizione iniziale (light mode) */
    transition:
      left 0.3s ease,
      background-color 0.3s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); /* Piccola ombra per rilievo */

    /* --- Nuove proprietà per contenere e centrare l'icona --- */
    display: flex; /* Usa flexbox */
    align-items: center; /* Centra verticalmente l'icona */
    justify-content: center; /* Centra orizzontalmente l'icona */
    overflow: hidden; /* Nascondi parti dell'icona se esce (non dovrebbe succedere con icona più piccola) */
    /* --------------------------------------------------------- */
  }

  /* Sposta il thumb a destra quando il tema è dark */
  .toggle-thumb.dark-mode {
    /* Larghezza traccia - dimensione thumb - (2 * padding laterale) */
    left: calc(100% - 18px - 1px); /* 40 - 18 - 1 = 21px left */
    /* Opzionale: colore diverso per thumb in dark mode */
    /* background-color: var(--accent-color-dark); */
  }

  /* Stili per le icone DENTRO il thumb (Aggiornato dimensione e colore per contrasto) */
  .toggle-thumb .theme-icon {
    width: 14px; /* Dimensione più piccola per stare dentro il thumb */
    height: 14px;
    /* Colore icona per contrasto con il thumb (accent-color) */
    /* Usa un colore fisso (nero o bianco) o una variabile di tema per il testo */
    color: var(--color); /* Usa il colore del testo del tema principale */
    fill: currentColor;
    stroke: currentColor;
    transition: color 0.3s ease;
  }

  /* Opzionale: Adatta il colore delle icone nel thumb se necessario */
  /* ad esempio, se il var(--color) non funziona bene con var(--accent-color) */
  .toggle-thumb .sun-icon {
    color: var(--color); /* Solitamente bianco o nero */
  }
  .toggle-thumb .moon-icon {
    color: var(--color); /* Solitamente bianco o nero */
  }

  /* --- STILI PER MONITORED SITES --- */

  /* Stile per il titolo "Monitored Sites" */
  .state-ready h4 {
    text-align: center;
    margin-top: 15px; /* Spazio sopra il titolo della lista */
    margin-bottom: 10px;
    color: var(--text-color); /* Usa la variabile testo a tema */
    width: 100%; /* Assicurati che prenda la larghezza completa */
  }

  /* Stili per la lista dei siti */
  .site-list {
    list-style: none; /* Rimuove i pallini */
    padding: 0; /* Rimuove il padding di default */
    margin: 0; /* Rimuove i margini di default */
    width: 100%; /* Importante: fai riempire la larghezza disponibile */
    max-height: 200px; /* Imposta un'altezza massima per far scorrere SOLO la lista */
    overflow-y: auto; /* Aggiunge la scrollbar verticale se necessario */
    box-sizing: border-box; /* Include padding/border nel calcolo della larghezza */
    /* Opzionale: un piccolo padding laterale se non vuoi che gli item tocchino i bordi del container */
    /* padding-right: 5px; */
  }

  /* Stili scrollbar personalizzata per la lista (se hai applicato custom-scrollbar all'ul) */
  .site-list.custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .site-list.custom-scrollbar::-webkit-scrollbar-track {
    background: var(--background);
    border-radius: 4px;
  }
  .site-list.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: var(--accent-color);
    border-radius: 4px;
    border: 2px solid var(--background);
  }

  /* Stili per ogni singolo elemento della lista (Mantieni e assicurati usino variabili) */
  .site-item {
    margin-bottom: 12px;
    padding: 10px;
    border-radius: 5px;
    text-align: left; /* Testo allineato a sinistra */
    /* Usa variabili di tema per sfondo, bordo, colore testo */
    background-color: var(--site-item-background);
    border: 1px solid var(--input-field-border);
    color: var(--color); /* Colore testo principale dell'item */
    word-break: break-word; /* Evita overflow con URL lunghi */
  }

  /* Stili per il nome del sito */
  .site-item strong {
    display: block; /* Fa andare il nome su una nuova riga */
    font-size: 1em;
    margin-bottom: 5px;
    color: var(--accent-color); /* Colore accento per il nome */
  }

  /* Stili per Daily Limit e Time Remaining span */
  .site-item span {
    display: block; /* Ogni span su una nuova riga */
    font-size: 0.85em;
    margin-bottom: 3px;
    color: var(--color); /* Usa colore testo tema */
    opacity: 0.8; /* Rendi leggermente meno prominente */
  }

  /* Stile specifico per Time Remaining */
  .time-remaining {
    font-weight: bold;
    color: green; /* Colore fisso verde (o variabile tema se hai) */
    font-size: 0.9em; /* Leggermente più grande degli altri span */
  }

  /* Stile quando il tempo è scaduto */
  .time-remaining.expired {
    color: red; /* Colore fisso rosso (o variabile tema se hai) */
  }

  /* Stile per l'azione (Block/Warn) */
  .rule-action {
    font-size: 0.8em;
    color: orange; /* Colore fisso arancione (o variabile tema se hai) */
    font-weight: bold;
    margin-top: 5px;
    display: block; /* Su una nuova riga */
  }
</style>
