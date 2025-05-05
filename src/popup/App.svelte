<script lang="ts">
  import { onMount } from "svelte";
  import type { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
  let activeTabUrl = "C../lib/Counter.svelte";
  let timeTrackerRules: TimeTrackerRuleObj[] = [];

  onMount(() => {
    // Richiedi lo stato al background script all'apertura del popup
    chrome.runtime.sendMessage(
      { type: "GET_TIME_TRACKER_RULES" },
      (response) => {
        if (response) {
          activeTabUrl = response.activeTabUrl || "Nessuna tab attiva o URL";
          timeTrackerRules = response.timeTrackerRules;
          console.log("Popup: Stato ricevuto:", response);
        } else {
          console.error("Popup: Nessuna risposta dallo script di background.");
          activeTabUrl = "Errore nel caricamento dello stato.";
        }
      },
    );

    // Potresti voler aggiungere un listener per gli aggiornamenti in tempo reale
    // (richiede che il background script invii messaggi al popup)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === "UPDATE_SITE_TIMERS") {
        // Il background script dovrebbe inviarlo periodicamente o su cambio stato
        console.log("Popup: Ricevuto aggiornamento timer", request.payload);
      }
    });
  });

  // Funzione per formattare i secondi in minuti:secondi
  function formatTime(seconds: number) {
    if (seconds === undefined || seconds === null) return "N/D";
    if (seconds <= 0) return "Limite raggiunto!";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  function getSiteInfo(url: string): TimeTrackerRuleObj {
    let info = timeTrackerRules.find((site) =>
      url.includes(site.site_or_app_name),
    );
    if (!info) {
      return {
        id: "0",
        site_or_app_name: "not found",
        minutesDailyLimit: 99999,
        rule: "only notify",
        category: "-",
        remainingTimeMin: 99999,
      };
    }
    return info;
  }
</script>

<div class="container">
  <h3>TTT Time Tracker Status</h3>
  <div class="status">
    Tab Attiva: <strong>{activeTabUrl}</strong>
  </div>

  <h4>Siti Monitorati:</h4>
  {#if Object.keys(timeTrackerRules).length > 0}
    <ul class="site-list">
      {#each timeTrackerRules as timeTrackerRule}
        <li class="site-item">
          <strong>{timeTrackerRule.site_or_app_name}</strong>
          <span>Limite: {timeTrackerRule.minutesDailyLimit} minuti</span><br />
          <span
            class="time-remaining"
            class:expired={timeTrackerRule.remainingTimeMin <= 0}
          >
            Tempo Rimanente: {formatTime(timeTrackerRule.remainingTimeMin)}
          </span>          
        </li>
      {/each}
    </ul>
  {:else}
    <p>Nessun sito monitorato configurato.</p>
  {/if}
</div>

<style>
  .container {
    width: 280px;
    padding: 10px;
  }
  h3 {
    margin-top: 0;
  }
  .status {
    margin-bottom: 15px;
    font-size: 0.9em;
  }
  .site-list {
    list-style: none;
    padding: 0;
  }
  .site-item {
    margin-bottom: 8px;
    padding: 5px;
    border-bottom: 1px solid #eee;
  }
  .site-item strong {
    display: block;
    font-size: 1.1em;
  }
  .site-item span {
    font-size: 0.9em;
    color: #555;
  }
  .time-remaining {
    font-weight: bold;
    color: green; /* Verde per tempo rimanente > 0 */
  }
  .time-remaining.expired {
    color: red; /* Rosso per limite raggiunto */
  }
</style>
