# E1 — Validation Report (indice delle fasi)

**Branch:** `research/e1-ecosystem-qa` · **PR:** #2 (aperta, non integrata in `main`) · **Base:** `origin/main` `db86444`.

Questo file è l'indice autorevole dei risultati **realmente eseguiti**. Le fasi sono distinte e i loro report originali restano immutati: nessun numero di una fase è stato riscritto con dati di un'altra.

| Fase | Commit / origine | Report | Contenuto |
|---|---|---|---|
| E1.0 | `9cfb12a` | [`E1_VALIDATION_REPORT_E1_0.md`](E1_VALIDATION_REPORT_E1_0.md) | Audit iniziale, 12 scenari, prime 24 corse |
| E1.1 | `a60148b` | [`E1_VALIDATION_REPORT_E1_1.md`](E1_VALIDATION_REPORT_E1_1.md) | Vegetazione su celle distinte, guard snapshot, output portabile; 24 corse seed 11/12 |
| E1.2 | commit corrente | [`E1_2_SCIENTIFIC_REFINEMENT_REPORT.md`](E1_2_SCIENTIFIC_REFINEMENT_REPORT.md) | Correzioni metodologiche, cull stratificato, habitat campionato, fase multi-seed |

I dettagli delle correzioni E1.1 sono in [`E1_1_HARDENING_REPORT.md`](E1_1_HARDENING_REPORT.md). Definizioni operative aggiornate in [`E1_METRICS.md`](E1_METRICS.md); protocolli in [`E1_EXPERIMENTS.md`](E1_EXPERIMENTS.md).

## Stato E1.2 (sintesi)

- Verifiche: `npx tsc --noEmit --incremental false` exit 0; 25/25 test E1 passati; `npx next build` exit 0.
- Fase multi-seed: `E1_PHASE2_SEEDS=1,...,12`, 900 tick, 84 corse, **651.18 s**, exit 0. Output: `e1-phase2-results.json` (temp, non committato).
- Popolazione finale media: S01 22.58, S06 35.42, S08 5.75, S09 14.92, S10 21.17, S13 16.92, S14 19.00. Estinzione 0/84; speciazione 0/84 a 900 tick.
- Habitat: effetto posizione +4.08/+4.25, effetto risorsa +2.00/+2.17 (confronti 2×2), su griglia campionata senza pretesa di estremi globali.
- Perturbazione: S08 vs S01, Δ popolazione finale −16.83; al tick 450 rimossi in media 19.83 di 25.25, conservati 5.42; tassi con denominatore pre-cull verificati in 12/12 campioni.
- Suite completa: branch 730 passati / 9 falliti / 1 skipped (80.23 s) vs `main` 706 / 8 / 1 (77.73 s); +25 test sono i nuovi test E1, e l'unico fallimento aggiuntivo (`planet.test.ts`, timeout) passa 24/24 in isolamento su entrambi.
- Dettagli completi, comandi e limiti: [`E1_2_SCIENTIFIC_REFINEMENT_REPORT.md`](E1_2_SCIENTIFIC_REFINEMENT_REPORT.md).

## Regole di riportabilità

Ogni valore riportato nei report di fase indica comando, seed, durata e esito osservato. I tempi di esecuzione sono esclusi dal confronto scientifico tramite `stripVariableData()`. Nessun risultato delle fasi E1.0/E1.1 è stato modificato: E1.2 aggiunge correzioni e una nuova fase, senza toccare le regole biologiche né integrare in `main`.
