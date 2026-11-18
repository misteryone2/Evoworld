# E2 — Ecosystem Dynamics & Evolutionary Stability

Questa cartella contiene la documentazione scientifica, i protocolli e i dataset della fase E2.

## Stato

| Sottofase | Stato | Documento |
|---|---|---|
| E2.0 — Engine Ecology Audit | Completata | [E2_0_ENGINE_ECOLOGY_AUDIT.md](E2_0_ENGINE_ECOLOGY_AUDIT.md) |
| E2.1 — Population Stability | Pilota in esecuzione | [E2_1_PILOT_REPORT.md](E2_1_PILOT_REPORT.md) |
| E2.2 — Food Web Dynamics | Pianificata | [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md) |
| E2.3 — Competition & Coexistence | Pianificata | [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md) |
| E2.4 — Biodiversity & Complexity | Pianificata | [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md) |
| E2.5 — Resilience & Perturbation | Pilota parziale | [E2_1_PILOT_REPORT.md](E2_1_PILOT_REPORT.md) |
| E2.6 — Evolution & Speciation | Pianificata | [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md) |

## Strumenti

- `tools/e2/` — metriche additive, serie temporali, biodiversità, report e dataset.
- `tests/e2/` — test isolati degli strumenti E2.
- `scripts/e2*.experiment.ts` — entry point Vitest per piloti e dataset.
- `docs/research/e2/datasets/` — archivi gzip, manifest e README di riproduzione.

## Vincoli

E2 è osservazionale: non modifica `simulation/**`, il motore biologico, il renderer, G1/G1-b/G2, `lib/anatomy/**`, `lib/phenotype/**` né i formati di salvataggio. E1 resta immutabile e viene riutilizzato come infrastruttura scientifica.
