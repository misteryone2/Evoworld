# E1 — Ecosystem Intelligence & Scientific Simulation QA

Branch di lavoro: `research/e1-ecosystem-qa` (derivata da `main` a `c35c287`, aggiornata con rebase su `main` a `db86444`). Nessun merge in `main`. PR separata: #2.

## Scopo

Audit scientifico **del codice effettivamente eseguito** del motore biologico/ecologico di EvoWorld e costruzione di strumenti indipendenti per esperimenti riproducibili con seed. Non si modificano: motore, regole biologiche, geni/mutazioni/ereditarietà/selezione, renderer, moduli G1/G1-b, moduli G2 di anatomia/fenotipo, formati di salvataggio.

## Deliverable completati

| File | Contenuto |
|---|---|
| `E1_SCIENTIFIC_AUDIT.md` | Audit del motore, mappa dei sistemi, anomalie e limiti (distinzione implementato / possibile / non supportato) |
| `E1_EXPERIMENTS.md` | 12 scenari riproducibili con condizioni iniziali, variabili, durata, esito atteso, anomalie, criteri di successo |
| `E1_METRICS.md` | Definizioni operative delle metriche, vegetazione su celle geografiche distinte, `organismsSampled` vs `occupiedCellsSampled` |
| `E1_VALIDATION_REPORT.md` | Risultati **realmente eseguiti dopo E1.1**, con comandi, seed, numeri e limiti |
| `E1_1_HARDENING_REPORT.md` | Correzioni E1.1, file modificati, test eseguiti, anomalie aperte, compatibilità con `main` `db86444` |
| `scripts/e1_ecosystem.experiment.ts` | Harness indipendente (usato con `vitest.experiment.config.ts`), output predefinito in `os.tmpdir()` |
| `tools/e1/README.md` | Istruzioni d’uso degli strumenti indipendenti |
| `tests/e1/e1_metrics.test.ts` | Test isolati dell’harness e delle metriche (11/11 passati) |

## Stato verificato (E1.1, su `db86444`)

- `npx tsc --noEmit --incremental false`: exit 0.
- `npx vitest run tests/e1/e1_metrics.test.ts`: 11/11 passati.
- `npx next build`: exit 0.
- Esperimento completo: seed `11,12`, 900 tick (2700 per S12), 24 corse, 134.88 s; dettagli in `E1_VALIDATION_REPORT.md`.
- Suite completa: differenze rispetto a `main` `db86444` classificate in `E1_1_HARDENING_REPORT.md`; nessun errore deterministico introdotto da E1.

## Regole di coordinamento

- Claude: anatomia/fenotipo creature — **non toccato**.
- Vibe: renderer grafico — **non toccato**.
- Ogni risultato riportato deve indicare comando, seed, durata e esito osservato; nessun valore inventato.
- Nessun merge in `main`; PR #1 (G1-b) e PR #2 (E1) restano indipendenti.
