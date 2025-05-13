## Installazione

Segui questi passaggi per installare e avviare l'estensione nel tuo browser (Chrome è il browser raccomandato per il testing e l'utilizzo).

OSS : l'estensione è cruciale per sfruttare le funzionalità relative al TimeTracker nella PWA TTT

1.  **Naviga nella root directory dell'estensione:**
    Apri il tuo terminale o prompt dei comandi e spostati nella directory principale del progetto dell'estensione (presumibilmente chiamata `TTT_extension`):
    ```bash
    cd TTT_extension
    ```

2.  **Installa le dipendenze e compila TypeScript:**
    Esegui i seguenti comandi per installare tutte le librerie necessarie e compilare il codice TypeScript in JavaScript:
    ```bash
    npm install
    tsc
    ```

3.  **Esegui la build di produzione:**
    Questo comando utilizzerà Vite per compilare e ottimizzare il codice sorgente dell'estensione, creando i file pronti per essere caricati nel browser. La build verrà creata nella cartella `/dist`.
    ```bash
    npm run build
    ```

4.  **Carica l'estensione nel browser (Chrome):**
    Ora che hai la cartella `/dist` con la build dell'estensione, puoi caricarla in Chrome come estensione "non pacchettizzata":
    * Apri Google Chrome.
    * Digita `chrome://extensions` nella barra degli indirizzi e premi Invio.
    * Abilita la **Modalità sviluppatore** (Developer mode) attivando l'interruttore in alto a destra.
    * Clica sul pulsante **"Carica estensione non pacchettizzata"** (Load unpacked).
    * Nella finestra di dialogo, naviga fino alla directory root del tuo progetto (`TTT_extension`) e seleziona la cartella **`/dist`** che è stata creata nel passaggio precedente.
    * Clica su "Seleziona cartella".

L'estensione dovrebbe ora apparire nell'elenco delle estensioni installate e dovrebbe essere attiva. Potrebbe essere necessario aggiornare o riavviare le schede del browser per vederla in azione.

L'estensione si sincronizza e viene utilizzata assieme alla PWA, che sarà responsabile dell'invio dei dati relativi al login.
Una volta loggati nella PWA sarà possibile accedere anche all'estensione ed alle relative funzioni.