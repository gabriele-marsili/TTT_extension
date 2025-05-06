<script lang="ts">
  import { onMount } from "svelte";
  import type { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
  import { SvelteComponent } from "svelte"; // Necessario per il cast in popup.ts, anche se non usato direttamente qui

  // --- Props: Data passed from popup.ts ---
  // activeTabUrl is passed from popup.ts after fetching it with chrome.tabs.query
  // It can be a string URL, undefined (while loading), or a placeholder message string.
  export let activeTabUrl: string | undefined = undefined;
  // timeTrackerRules is initially an empty array, updated in onMount here or via background messages.
  export let timeTrackerRules: TimeTrackerRuleObj[] = [];

  // --- Local State ---
  // Theme preference ('light' or 'dark')
  let currentTheme: "light" | "dark" = "light";
  const THEME_STORAGE_KEY = "ttt-theme-preference"; // Key for Chrome storage

  $: if (typeof document !== "undefined") {
    document.body.className = currentTheme;
  }

  // --- Lifecycle: Actions to perform after mount ---
  onMount(() => {
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

    // Request the current list of rules from the background script
    chrome.runtime.sendMessage(
      { type: "GET_TIME_TRACKER_RULES" },
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

    // Listener for real-time updates handled in popup.ts, which updates props here.
    // No need for another listener directly in this component unless handling component-specific messages.
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
    // Use the Chrome API to create a new tab
    chrome.tabs.create({ url: "http://localhost:3000/timetracker" }); // *** Replace with your PWA URL ***
  }

  // The getSiteInfo function was not used in the template and is removed for clarity.
  // If you need it, add it back and ensure it's correctly implemented.
</script>

<div class="container {currentTheme}">
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
</div>

<style>
  .container {
    /* Increase width */
    width: 400px; /* Increased width */
    min-height: 450px; /* Add a minimum height so it's not too small when empty */
    max-height: 700px; /* Optional: set max height with overflow if needed */
    overflow-y: auto; /* Enable scroll if content exceeds max height */

    padding: 15px;
    font-family: sans-serif;
    text-align: center;

    /* Use theme variables */
    background-color: var(--background);
    color: var(--color);

    /* Remove or adjust existing styles from previous versions */
    margin: 0; /* Popups typically have no margin */
    border: 2px var(--button-border);
    border-radius: 10%;
  }

  /* Adjust scrollbar for the container if max-height is set */
  .container::-webkit-scrollbar {
    width: 8px;
  }
  .container::-webkit-scrollbar-track {
    background: var(--background);
    border-radius: 4px;
  }
  .container::-webkit-scrollbar-thumb {
    background-color: var(--accent-color);
    border-radius: 4px;
    border: 2px solid var(--background);
  }

  /* Styles for the theme switcher */
  .theme-switcher {
    text-align: right; /* Align switcher button to the right */
    margin-bottom: 10px; /* Space below the switcher */
  }
  .theme-switcher button {
    /* Style the switcher button using theme variables */
    padding: 5px 10px;
    font-size: 0.8em;
    cursor: pointer;
    background-color: var(--button-background);
    color: var(--color); /* Use theme color */
    border: 1px solid var(--button-border); /* Use theme border */
    border-radius: 4px;
    transition:
      background-color 0.3s ease,
      border-color 0.3s ease,
      color 0.3s ease;
  }
  .theme-switcher button:hover {
    background-color: color-mix(
      in srgb,
      var(--accent-color) 30%,
      transparent
    ); /* Hover effect using accent */
    border-color: var(--accent-color);
    color: var(--color); /* Ensure text color stays readable */
  }

  h3,
  h4 {
    text-align: center;
    margin-top: 0;
    margin-bottom: 10px;
    /* Use theme variables */
    color: var(--text-color);
  }

  h4 {
    margin-top: 15px;
  }

  .status {
    margin-bottom: 20px;
    font-size: 0.9em;
    text-align: center;
    word-break: break-all;
    /* Use theme variables if needed, otherwise keep default color */
    color: var(--color); /* Ensure text color respects theme */
  }
  .status strong {
    /* Use theme variables */
    color: var(--accent-color);
    display: block;
  }

  .site-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .site-item {
    margin-bottom: 12px;
    padding: 10px;
    border-radius: 5px;
    text-align: left;

    /* Use theme variables for item styling */
    background-color: var(
      --site-item-background
    ); /* Use the theme-specific item background variable */
    border: 1px solid var(--input-field-border); /* Use theme border variable */
    color: var(--color); /* Ensure text color inside item respects theme */
  }

  .site-item strong {
    display: block;
    font-size: 1em;
    margin-bottom: 5px;
    /* Use theme variables */
    color: var(--accent-color);
  }

  .site-item span {
    display: block;
    font-size: 0.85em;
    margin-bottom: 3px;
    /* Use theme variables */
    color: var(--color); /* Use theme color */
    opacity: 0.8; /* Make secondary text slightly less prominent */
  }

  .time-remaining {
    font-weight: bold;
    /* Keep hardcoded status colors or use theme variables */
    color: green; /* Standard green */
    font-size: 0.9em;
  }

  .time-remaining.expired {
    color: red; /* Standard red */
  }

  .rule-action {
    font-size: 0.8em;
    /* Keep hardcoded status colors or use theme variables */
    color: orange; /* Standard orange */
    font-weight: bold;
    margin-top: 5px;
    display: block;
  }

  .button-container {
    text-align: center;
    margin-top: 25px;
  }

  .button-container button {
    /* Target the button within its container */
    padding: 10px 20px;
    font-size: 1em;
    cursor: pointer;
    border-radius: 5px;
    transition:
      background-color 0.3s ease,
      border-color 0.3s ease,
      color 0.3s ease; /* Include color in transition */

    /* Use theme variables for button */
    background-color: var(--button-background);
    color: var(--color); /* Use theme color */
    border: 2px solid var(--button-border); /* Use theme border */
  }

  .button-container button:hover {
    background-color: color-mix(
      in srgb,
      var(--accent-color) 30%,
      transparent
    ); /* Hover effect using accent */
    border-color: var(--accent-color);
    color: var(--color); /* Ensure text color stays readable */
  }

  /* Custom scrollbar styles for site list if needed - applying to .custom-scrollbar class */
  .custom-scrollbar {
    /* Add max-height and overflow-y: auto to .site-list if you want scrolling list */
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: var(--background);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: var(--accent-color);
    border-radius: 4px;
    border: 2px solid var(--background);
  }
</style>
