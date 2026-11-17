# E1 — Ecosystem Intelligence & Scientific Simulation QA

Branch di lavoro: `research/e1-ecosystem-qa` (derivata da `main` a `c35c287`). Nessun merge in `main`.

## Scopo

Audit scientifico **del codice effettivamente eseguito** del motore biologico/ecologico di EvoWorld e costruzione di strumenti indipendenti per esperimenti riproducibili con seed. Non si modificano: motore, regole biologiche, geni/mutazioni/ereditarietà/selezione, renderer, moduli G1/G1-b, moduli G2 di anatomia/fenotipo, formati di salvataggio.

## Deliverable completati

| File | Contenuto |
|---|---|
| `E1_SCIENTIFIC_AUDIT.md` | Audit del motore, mappa dei sistemi, anomalie e limiti (distinzione implementato / possibile / non supportato) |
| `E1_EXPERIMENTS.md` | 12 scenari riproducibili con condizioni iniziali, variabili, durata, esito atteso, anomalie, criteri di successo |
| `E1_METRICS.md` | Definizioni operative delle metriche, calcolabili solo da dati realmente disponibili |
| `E1_VALIDATION_REPORT.md` | Risultati **realmente eseguiti** degli esperimenti, con comandi, seed, numeri e limiti |
| `scripts/e1_ecosystem.experiment.ts` | Harness indipendente (usato con `vitest.experiment.config.ts`), nessuna modifica al motore |
| `tools/e1/README.md` | Istruzioni d’uso degli strumenti indipendenti |
| `tests/e1/e1_metrics.test.ts` | Test isolati dell’harness e delle metriche (6/6 passati) |

## Stato verificato

- `npx tsc --noEmit --incremental false`: exit 0.
- `npx vitest run tests/e1/e1_metrics.test.ts`: 6/6 passati.
- Esperimento completo: seed `11,12`, 900 tick (2700 per S12), 24 corse, 126.93 s; dettagli in `E1_VALIDATION_REPORT.md`.

## Regole di coordinamento

- Claude: anatomia/fenotipo creature — **non toccato**.
- Vibe: renderer grafico — **non toccato**.
- Ogni risultato riportato deve indicare comando, seed, durata e esito osservato; nessun valore inventato.
