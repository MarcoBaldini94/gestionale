# Bilancio personale — web app

Patrimonio, entrate, tasse e scadenze personali. Ex foglio CALCOLO_TASSE_v3, poi artefatto claude.ai, ora PWA su GitHub Pages: `https://marcobaldini94.github.io/bilancio-personale/`.

## Dati e privacy

- I dati restano nel browser (`localStorage`, chiave `bilancio-personale-v1`). Il repository non contiene dati personali: `backup/` e i file JSON di esportazione sono in `.gitignore`.
- Ogni modifica viene inviata all'**Hub** su PC2 (Tailscale) come file nuovo in `backup/` (app `bilancio` in `hub_config.json`).
- Su un dispositivo nuovo: **Collegamenti e backup → Ripristina dall'ultimo backup** (oppure *Importa backup…* da file).

## Collegamento con l'app Guadagni sondaggi

Le due app stanno sulla stessa origine (`marcobaldini94.github.io`), quindi questa legge direttamente i dati dell'altra (`survey-earnings-tracker-v1`) sullo stesso dispositivo. Legge anche l'ultimo backup dell'app sondaggi dall'Hub (`GET /api/guadagni/backup/ultimo`) e usa il dato più recente.

Regola: dal primo mese presente nell'app sondaggi fino al mese corrente, la colonna **Sondaggi** delle Entrate = somma dei **prelievi** (`p`) del mese su tutti i portali, registrata all'ultimo giorno del mese (righe con `ext: "guadagni"`). Le celle diventano in sola lettura. I mesi precedenti restano manuali. Il controllo avviene all'apertura, quando la finestra torna in primo piano e quando l'app sondaggi salva in un'altra scheda.

Per collegare altre app in futuro: stessa origine + chiave `localStorage` nota, con l'Hub come ripiego tra dispositivi.

## Pubblicazione (GitHub Pages)

1. Crea su GitHub il repository `bilancio-personale` (pubblico, vuoto).
2. Da questa cartella: `git init -b main`, `git add -A`, `git commit -m "Prima versione"`, `git remote add origin https://github.com/MarcoBaldini94/bilancio-personale.git`, `git push -u origin main`. Prima del push controlla con `git ls-files` che non ci siano file `.json` né la cartella `backup/`.
3. Settings → Pages → Deploy from a branch → `main`, `/ (root)`.

## Aggiornare l'app

Dopo una modifica aumenta `VERSION` in `sw.js` e fai push.

## Struttura

| File | Ruolo |
|---|---|
| `index.html`, `styles.css`, `app.js` | Interfaccia e logica (palette Mediterranea) |
| `manifest.webmanifest`, `sw.js` | Installazione e funzionamento offline |
| `fonts/` | Bricolage Grotesque, IBM Plex Sans/Mono (SIL OFL 1.1) |
| `icons/` | Icone |
