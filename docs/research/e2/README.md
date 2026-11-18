# E2 — Ecosystem Dynamics & Evolutionary Stability

Questa cartella contiene la documentazione scientifica, i protocolli e i dataset della fase E2.

## Stato

| Sottofase | Stato | Documento |
|---|---|---|
| E2.0 — Engine Ecology Audit | Completata | [E2_0_ENGINE_ECOLOGY_AUDIT.md](E2_0_ENGINE_ECOLOGY_AUDIT.md) |
| E2.1 — Population Stability | Completata (review; in attesa di review indipendente) | [E2_1_PILOT_REPORT.md](E2_1_PILOT_REPORT.md) |
| E2.2 — Food Web Dynamics | Eseguita (report e dataset in preparazione; in attesa di review indipendente) | [E2_2_FOOD_WEB_REPORT.md](E2_2_FOOD_WEB_REPORT.md) |
| E2.3 — Competition & Coexistence | Pianificata | [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md) |
| E2.4 — Biodiversity & Complexity | Pianificata | [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md) |
| E2.5 — Resilience & Perturbation | Classificazione appaiata completata in E2.1; estensione pianificata | [E2_1_PILOT_REPORT.md](E2_1_PILOT_REPORT.md) |
| E2.6 — Evolution & Speciation | Pianificata | [E2_EXPERIMENTAL_MATRIX.md](E2_EXPERIMENTAL_MATRIX.md) |

## Dataset E2.1 review

- [e2.1-review.json.gz](datasets/e2.1-review.json.gz) · [manifest](datasets/e2.1-review.manifest.json)
- 144 corse, 12 seed, 900 tick; `codeCommit=44c69e8`, `workingTreeDirty=false`.
- Il [report revisionato](E2_1_PILOT_REPORT.md) documenta hash, checksum, riproducibilità e coerenza report↔dataset.

## Dataset E2.2

- [e2.2-foodweb.json.gz](datasets/e2.2-foodweb.json.gz) · [manifest](datasets/e2.2-foodweb.manifest.json)
- 120 corse (36 primarie + 36 replica seed + 36 durata + 12 campionamento); `codeCommit` e hash nel manifest.
- Audit: [E2_2_FOOD_WEB_AUDIT.md](E2_2_FOOD_WEB_AUDIT.md) · matrice: [E2_2_EXPERIMENTAL_MATRIX.md](E2_2_EXPERIMENTAL_MATRIX.md) · report: [E2_2_FOOD_WEB_REPORT.md](E2_2_FOOD_WEB_REPORT.md).

## Strumenti

- `tools/e2/` — metriche additive, serie temporali con detrending, isolamento variabili, resilienza appaiata, biodiversità, report e dataset.
- `tests/e2/` — test isolati degli strumenti E2.
- `scripts/e2*.experiment.ts` — entry point Vitest per piloti e dataset.
- `docs/research/e2/datasets/` — archivi gzip, manifest e README di riproduzione.

## Vincoli

E2 è osservazionale: non modifica `simulation/**`, il motore biologico, il renderer, G1/G1-b/G2, `lib/anatomy/**`, `lib/phenotype/**` né i formati di salvataggio. E1 resta immutabile e viene riutilizzato come infrastruttura scientifica.
