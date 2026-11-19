# Addendum documentale — Integrazione finale E2 + G3 + IV1 R1

**Data:** 2026-11-19
**Branch di applicazione:** `integration/e2-g3-iv1-final`
**Scopo:** correggere disallineamenti documentali E2/R1 senza riscrivere risultati, hash o conclusioni storiche.
**Tracciabilità:** ogni modifica è limitata a righe di stato, riferimenti di commit e note di successione; i report originali restano invariati nel contenuto scientifico.

---

## 1. Stato E2.2 e E2.3 (prima: "in preparazione" / "pianificata")

La riga di stato storica di `docs/research/e2/E2_EXPERIMENTAL_MATRIX.md` recitava:

> E2.1 completata con review scientifica (48 corse pilota + 96 corse di isolamento); E2.2 eseguita (120 corse: 36 primarie + 36 replica seed + 36 durata + 12 campionamento), report e dataset in preparazione. Entrambe in attesa di review indipendente. E2.3–E2.6 restano pianificate.

Stato aggiornato alla data di questo addendum:

- **E2.2** — eseguita; report, audit, matrice, dataset `e2.2-foodweb-iaaft-review.json.gz` e manifest sono disponibili. Resta in attesa di review indipendente; i verdetti scientifici (`NON_DIMOSTRATO`, `EVIDENZA_SEQUENZIALITA_POSITIVA`, ecc.) non sono stati modificati.
- **E2.3** — eseguita e successivamente corretta come **E2.3.1**. Non è più una fase pianificata.
- **E2.4, E2.5, E2.6** — restano pianificate, come nella documentazione storica.

`docs/research/e2/README.md` è stato aggiornato di conseguenza (riga E2.2 e nota di successione).

---

## 2. Successione E2.3 → E2.3.1

- **E2.3** è il pilota storico: commit di implementazione `6fedffd07faa29945ff5e1dfc257e460868994e5`, commit del dataset `f2957b965eb8a741e9747839a95c8592eec55923`.
- **E2.3.1** è la revisione indipendente: commit di implementazione `cbb4f3bee5b9326f10e7879c87e130a513211b69`, commit dell'artifact finale `0949a942f70f07f9b33210e301eb6f8597728197`.
- Lo schema evento corrente è `evoworld.e2.3.event.v2`; la v1 resta importabile ma non viene più emessa. Il manifest resta `evoworld.e2.3.run-manifest.v1` con i campi aggiuntivi di completezza.
- La sezione **N** di `E2_3_OBSERVABILITY_REPORT.md` prevale sulle sezioni E2.3 precedenti in caso di conflitto. Le sezioni precedenti restano il record storico.
- Nessuna delle due fasi produce conclusioni ecologiche: E2.3.1 è una **validazione tecnica** dell'infrastruttura di osservabilità (19/19 check sul pilota finale).

---

## 3. Correzione dei riferimenti alla correzione IAAFT

Il documento `E2_2_FOOD_WEB_AUDIT.md` (§10) attribuiva la correzione P1 della IAAFT al commit `23778c4e8a29f0bf2e2d968a9322b50b5907f2c8`. Verifica effettuata su `git show`:

| Riferimento | Contenuto effettivo | Ruolo |
|---|---|---|
| `cbcb9fd7b121b1449cfdd773bffd831c5c09ce89` | `fix(e2.2): use exact-length IAAFT transform` — `tools/e2/fourier.ts`, `tools/e2/surrogateInference.ts`, script e test IAAFT | **codice della correzione** |
| `d1c3de5fc9586f97fdc99c9e1cf0b4aa0c45f371` | `perf(e2.2): direct exact DFT kernels for moderate lengths` — `tools/e2/fourier.ts`, `tools/e2/surrogateInference.ts` | **codice di ottimizzazione** della trasformata esatta |
| `70e4f5bd15f36d8456b8b0934d20a54d1121a4e5` | `E2.2.1: add inferential hardening tools, QA gates and validation experiments` | **codice** E2.2.1 (hardening inferenziale) |
| `7caf056db09beed4d2b3f9aa8ecc87f0850cab99` | `docs(e2.2): document P1 fix and regenerated dataset` | **documentazione + dataset** rigenerato |
| `85cc0902d33a462808e9a8e8994540f56ceddb54` | `E2.2 review: regenerated reports, validation and corrected dataset` | **documentazione + dataset** della review precedente |
| `23778c4e8a29f0bf2e2d968a9322b50b5907f2c8` | `test(e2.2): extend sensitivity timeout for derived reports` — un solo file, `scripts/e2_foodweb_sensitivity.experiment.ts` | **non è la correzione IAAFT**: riferimento storico errato |

