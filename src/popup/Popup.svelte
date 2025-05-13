<script lang="ts">
  import { onMount } from "svelte";
  import type { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
  import { PWA_URL, THEME_STORAGE_KEY, userDBentry } from "../types/userTypes";

  // --- Component State ---
  // 'loading': Show spinner and message
  // 'ready': Show main content
  let currentState: "loading" | "ready" = "loading";

  let activeTabUrl: string | undefined = undefined;
  let errorLogText = "";
  export let timeTrackerRules: TimeTrackerRuleObj[] = [];

  // --- Local State ---
  let currentTheme: "light" | "dark" = "light";
  let waitingText =
    "Please log in to the Time Tracker PWA to sync your rules and status.";
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
        if (lastUserInfoUpdateTimestamp)
          console.log(
            "now - lastUserInfoUpdateTimestamp = ",
            now - lastUserInfoUpdateTimestamp,
            " < LOGIN_VALIDITY_DURATION_MS ? ",
            LOGIN_VALIDITY_DURATION_MS,
            " : ",
            now - lastUserInfoUpdateTimestamp < LOGIN_VALIDITY_DURATION_MS,
          );
        if (
          userInfo &&
          lastUserInfoUpdateTimestamp &&
          now - lastUserInfoUpdateTimestamp < LOGIN_VALIDITY_DURATION_MS
        ) {
          console.log(
            "userInfo.timeTrackerActive : ",
            userInfo.timeTrackerActive,
          );
          if (userInfo.timeTrackerActive) {
            // User is logged in and login is recent (within 24h)
            console.log(
              "Popup Svelte: User logged in recently. Transitioning to ready state.",
            );
            currentState = "ready";
            
            requestTimeTrackerRules();
          } else {
            currentState = "loading";
            waitingText = "Time Tracker Mode disabled, activate it via TTT app";
          }
        } else {
          
          console.log(
            "Popup Svelte: User not logged in or login expired. Showing loading/wait state.",
          );
          currentState = "loading";
          waitingText =
            "Please log in to the Time Tracker PWA to sync your rules and status.";
          
        }
      },
    );
  }

  async function syncronizeTimeTrackerRulesByLocalStorage() {
    const storedData = await chrome.storage.local.get([
      "timeTrackerRules",
    ]);
    timeTrackerRules = storedData.timeTrackerRules || [];
  }

  function requestTimeTrackerRules() {
    console.log("Popup Svelte: Requesting tracking rules from background.");
    let reqID = "ID:" + Date.now();

    
    //richiede regole in modo asincrono :
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
            
            const existingRule = rulesMap[pwaRule.id]; 

            if (existingRule) {
              
              if (pwaRule.remainingTimeMin < existingRule.remainingTimeMin) {
                
                rulesMap[pwaRule.id] = pwaRule;
                console.log(
                  `Aggiornata regola con ID ${pwaRule.id}. Nuovo remainingTimeMin: ${pwaRule.remainingTimeMin}`,
                );
              }
              
            } else {
              
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
          syncronizeTimeTrackerRulesByLocalStorage()
          .then(()=>console.log(prefisso+"tt rules sincronizzate"))
        }
      },
    );

    
  }

  
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
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        currentTheme = prefersDark ? "dark" : "light";
        console.log(
          "Popup Svelte: No theme preference saved, defaulting to system preference:",
          currentTheme,
        );
      }
      
    });

    //load time tracker rules by local storage :
    chrome.storage.local.get("timeTrackerRules", (result) => {
      console.log("chrome storage get timeTrackerRules res :\n", result);
      if (result["timeTrackerRules"]) {
        timeTrackerRules = result["timeTrackerRules"];
      }
    });

    checkLoginStatus();

    // --- Listener for messages from background script ---

    // This listener handles the signal that the PWA has logged the user in
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === "USER_LOGGED_IN_VIA_PWA") {
        console.log(
          "Popup Svelte: Received USER_LOGGED_IN_VIA_PWA signal. Checking storage for user info...",
        );

        checkLoginStatus();
        
      }

      if (request.type === "UPDATED_STATE" && request.data != undefined) {
        const data: {
          timeTrackerRules: TimeTrackerRuleObj[];
          blacklistedSites: string[];
          pwaOrigin?: undefined | string;
        } = request.data;

        timeTrackerRules = data.timeTrackerRules;
      }

      if (request.type === "ERROR_LOG" && request.errorMessage != undefined) {
        errorLogText = request.errorMessage;
        console.log("[Popup Svlete] error log : " + errorLogText);
        setTimeout(() => {
          errorLogText = "";
        }, 5000); //delete error message after 5s
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

  
  
  function toggleTheme() {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    console.log("Popup Svelte: Toggling theme to", currentTheme);
    
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: currentTheme }, () => {
      console.log("Popup Svelte: Theme preference saved:", currentTheme);
    });
    
  }
  function formatRemainingTime(minutes: number | undefined): string {
    if (minutes === undefined || minutes === null) return "N/A"; 
    if (minutes <= 0) return "Limit Reached!"
    const totalSeconds = Math.max(0, Math.floor(minutes * 60));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mins}m ${formattedSecs}s`;
  }

  function goToPwa() {
    console.log("Popup Svelte: Opening PWA in a new tab.");
    
    chrome.storage.local.get(["pwaOrigin"], (result) => {
      const pwaUrl = result.pwaOrigin || PWA_URL + "/home"; // Fallback
      chrome.tabs.create({ url: pwaUrl });
    });
  }

</script>

<div class="app-container {currentTheme} state-{currentState}">
  {#if currentState === "loading"}
    <div class="loading-container">
      <div class="spinner"></div>
      <h3>Waiting for PWA...</h3>
      <p>
        {waitingText}
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

    {#if errorLogText != ""}
      <h4 class="errorText">{errorLogText}</h4>
    {/if}

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

  .button-container {
    text-align: center;
    margin-top: 25px;
    margin-bottom: 15px; 
    width: 100%; 
  }
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
    background-color: color-mix(in srgb, var(--accent-color) 30%, transparent);
    border-color: var(--accent-color);
    color: var(--color);
  }

  .theme-switcher {
    text-align: center; 
    margin-top: 10px; 
    margin-bottom: 10px; 
    width: 100%; 
  }

  
  .theme-toggle-container {
    
    background: none;
    border: none;
    margin: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    outline: none;
    text-align: initial;

    
    display: inline-block;
    width: auto; 
    
    vertical-align: middle; 

    cursor: pointer;
    user-select: none;
    padding: 4px;
    box-sizing: border-box;
  }

  
  .toggle-track {
    width: 40px; 
    height: 20px;
    background-color: var(--input-field-border);
    border-radius: 10px;
    position: relative;
    transition: background-color 0.3s ease;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  :global(body.dark) .toggle-track {
    background-color: var(
      --input-field-border
    ); 
  }

  .toggle-thumb {
    width: 18px; 
    height: 18px; 
    background-color: var(--accent-color); 
    border-radius: 50%;
    position: absolute;
    top: 1px; 
    left: 1px; 
    transition:
      left 0.3s ease,
      background-color 0.3s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);

    
    display: flex;
    align-items: center; 
    justify-content: center; 
    overflow: hidden;
  }

  .toggle-thumb.dark-mode {
    left: calc(100% - 18px - 1px); /* 40 - 18 - 1 = 21px left */
  }

  .toggle-thumb .theme-icon {
    width: 14px;
    height: 14px;
    color: var(--color);
    fill: currentColor;
    stroke: currentColor;
    transition: color 0.3s ease;
  }

  .toggle-thumb .sun-icon {
    color: var(--color); 
  }
  .toggle-thumb .moon-icon {
    color: var(--color); 
  }

  /* --- STILI PER MONITORED SITES --- */
  
  .state-ready h4 {
    text-align: center;
    margin-top: 15px; 
    margin-bottom: 10px;
    color: var(--text-color); 
    width: 100%; 
  }


  .site-list {
    list-style: none;
    padding: 0;
    margin: 0; 
    width: 100%; 
    max-height: 200px; 
    overflow-y: auto;
    box-sizing: border-box; 
  }

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

  .site-item {
    margin-bottom: 12px;
    padding: 10px;
    border-radius: 5px;
    text-align: left;
    background-color: var(--site-item-background);
    border: 1px solid var(--input-field-border);
    color: var(--color); 
    word-break: break-word;
  }

  .site-item strong {
    display: block;
    font-size: 1em;
    margin-bottom: 5px;
    color: var(--accent-color);
  }

  .site-item span {
    display: block; 
    font-size: 0.85em;
    margin-bottom: 3px;
    color: var(--color);
    opacity: 0.8; 
  }

  .time-remaining {
    font-weight: bold;
    color: green; 
    font-size: 0.9em; 
  }

  .time-remaining.expired,
  .state-ready .errorText {
    color: red;
  }

  .rule-action {
    font-size: 0.8em;
    color: orange; 
    font-weight: bold;
    margin-top: 5px;
    display: block; 
  }
</style>
