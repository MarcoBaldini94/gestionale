# CLAUDE.md — Bilancio personale (webapp)

Contesto per chi riprende il lavoro su questa cartella. Nessun dato personale qui: il repository è pubblico.

## Cos'è
PWA statica (niente build) pubblicata su GitHub Pages: https://marcobaldini94.github.io/bilancio-personale/ (repo `MarcoBaldini94/bilancio-personale`, branch `main`, root). Porting dell'artefatto claude.ai "Bilancio personale" (ex foglio CALCOLO_TASSE_v3). Palette "Mediterranea": se si cambiano colori, verificare che siano coerenti in tutte le schede (token CSS in `:root`, varianti dark).

## File
- `index.html` — scheletro (header, tabs, `#view`), registra `sw.js`.
- `app.js` — tutta la logica in un IIFE: modello dati v3 (`defaults/migrate/sanitize/load`), calcoli (`calc`), viste `V.<scheda>`, binding input `data-i` (percorsi in `S`) e output `data-o` (percorsi in `R`), poi in fondo il livello di salvataggio/collegamenti (sezione "salvataggio sul dispositivo").
- `styles.css` — font locali + stili dell'artefatto + sezione finale "webapp".
- `sw.js` — rete prima, cache se offline. Cache con prefisso `bilancio-`; all'activate cancella SOLO cache `bilancio-*` (stessa origine condivisa con altre app). **A ogni modifica aumentare `VERSION`.**
- `manifest.webmanifest`, `icons/`, `fonts/` (OFL).

## Dati e backup
- localStorage `bilancio-personale-v1` = oggetto `S` (formato v3). Nessun server.
- Hub su PC2 via Tailscale (cartella `Claude/Hub web app`): `POST /api/bilancio/backup` 8 s dopo ogni modifica (dedup per SHA-256), mai se `hasRealData(S)` è falso. File in `backup/` (gitignored). Ripristino: `GET /api/bilancio/backup/ultimo`.
- URL Hub condiviso tra le app: chiave `hub-url`; stato in `bilancio-hub-stato`.
- `.gitignore` esclude `backup/` e tutti i `.json` di esportazione/import: verificare `git ls-files` prima di ogni push.

## Collegamento con Guadagni sondaggi
- Locale (stessa origine): localStorage `survey-earnings-tracker-v1` → `{months:{"YYYY-MM":{sito:{g,p}}}, updatedAt}`, importi in centesimi.
- Remoto: `GET /api/guadagni/backup/ultimo` (timestamp dal nome file `guadagni-YYYY-MM-DD_hhmmss.json`). Vince il più recente.
- `applySond`: dal primo mese presente nell'app sondaggi al mese corrente, per ogni mese rimuove le righe `fonte:"sond"` e aggiunge una riga `{id:"sond-YYYY-MM", data: ultimo giorno, fonte:"sond", importo: Σp/100, ext:"guadagni"}` se >0. Intervallo in `S.sondExt {da,a,fonte,agg}`; `sondCovers(ym)` rende le celle "auto" in sola lettura e blocca l'inserimento manuale.
- Trigger: avvio, `visibilitychange`, evento `storage` sulla chiave dell'altra app, `online`, tasto «Aggiorna ora».
- Cambi di dati esterni con un input attivo: `afterExternalChange` rimanda il render al blur (gli indici `registro.N` cambiano).

## Collegamento con i cedolini (scheda `#cedolini`)
- I PDF stanno nella cartella OneDrive «Assistente Finanziario/Cedolini» (fuori dal repo). L'Hub li legge in locale (`cedolini_hub.py`, `parser_cedolini.py`, `pdf_testo.py` nella cartella dell'Hub) e pubblica `GET /api/cedolini/archivio`; `POST /api/cedolini/classifica` conferma i codici voce nuovi, `POST /api/cedolini/aggiorna` rilegge subito.
- `applyCed`: per ogni cedolino con `controllo.ok`, nel mese di pagamento (`dataPagamento`) toglie le righe `ssn`/`intra` di quel mese e aggiunge `{id:"ced-ssn-YYYY-MM", fonte:"ssn", importo: netto, ext:"cedolini"}` e, se >0, `{id:"ced-intra-YYYY-MM", fonte:"intra", importo: Σ competenze tipo prestazioni_aggiuntive}`. Mesi senza cedolino verificato restano manuali.
- `S.ced = {agg, lista, mesi, errori}`: archivio (solo voci economiche, `cleanCed`), mesi coperti; `cedCovers(ym,fonte)` rende in sola lettura le celle `ssn`/`intra` (Entrate, Tasse) e blocca l'inserimento manuale.
- Trigger: avvio, `visibilitychange`, `online`, ripristino, «Aggiorna ora». Stato in localStorage `bilancio-ced-stato`.
- Voce di cedolino: `{codice, descrizione, categoria: competenza|inps|previdenza_altro|irpef|addizionale|sostitutiva|altra_trattenuta, tipo (solo competenze): fissa|variabile|prestazioni_aggiuntive|una_tantum, riferimento: YYYY-MM, importo}` (schema dell'artefatto "Archivio cedolini"). TFR: tra le trattenute (sul cedolino è una competenza negativa), quindi il lordo mostrato supera il «Totale competenze» stampato.
- Da fare: proiezione IRPEF dell'anno (conguaglio, addizionali) e registro turni con verifica pagamenti a +2 mesi.

## Scheda «Collegamenti e backup» (`#collegamenti`)
Stato sondaggi, cedolini, Hub (salva e prova / backup ora / ripristina), backup su file (scarica / importa: accetta S v3, risposta Hub `{dati}`, dump db artefatto).

## Test
Server statico che serve la cartella sotto `/bilancio-personale/` + finto Hub con CORS su 127.0.0.1:8765 (ping, guadagni/ultimo, bilancio/backup). Verificato con Playwright: import, sync sondaggi (locale vs Hub), backup, ripristino, blocco inserimento manuale, SW registrato, layout mobile 390 px.

## Possibili sviluppi
- Altre app collegabili con lo stesso schema (chiave localStorage nota + Hub come ripiego).
- scheda-v3 ha ancora il service worker che cancella tutte le cache dell'origine.