La correzione al testo del §10 distingue esplicitamente i commit di codice da quelli di documentazione e segnala l'errore del riferimento storico. I p-value, i dataset e i verdetti del report E2.2 non sono stati alterati.

---

## 4. Natura delle validazioni IV1-A-R1 e IV1-B-R1

- **IV1-A-R1** (60 run, 45 confronti, 0 divergenze) dimostra che adaptive rendering G3.1 e observability E2.3.1 non alterano lo stato biologico canonico, con finestra post-render chiusa. È una **validazione tecnica di invarianza**, non una prova di correttezza ecologica del modello.
- **IV1-B-R1** (120 run, dataset v2) misura il costo dell'integrazione con finestre separate e contatori coerenti. È una **validazione tecnica di performance**, non una misura di GPU/FPS reali né di I/O su disco: il writer è sintetico e i byte del buffer sono una stima.
- Nessuno dei due risultati deve essere letto come conferma che le conclusioni ecologiche di E2 siano corrette. E2 resta osservazionale e in attesa di review indipendente dove previsto.

---

## 5. Conservazione degli 8 file esclusivi del branch G1 / PR #1

Il tag `archive/g1-pr1-remote` punta a `8c48c7dac5c34ee2a14c9ee931803517222b0ea2` (head di PR #1). Tutti gli 8 file sono stati verificati presenti nel tag:

`G2_review.patch`, `LEGGIMI.txt.originale-main`, `LEGGI_PRIMA_G2.txt`, `PR_G2.md`, `docs/graphics/G2_GEOMETRY_CONVENTIONS.md`, `docs/graphics/G2_REVIEW_REPORT.md`, `lib/anatomy/geometry.ts`, `tests/anatomyG2Review.test.ts`.

Nessuno di essi è presente in `HEAD`: si tratta di documentazione storica, patch superate e di un'implementazione G2 dell'ancoraggio delle appendici (`surfaceY`, `surfaceHalfWidth`, `surfaceEndZ`, `BODY_ROLES`) sostituita dalla successiva implementazione anatomica consolidata G2.1/G3 (`lib/anatomy/assemble.ts`, `bodyPlan.ts`, `lod.ts`, `validate.ts`, ecc.). Non sono stati reintrodotti: il loro contenuto resta recuperabile dal tag verificato.

---

## 6. Classificazioni scientifiche invariate

Nessuna classificazione è stata riscritta: `OBSERVED`, `DERIVED`, `INFERRED` e `NON_EVALUABLE` mantengono il significato e l'uso dei report originali. I risultati `NON_VALUTABILE` restano tali. `INFERRED` resta esplicitamente non autorizzato dove i protocolli E2 lo vietano. Nessun resultado negativo è stato trasformato in positivo.

---

## 7. File toccati da questo addendum

- `docs/research/e2/E2_EXPERIMENTAL_MATRIX.md` — riga di stato + rinvio all'addendum.
- `docs/research/e2/README.md` — stato E2.2 + nota di successione E2.3 → E2.3.1.
- `docs/research/e2/E2_2_FOOD_WEB_AUDIT.md` — correzione riferimento commit IAAFT.
- `docs/research/iv1b/EXPERIMENTAL_CONFIG.md` — commento obsoleto sul writer sintetico.
- `docs/release/IV1_FINAL_DOCUMENTATION_ADDENDUM.md` — questo file.
