<script lang="ts">
    import { onMount } from "svelte";
    import { TimeTrackerRuleObj } from "../types/timeTrackerTypes";
    import { PWA_URL, THEME_STORAGE_KEY } from "../types/userTypes";

    
    export let url: string;
    export let rule: TimeTrackerRuleObj | null = null;
    let theme: "light" | "dark" = "light"; 

    let message: string;
    let actionButtonText: string;

    $: {
        if (rule) {
            message = `Time limit reached for ${rule.site_or_app_name}. Daily limit: ${rule.minutesDailyLimit} minutes.`;
            actionButtonText = "Manage in TTT PWA";
        } else {
            message = `This site (${url}) is temporarily blocked.`;
            actionButtonText = "Go To TTT PWA";
        }
    }

    function handleActionButtonClick() {
        console.log("Blocker UI: Redirecting to PWA.");
        if (window != null && window.top != null) {
            window.top.location.href = PWA_URL;
        }
    }

    function updateCurrentTheme() {
        chrome.storage.local.get(THEME_STORAGE_KEY, (result) => {
            if (result[THEME_STORAGE_KEY]) {
                theme = result[THEME_STORAGE_KEY];
                console.log("Popup Svelte: Loaded theme preference:", theme);
            } else {
                const prefersDark = window.matchMedia(
                    "(prefers-color-scheme: dark)",
                ).matches;
                theme = prefersDark ? "dark" : "light";
                console.log(
                    "Popup Svelte: No theme preference saved, defaulting to system preference:",
                    theme,
                );
            }
        });
    }

    
    onMount(() => {
        updateCurrentTheme();
        console.log("Blocker mounted, theme " + theme);
    });
    
</script>

<div class="block-container {theme}">
    <div class="block-message">
        {message}
    </div>
    <div class="blocked-url">
        {url}
    </div>
    <button
        on:click={handleActionButtonClick}
        class="baseButtonHigher elevated"
    >
        {actionButtonText}
    </button>
</div>

<style>
    

    .block-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: var(--background);
        color: var(--color);
        z-index: 2147483647; 
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        font-family: "Poppins", sans-serif; 
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
        transition:
            background-color 0.3s ease,
            color 0.3s ease; 
    }

    .block-message {
        font-size: 2em;
        margin-bottom: 20px;
        text-align: center;
        max-width: 90%;
        font-weight: 600; 
    }

    .blocked-url {
        font-size: 1.2em;
        margin-bottom: 30px;
        color: var(--accent-color); 
        word-break: break-all;
        padding: 0 20px;
        text-align: center;
        font-family: monospace; 
    }

    button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        color: var(--color); 
        background: var(--button-background);
        border: 2px solid var(--button-border); 
        height: 40px;
        padding: 0 15px;
        border-radius: 4px;
        font-size: 0.9rem;
        cursor: pointer;
        transition:
            background-color 0.3s ease,
            border-color 0.3s ease;
        text-align: center;
        min-width: 150px;
        font-weight: 500;
    }

    button:hover {
        
        background-color: rgba(16, 185, 129, 0.305);
    }

    .elevated {
        box-shadow: var(--shadow);
        transition: box-shadow 0.3s ease-in-out;
    }

    .elevated:hover {
        box-shadow: 0px 4px 6px var(--accent-color);
    }
</style>
