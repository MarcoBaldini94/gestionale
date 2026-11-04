# Gestionale — web app

Lavoro, entrate, patrimonio, tasse e scadenze personali in un'unica app interconnessa (ex «Bilancio personale», ex foglio CALCOLO_TASSE_v3). PWA su GitHub Pages: `https://marcobaldini94.github.io/gestionale/`.

## Sezioni

- **Bilancio**: dashboard, patrimonio, scadenzario, entrate, tasse, andamento, cedolini.
- **Lavoro**: cartellini presenze (ore, recupero, ferie, guardie, attività aggiuntiva) e verifica dei pagamenti nei cedolini.
- **Sondaggi** (prelievi dall'app Guadagni sondaggi, per ora collegata da fuori).

## Dati e privacy

- I dati restano nel browser (`localStorage`, chiave `bilancio-personale-v1`: nome storico, non cambiarlo). Il repository non contiene dati personali: `backup/` e i file JSON di esportazione sono in `.gitignore`.
- Ogni modifica viene inviata all'**Hub** su PC2 (Tailscale) come file nuovo in `backup/` (app `bilancio` in `hub_config.json`).
- Cedolini e cartellini PDF sono letti in locale dall'Hub; qui arrivano solo i dati economici e orari, senza anagrafica.
- Su un dispositivo nuovo: **Collegamenti e backup → Ripristina dall'ultimo backup** (oppure *Importa backup…* da file).

## Collegamento con l'app Guadagni sondaggi

Stessa origine (`marcobaldini94.github.io`): l'app legge direttamente `survey-earnings-tracker-v1` sullo stesso dispositivo, oppure l'ultimo backup dall'Hub (`GET /api/guadagni/backup/ultimo`), e usa il dato più recente. Dal primo mese dell'app sondaggi, Entrate › Sondaggi = somma dei prelievi del mese.

## Aggiornare l'app

Dopo una modifica aumenta `VERSION` in `sw.js` e lancia `pubblica_webapp.bat` (controlla con `git ls-files` che non ci siano file `.json` né `backup/`).

## Struttura

| File | Ruolo |
|---|---|
| `index.html`, `styles.css`, `app.js` | Interfaccia e logica (palette Mediterranea) |
| `manifest.webmanifest`, `sw.js` | Installazione e funzionamento offline |
| `fonts/` | Bricolage Grotesque, IBM Plex Sans/Mono (SIL OFL 1.1) |
| `icons/` | Icone (tre nodi collegati) |
