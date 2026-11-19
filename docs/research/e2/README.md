# E2 — Ecosystem Dynamics & Evolutionary Stability

Questa cartella contiene la documentazione scientifica, i protocolli e i dataset della fase E2.

## Stato

| Sottofase | Stato | Documento |
|---|---|---|
| E2.0 — Engine Ecology Audit | Completata | [E2_0_ENGINE_ECOLOGY_AUDIT.md](E2_0_ENGINE_ECOLOGY_AUDIT.md) |
| E2.1 — Population Stability | Completata (review; in attesa di review indipendente) | [E2_1_PILOT_REPORT.md](E2_1_PILOT_REPORT.md) |
| E2.2 — Food Web Dynamics | Eseguita (report e dataset in preparazione; in attesa di review indipendente) | [E2_2_FOOD_WEB_REPORT.md](E2_2_FOOD_WEB_REPORT.md) |
| E2.3 — Ecological Observability | Completata (validazione tecnica; in attesa di review indipendente) | [E2_3_OBSERVABILITY_REPORT.md](E2_3_OBSERVABILITY_REPORT.md) · [schema](E2_3_EVENT_SCHEMA.md) |
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

## Dataset E2.3 (osservabilità)

- [e2.3-observability-pilot.json.gz](datasets/e2.3-observability-pilot.json.gz) · [manifest](datasets/e2.3-observability-pilot.manifest.json) · [report](datasets/e2.3-observability-pilot.report.json)
- 2 corse osservate + 2 repliche, 2 seed, 40 tick; 83.243 eventi reali; 12/12 check tecnici superati; hash e provenance nel manifest.
- [Report](E2_3_OBSERVABILITY_REPORT.md) · [schema eventi](E2_3_EVENT_SCHEMA.md). Nessuna conclusione ecologica prodotta.

## Strumenti

- `tools/e2/` — metriche additive, serie temporali con detrending, isolamento variabili, resilienza appaiata, biodiversità, report e dataset; `observabilityRunner.ts` e `observabilityPipeline.ts` per E2.3.
- `tests/e2/` — test isolati degli strumenti E2, inclusi schema, hook passivi, riproducibilità e overhead E2.3.
- `scripts/e2*.experiment.ts` — entry point Vitest per piloti e dataset, incluso `e2_observability_pilot.experiment.ts`.
- `docs/research/e2/datasets/` — archivi gzip, manifest e README di riproduzione.

## Vincoli

E2 è osservazionale. Fino a E2.2 non modifica `simulation/**`; E2.3 aggiunge solo hook di osservabilità passivi e additivi in `simulation/**` (parametri trailing opzionali con default no-op): nessuna formula, probabilità, RNG, risultato biologico o formato di salvataggio viene cambiato. Il renderer, G1/G1-b/G2, `lib/anatomy/**`, `lib/phenotype/**` e `tools/e1/**` restano intatti. E1 viene riutilizzato come infrastruttura scientifica.
