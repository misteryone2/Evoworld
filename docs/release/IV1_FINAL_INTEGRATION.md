# IV1 — Report di integrazione finale E2 + G3 + IV1 R1

**Data:** 2026-11-19
**Branch di integrazione:** `integration/e2-g3-iv1-final`
**Stato:** integrazione **completata**. PR #3 approvata e mergata su `main` il 2026-11-19: merge commit `dbb114ecf849b90c74cf776f171e27a45e427ead`. Tag `iv1-r1-approved` pubblicato, PR #1 chiusa come *superseded*. Verifica finale post-merge eseguita con esito positivo.

---

## 1. INTEGRATION

### Commit iniziale e sorgenti

| Elemento | Commit |
|---|---|
| `main` all'inizio dell'audit (invariato) | `d330c12f345ab26ab7405b908c729e2e2f6bcc22` |
| `origin/main` ricontrollato con `git fetch` | `d330c12f345ab26ab7405b908c729e2e2f6bcc22` |
| E2 completo (archive) | `52178e56787d91ab6324a36a0f39a9a2d531b15f` |
| G3/G3.1 completo (archive) | `717da65c81329188dc3ce25f5e83dcdf405cd1be` |
| IV1-A originale | `67d8d5ccf49ca0e75c527333603bd2e2942876c3` |
| **IV1-A-R1 integrato** | `d36f723d5b928c974d735c165cf6969171a0ebd1` |
| IV1-B originale | `ad0a8074de586adf866de51fa62b08e2d7053e39` |
| **IV1-B-R1 integrato** | `45f2caacb3c4c248b58b5b297c55f4a48e28df6c` |

### Branch sorgenti integrati

- `validation/iv1-a-r1-post-render-fingerprint` — contiene già l'intera catena E2.0 → E2.3.1, G2/G2.1, G1 consolidato, G-final, G3/G3.1, IV1-A e IV1-A-R1. **Non sono stati integrati separatamente** E2, G2, G-consolidation, G-final o G3, né usati cherry-pick.
- `validation/iv1-b-r1-benchmark-corrections` — benchmark corretto, dataset v2, analisi v2, test e documentazione.

### Cronologia dei merge sul branch di integrazione

| Commit | Descrizione |
|---|---|
| `713922a7553390642a41a9de4f3041c6fa391bd0` | `merge --no-ff` di IV1-A-R1 (52 commit avanti rispetto a `main`) |
| `dc9873ffe9c289247e9c0c41eb773be61e2dc896` | `merge --no-ff` di IV1-B-R1 (57 commit avanti) |
| `bb3ace8` | allineamento documentale E2/R1 (addendum datato) |
| `4597dee` / `aac7516` | report finale di integrazione e dettagli PR |
| **`dbb114ecf849b90c74cf776f171e27a45e427ead`** | **merge di PR #3 su `main`** (approvazione esplicita dell'utente) |

**Conflitti:** nessuno. **Modifiche al codice di produzione:** nessuna.

Verifica richiesta:

```
git diff --exit-code validation/iv1-a-r1-post-render-fingerprint HEAD -- simulation components lib types
→ exit 0
```

Lo stesso controllo tra A-R1 e B-R1 dà `exit 0`: i due rami condividono alberi di produzione identici. Il merge B-R1 ha aggiunto solo benchmark, dataset, analisi, test e documentazione.

### PR

- **PR #3** — `integration/e2-g3-iv1-final → main`: `https://github.com/misteryone2/Evoworld/pull/3`. Head finale `aac75163572da86d93d94d85a14fe8f6c26abc28`, base `d330c12f345ab26ab7405b908c729e2e2f6bcc22`, 187 file modificati, +81410/−1353. Era `mergeable=true`, `mergeable_state=clean`. **Mergata** con merge commit `dbb114ecf849b90c74cf776f171e27a45e427ead` dopo approvazione esplicita.
- PR #1 (G1): **chiusa come *superseded* senza merge** dopo il merge di PR #3; il suo contenuto resta nel tag `archive/g1-pr1-remote`.
- PR #2 (E1): già chiusa/merged.
- `main` non è stato modificato direttamente prima dell'approvazione; nessun force push, nessun aggiramento di branch protection (la branch non era protetta, ma il merge è stato sospeso fino all'approvazione).
- Verifica post-merge: `main` e `aac7516` hanno lo **stesso albero** (`1bbc11708222f7784b91b90d7aad57385fe9b959`), `git diff --exit-code aac7516 main` → exit 0.

