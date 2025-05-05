<script lang="ts">
  import { onMount } from "svelte";
  let siteUrl = "";

  onMount(() => {
    siteUrl = window.location.href; // O passa l'URL come prop se inietti diversamente
  });

  function goToPwa() {
    // Reindirizza alla tua PWA. Assicurati che l'origine sia corretta.
    if (window != null && window.top != null) {
      window.top.location.href = "http://localhost:3000/timetracker"; // Sostituisci con l'URL della tua PWA
    }
  }
</script>

<div class="block-container">
  <div class="block-message">This site is temporarily blocked.</div>
  <div class="blocked-url">
    {siteUrl}
  </div>
  <button on:click={goToPwa}> Go To TimeTracker (TTT PWA) </button>
</div>

<style>
  .block-container {
    /* Stili per centrare e coprire la pagina */
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255, 255, 255, 0.98); /* Sfondo semi-trasparente */
    z-index: 99999;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-family: sans-serif;
    color: #333;
  }

  .block-message {
    font-size: 2em;
    margin-bottom: 20px;
    text-align: center;
  }

  .blocked-url {
    font-size: 1.2em;
    margin-bottom: 30px;
    color: #e53935; /* Rosso per l'URL */
    word-break: break-all; /* Evita overflow per URL lunghi */
    padding: 0 20px;
  }

  button {
    padding: 10px 20px;
    font-size: 1.1em;
    cursor: pointer;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    transition: background-color 0.3s ease;
  }

  button:hover {
    background-color: #0056b3;
  }
</style>
