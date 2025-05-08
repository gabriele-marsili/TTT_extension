<script lang="ts">
  import { onMount } from "svelte";
  import type { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
  import { userDBentry } from "../types/userTypes";

  // --- Component State ---
  // 'loading': Show spinner and message
  // 'ready': Show main content
  let currentState: "loading" | "ready" = "loading";

  // activeTabUrl is passed from popup.ts after fetching it with chrome.tabs.query
  // It can be a string URL, undefined (while loading), or a placeholder message string.
  export let activeTabUrl: string | undefined = undefined;
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
    let reqID = "ID:"+Date.now()
    // Request the current list of rules from the background script
    chrome.runtime.sendMessage(
      { type: "GET_TIME_TRACKER_RULES", requestId : reqID},
      (response) => {
        console.log(
          "Popup Svelte: Received GET_TIME_TRACKER_RULES response:\n",
          response,
        );
        if (response && Array.isArray(response.timeTrackerRules)) {
          timeTrackerRules = response.timeTrackerRules;
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

    // --- Logic for Initial State (Loading vs. Ready) ---
    checkLoginStatus();

    // --- Listener for messages from background script ---
    // This listener handles the signal that the PWA has logged the user in
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log(
        "Popup Svelte: Received message from background:",
        request.type,
      );
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
    <div class="theme-switcher">
      <button on:click={toggleTheme}>
        {currentTheme === "light" ? "Switch to Dark" : "Switch to Light"}
      </button>
    </div>

    <h3>TTT Time Tracker Status</h3>

    <div class="status">
      Active Tab: <strong>
        {#if activeTabUrl === undefined}
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
  {/if}
</div>

<style>
  /* Apply theme variables to the app container */
  .app-container {
    /* Match the dimensions of your main container */
    width: 400px;
    min-height: 450px;
    max-height: 700px;
    overflow-y: auto;
    padding: 15px;
    font-family: sans-serif;
    text-align: center;
    background-color: var(--background);
    color: var(--color);
    margin: 0;
    border: 2px var(--button-border);
    border-radius: 10%;
    display: flex; /* Use flexbox to center content easily */
    flex-direction: column; /* Stack content vertically */
    justify-content: center; /* Center vertically */
    align-items: center; /* Center horizontally */
  }

  /* Adjust scrollbar for the container */
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

  /* Loading State Styles */
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* Take up available space within the app-container */
    flex-grow: 1;
    padding: 20px;
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

  .loading-container h3 {
    color: var(--text-color);
    margin-bottom: 10px;
  }

  .loading-container p {
    color: var(--color);
    margin-bottom: 20px;
    text-align: center;
    font-size: 0.9em;
  }

  .loading-status {
    margin-top: 20px;
    font-size: 0.8em;
    opacity: 0.7;
  }
  .loading-status strong {
    color: var(--accent-color);
    display: block;
  }

  /* Ready State Styles (Keep your existing styles, but make sure they apply correctly inside .app-container) */
  /* You might need to adjust selectors if your existing styles were applied directly to .container */

  .state-ready .theme-switcher {
    text-align: right;
    width: 100%; /* Ensure it takes full width to align button right */
    margin-bottom: 10px;
  }
  .state-ready .theme-switcher button {
    padding: 5px 10px;
    font-size: 0.8em;
    cursor: pointer;
    background-color: var(--button-background);
    color: var(--color);
    border: 1px solid var(--button-border);
    border-radius: 4px;
    transition:
      background-color 0.3s ease,
      border-color 0.3s ease,
      color 0.3s ease;
  }
  .state-ready .theme-switcher button:hover {
    background-color: color-mix(in srgb, var(--accent-color) 30%, transparent);
    border-color: var(--accent-color);
    color: var(--color);
  }

  .state-ready h3,
  .state-ready h4 {
    text-align: center;
    margin-top: 0;
    margin-bottom: 10px;
    color: var(--text-color);
    width: 100%; /* Take full width */
  }

  .state-ready h4 {
    margin-top: 15px;
  }

  .state-ready .status {
    margin-bottom: 20px;
    font-size: 0.9em;
    text-align: center;
    word-break: break-all;
    color: var(--color);
    width: 100%; /* Take full width */
  }
  .state-ready .status strong {
    color: var(--accent-color);
    display: block;
  }

  .state-ready .site-list {
    list-style: none;
    padding: 0;
    margin: 0;
    width: 100%; /* Ensure list takes full width */
    max-height: 300px; /* Add max height for the list itself if needed */
    overflow-y: auto; /* Add scroll to the list if it exceeds max height */
  }
  /* Scrollbar for site list if it scrolls */
  .state-ready .site-list::-webkit-scrollbar {
    width: 8px;
  }
  .state-ready .site-list::-webkit-scrollbar-track {
    background: var(--background);
    border-radius: 4px;
  }
  .state-ready .site-list::-webkit-scrollbar-thumb {
    background-color: var(--accent-color);
    border-radius: 4px;
    border: 2px solid var(--background);
  }

  .state-ready .site-item {
    margin-bottom: 12px;
    padding: 10px;
    border-radius: 5px;
    text-align: left;
    background-color: var(--site-item-background);
    border: 1px solid var(--input-field-border);
    color: var(--color);
  }

  .state-ready .site-item strong {
    display: block;
    font-size: 1em;
    margin-bottom: 5px;
    color: var(--accent-color);
  }

  .state-ready .site-item span {
    display: block;
    font-size: 0.85em;
    margin-bottom: 3px;
    color: var(--color);
    opacity: 0.8;
  }

  .state-ready .time-remaining {
    font-weight: bold;
    color: green;
    font-size: 0.9em;
  }

  .state-ready .time-remaining.expired {
    color: red;
  }

  .state-ready .rule-action {
    font-size: 0.8em;
    color: orange;
    font-weight: bold;
    margin-top: 5px;
    display: block;
  }

  .button-container {
    text-align: center;
    margin-top: 25px;
    width: 100%; /* Ensure button container takes full width */
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
</style>