---

## 2. VALIDATION

Ambiente: Node `v22.14.0`, Vitest `4.1.12`, Windows 11, CPU Intel i7-1365U.

| Verifica | Comando | Risultato |
|---|---|---|
| TypeScript | `npx tsc --noEmit --pretty false` | **exit 0** |
| IV1-A-R1 (test) | `vitest run tests/iv1/invariance.test.ts` | **10/10**, exit 0 |
| IV1-B-R1 | `vitest run tests/iv1bMetrics.test.ts tests/iv1bDataset.test.ts` | **33/33**, exit 0 |
| E2 | `vitest run tests/e2` | **19 file, 115/115**, exit 0 |
| G3/G3.1 | suite adaptive rendering, anatomy, cache sync, renderer integration, morphology frame, stats panel, graphics consolidation | **11 file, 185/185**, exit 0 |
| Benchmark G3.1 | `vitest run --config vitest.bench.config.ts scripts/g31PhaseProfile.benchmark.ts` | **1/1**, 90 campioni (6 popolazioni × 15 fasi) |
| Build | `npx next build --webpack` | **OK**, 3 pagine statiche |
| Suite completa | `npx vitest run` | 1098 passati, 1 skipped, **6 failed** — identici al baseline |

### IV1-A-R1 — riproduzione esatta

`vitest run --config vitest.experiment.config.ts scripts/iv1_invariance.experiment.ts` con `IV1_A_CODE_COMMIT=e936756c…` e `IV1_A_BRANCH=validation/iv1-a-r1-post-render-fingerprint`:

- **60 run, 45 confronti tick-per-tick, 0 divergenze**.
- Tutti i check tecnici `true`, inclusi `postRenderWindowClosed`, `intermediateMutationDetected`, `noFalsePositive`, `observabilityComplete`.
- `payloadSha256` = `82e1bb79a6c99d84e16139580bf83bd80e2f7567176df7bf7d65571b59ff2edb` ✔
- `sourceSha256` = `45aefc5889c109c02932a86d872a7c4772ab738a33060193626ef130c1b07a10` ✔

Nota di riproducibilità: su Windows con `core.autocrlf` attivo i tre file dell'harness IV1-A vengono scritti con CRLF, mentre gli otto file di produzione restano con le line ending originali; l'hash storico si ottiene solo ripristinando lo stato misto di line ending della sessione originale. Il contenuto sorgente è byte-identico ai commit archiviati. Nessun test o soglia è stato modificato.

### IV1-B-R1

- Dataset `evoworld.iv1b.dataset.raw.v2`: **120 run** (6 popolazioni × 4 configurazioni × 5 seed), 24 aggregati; v1 conservato in `dataset.raw.v1.json`.
- `analysis.json` schema v2: 6 comparazioni + 6 voci `costPerEvent`.
- Warm-up di 5 tick escluso: `warmup.*`, finestra misurata e `totals.*` separati; contatori evento come delta della finestra.
- Riconciliazione: il vecchio `71 106 eventi/tick` / `6,4 µs/evento` non è riproducibile. Con i dati v1: `36 300 058 / (5×20) = 363 000,58 eventi/tick` → **1,264 µs/evento**. Nella misurazione R1 a 10 000: 288 166 eventi/tick e 1 696,92 ms/tick → **5,889 µs/evento**.
- 0 eventi persi, 0 `flushErrors`, `attempted = recorded + sampled` in tutte le run.
- Writer **sintetico** (property scan in memoria): nessun I/O su disco dichiarato. Byte buffer = stima marcata. GPU/FPS/WebGL non misurati.

### E2.3.1 — integrità

| Artefatto | Hash |
|---|---|
| `payloadSha256` | `161c34cce90bb7ce83c37b3b9532a5f52585cdcaf7a4f03d8b4df4dbeafb34b6` |
| `archiveSha256` | `168a453f19feb3bcb73174ef787179431780159b83cf879099f790ac92e653e3` |
| `manifestSha256` (byte committati) | `c0df322f029ca0838d9e08ec4535ffbd00d7ed54d003df3ef66da6eea1cb836b` |
| `sourceSha256` | `c3a31d6b149818f82797a5c99dfdebce22b7169839359283917862df4de32b87` |
| `e1SourceSha256` | `24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe` |

Ricalcolati su payload decompresso, archivio gzip e blob committato: tutti corrispondono. `integrityErrors = []`.

### G3 / G3.1

