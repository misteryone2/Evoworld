# E1 — Ecosystem Intelligence & Scientific Simulation QA

Branch di lavoro: `research/e1-ecosystem-qa` (derivata da `main` a `c35c287`, aggiornata con rebase su `main` a `db86444`). Nessun merge in `main`. PR separata: #2.

## Scopo

Audit scientifico **del codice effettivamente eseguito** del motore biologico/ecologico di EvoWorld e costruzione di strumenti indipendenti per esperimenti riproducibili con seed. Non si modificano: motore, regole biologiche, geni/mutazioni/ereditarietà/selezione, renderer, moduli G1/G1-b, moduli G2 di anatomia/fenotipo, formati di salvataggio.

## Deliverable completati

| File | Contenuto |
|---|---|
| `E1_SCIENTIFIC_AUDIT.md` | Audit del motore, mappa dei sistemi, anomalie e limiti (distinzione implementato / possibile / non supportato) |
| `E1_EXPERIMENTS.md` | 12 scenari riproducibili con condizioni iniziali, variabili, durata, esito atteso, anomalie, criteri di successo |
| `E1_METRICS.md` | Definizioni operative E1.2: coppie genetiche uniche, tassi pre-perturbazione, habitat campionato, report cull |
| `E1_VALIDATION_REPORT.md` | Indice dei risultati realmente eseguiti, con link alle tre fasi distinte |
| `E1_VALIDATION_REPORT_E1_0.md` | Report originale E1.0 (recuperato dal commit `9cfb12a`) |
| `E1_VALIDATION_REPORT_E1_1.md` | Report E1.1 archiviato (24 corse, seed 11/12) |
| `E1_1_HARDENING_REPORT.md` | Correzioni E1.1, file modificati, test eseguiti, anomalie aperte, compatibilità con `main` `db86444` |
| `E1_2_SCIENTIFIC_REFINEMENT_REPORT.md` | Correzioni metodologiche E1.2, comandi, seed, durate, esiti e confronto con `main` |
| `scripts/e1_ecosystem.experiment.ts` | Harness fase 1 (usato con `vitest.experiment.config.ts`), output predefinito in `os.tmpdir()` |
| `scripts/e1_ecosystem.phase2.experiment.ts` | Harness fase E1.2 multi-seed con report statistico |
| `tools/e1/README.md` | Istruzioni d’uso degli strumenti indipendenti |
| `tests/e1/e1_metrics.test.ts` | Test isolati dell’harness e delle metriche E1.2 |
| `tests/e1/e1_integration.test.ts` | Test reali su file JSON, directory, `E1_OUT` e riproducibilità |

## Stato verificato (E1.2, su `db86444`)

- `npx tsc --noEmit --incremental false`: exit 0.
- `npx vitest run tests/e1/e1_metrics.test.ts tests/e1/e1_integration.test.ts`: 25/25 passati.
- `npx next build`: exit 0.
- Fase E1.2: seed `1`–`12`, 900 tick, 7 scenari, 84 corse, 651.18 s; dettagli in `E1_2_SCIENTIFIC_REFINEMENT_REPORT.md`.
- Fase E1.1 (archiviata): seed `11,12`, 900 tick (2700 per S12), 24 corse, 134.88 s; dettagli in `E1_VALIDATION_REPORT_E1_1.md`.
- Suite completa: branch 730 passati / 9 falliti / 1 skipped vs `main` 706 / 8 / 1; i +25 test sono E1, l'unico fallimento aggiuntivo è un timeout load-dependent che passa in isolamento. Dettagli nel report E1.2.

## Regole di coordinamento

- Claude: anatomia/fenotipo creature — **non toccato**.
- Vibe: renderer grafico — **non toccato**.
- Ogni risultato riportato deve indicare comando, seed, durata e esito osservato; nessun valore inventato.
- Nessun merge in `main`; PR #1 (G1-b) e PR #2 (E1) restano indipendenti.