- 185 test passati su 11 file (adaptive rendering, anatomia G2/G2.1, cache sync, renderer integration, morphology frame, stats panel, consolidation).
- Benchmark di fase: a 10 000 organismi `updateCreatureInstances/total` = 29,48 ms mediana / 51,43 ms P95; `syncFrame/regenerate` = 507,55 ms mediana; `syncFrame/warm` = 0,11 ms. `gpu: null`: FPS, upload e fill-rate non misurabili in Node.
- Nel carico IV1-B con `syncFrame()` per tick lo speedup della fase render è 0,97–1,34×, inferiore ai 2,6–3,0× su frame statici: cambia il carico di lavoro, non la logica.

### Suite completa e failure pre-esistenti

| Contesto | Passati | Skipped | Failed |
|---|---:|---:|---:|
| Integrazione (`bb3ace8`) | 1098 | 1 | **6** |
| Baseline `e936756` (worktree dedicato) | 1055 | 1 | **6** |

I 6 failure sono **identici per file e nome di test** nei due contesti:

- `tests/fauna180.test.ts` — sfumatura ventre-dorso
- `tests/hydrology.test.ts` — produces both rivers and lakes
- `tests/reproduction.test.ts` — ereditarietà genomi e costo energetico (2 test)
- `tests/vibeGenomeV1110.test.ts` — registry geni comportamentali e PER-03 (2 test)

Nessun nuovo failure deterministico. Nessun test modificato o soglia allentata. Il numero storico di 10 failure (report E2.3) e 15 (E2.3.1, con timeout load-sensitive) è legato a sessioni diverse: nella sessione di integrazione sia baseline che branch mostravano 6 failure nella stessa area.

### Verifica post-merge su `main` (dopo `dbb114e`)

| Verifica | Risultato |
|---|---|
| `main` locale/remoto | `dbb114ecf849b90c74cf776f171e27a45e427ead` |
| Albero `main` vs `aac7516` | identico: `1bbc11708222f7784b91b90d7aad57385fe9b959`, `diff exit 0` |
| `tsc --noEmit` | exit 0 |
| IV1-A / IV1-B | 10/10 · 33/33 |
| E2 + G3/G3.1 (eseguiti insieme) | **30 file, 300/300**, exit 0 |
| `next build --webpack` | OK, 3 pagine statiche |
| Suite completa | 1096–1097 passati, 1 skipped, 7–8 failed in due esecuzioni |

I failure aggiuntivi rispetto ai 6 deterministici sono **timeout di 5000 ms** in `tests/planet.test.ts` (2 test), che in isolamento passano **24/24 in 4,11 s**. Nelle stesse condizioni di carico il baseline storico `e936756` ha mostrato **10 failure, di cui 5 timeout**, inclusi gli stessi due test `planet.test.ts` (oltre a `settlementDefaults` e due test `vibeGenomeV1110`). I timeout sono quindi load-sensitive e pre-esistenti, non regressioni dell'integrazione; il codice di `main` è byte-identico al branch validato.

---

## 3. ARCHIVAL

Tag annotati creati, pubblicati su `origin` e verificati (`git ls-remote --tags origin`, hash dell'oggetto tag e del commit peeled):

| Tag | Commit |
|---|---|
| `archive/e2.3.1` | `52178e56787d91ab6324a36a0f39a9a2d531b15f` |
| `archive/g3.1` | `717da65c81329188dc3ce25f5e83dcdf405cd1be` |
| `archive/iv1-a-r1` | `d36f723d5b928c974d735c165cf6969171a0ebd1` |
| `archive/iv1-b-r1` | `45f2caacb3c4c248b58b5b297c55f4a48e28df6c` |
| `archive/g1-pr1-remote` | `8c48c7dac5c34ee2a14c9ee931803517222b0ea2` |
| `archive/baseline-e1` | `db86444f5aa9b83a19d46ea8a57a6d979af21882` |
| `archive/baseline-iv1-a` | `e936756c5764b9b354bdd303d297ec97a33b1966` |
| **`iv1-r1-approved`** | **`dbb114ecf849b90c74cf776f171e27a45e427ead`** (tag object `3a439efcddf94563f9fa0901b8804fbfa78af446`) |

Il tag approvato è stato creato sul merge commit, pubblicato e verificato su `origin` (`git ls-remote --tags` mostra sia l'oggetto tag sia il commit peeled). Nessun tag esistente è stato sovrascritto.

### 8 file G1 conservati

Verificati presenti in `archive/g1-pr1-remote` e assenti in `HEAD`: `G2_review.patch`, `LEGGIMI.txt.originale-main`, `LEGGI_PRIMA_G2.txt`, `PR_G2.md`, `docs/graphics/G2_GEOMETRY_CONVENTIONS.md`, `docs/graphics/G2_REVIEW_REPORT.md`, `lib/anatomy/geometry.ts`, `tests/anatomyG2Review.test.ts`.

Sono documentazione storica, patch superate e l'implementazione G2 dell'ancoraggio delle appendici, sostituita dall'anatomia consolidata G2.1/G3. Non sono stati reintrodotti. Dettagli in `IV1_FINAL_DOCUMENTATION_ADDENDUM.md` §5.

---

## 4. Limitazioni sperimentali

- GPU, FPS reali, frame time browser, upload/fill-rate e byte GPU: **non misurati** (`gpu: null`).
- I/O su disco e fsync: **non misurati**; il writer IV1-B è sintetico.
- `bufferBytes` è una stima (`retainedMax × 582 B/evento`), non una misura.
- heap delta e `heapGrowthMeasuredKB` sono influenzati dal GC e possono essere negativi.
- Sessione IV1-B R1 più lenta e più rumorosa della sessione originale: i confronti v1 ↔ v2 non sono validi; tutte le conclusioni usano solo i dati R1.
- IV1-A-R1 e IV1-B-R1 sono **validazioni tecniche**, non prove di correttezza ecologica.
- E2 resta osservazionale; classificazioni `OBSERVED`, `DERIVED`, `INFERRED`, `NON_EVALUABLE` e i risultati `NON_VALUTABILE` non sono stati modificati.

---

## 5. Documentazione aggiornata

- `docs/release/IV1_FINAL_INTEGRATION.md` — questo report.
- `docs/release/IV1_FINAL_DOCUMENTATION_ADDENDUM.md` — addendum datato (stato E2.2/E2.3, successione E2.3 → E2.3.1, correzione commit IAAFT, natura delle validazioni R1, archivio G1).
- `docs/research/e2/E2_EXPERIMENTAL_MATRIX.md` — stato E2.2/E2.3 aggiornato.
- `docs/research/e2/README.md` — stato E2.2 e nota di successione.
- `docs/research/e2/E2_2_FOOD_WEB_AUDIT.md` — riferimento corretto ai commit IAAFT (codice `cbcb9fd`, `d1c3de5`; documentazione `7caf056`; `23778c4` era solo un timeout di test).
- `docs/research/iv1b/EXPERIMENTAL_CONFIG.md` — commento writer sintetico corretto.

I report scientifici originali, hash, dataset e conclusioni storiche restano invariati.

---

## 6. Stato delle fasi

| Fase | Stato |
|---|---|
| 1 — Backup e tag | **completata** |
| 2 — Branch di integrazione | **completata** |
| 3 — Integrazione A-R1 | **completata** |
| 4 — Integrazione B-R1 | **completata** |
| 5 — Conservazione 8 file G1 | **completata** |
| 6 — Allineamento documentale | **completata** |
| 7 — Verifica codice di produzione | **completata** (diff exit 0) |
| 8 — Test e validazione | **completata** |
| 9 — Report di integrazione | **completata** |
| 10 — PR verso `main` | **completata** (PR #3, mergeable) |
| 11 — Merge su `main` + tag `iv1-r1-approved` | **completata** (`dbb114e`, tag `3a439ef`) |
| 12 — Chiusura PR #1 e pulizia branch | **completata** (PR #1 closed, `merged=false`; branch di integrazione rimosso; worktree conservati) |
| 13 — Verifica finale | **completata** (test essenziali + build + suite completa su `main`) |

**FINAL STATUS: `INTEGRATION COMPLETE`** — PR #3 approvata e mergata su `main` (`dbb114e`), tag `iv1-r1-approved` pubblicato, PR #1 chiusa come *superseded* senza merge, verifica post-merge positiva. Nessun contenuto perso: tutto è su `main` o nei tag archivistici. Nessun test modificato, nessun force push.

### Pulizia

- Branch remoto `integration/e2-g3-iv1-final`: rimosso dopo il merge (contenuto integralmente su `main`).
- Branch locale `integration/e2-g3-iv1-final`: rimosso dopo il merge.
- Branch di validazione e worktree esistenti: **conservati**, in accordo con la regola di non rimuovere automaticamente i worktree. Il loro contenuto è comunque presente su `main` e/o nei tag `archive/*`.
