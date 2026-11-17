# E1.1 — Report di hardening e verifica finale

**Data:** 2026-11-17  
**Branch:** `research/e1-ecosystem-qa` (E1 originale `7e33cb5`, rebase su `origin/main` `db86444` → `9cfb12a`, poi commit di hardening E1.1)  
**PR:** #2 `https://github.com/misteryone2/Evoworld/pull/2` — mantenuta separata, **nessun merge in main**  
**Ambito:** solo harness E1 (`tools/e1/**`, `tests/e1/**`, `scripts/e1_ecosystem.experiment.ts`, documentazione). Nessuna modifica a `simulation/**`, genetica, mutazioni, ereditarietà, selezione, renderer, G1/G1-b, G2/anatomia/fenotipo o formati di salvataggio.

---

## 1. Anomalie risolte

| # | Anomalia E1.0 | Correzione E1.1 | Evidenza |
|---|---|---|---|
| 1 | `sampleState()` mediava `cell.vegetation` una volta **per organismo**: più individui nella stessa cella pesavano più volte la media e la frazione di terra. | La cella viene deduplicata per coordinata geografica, con lo stesso wrap toroidale di `Planet.peekCell()`. | Test `deduplica la vegetazione per cella geografica distinta`. |
| 2 | `occupiedCellsSampled` era in realtà il conteggio degli organismi campionati: non si distinguevano organismi e celle. | Nuovi campi `organismsSampled` (uno per organismo) e `occupiedCellsSampled` (celle distinte, sempre ≤ organismi). Documentazione e JSON aggiornati. | Test `campi derivati coerenti`, tabella aggiornata in `E1_VALIDATION_REPORT.md`. |
| 3 | Campionamento vuoto: il vecchio codice produceva 0 per mancanza di celle ma senza distinzione esplicita. | Con 0 organismi o 0 celle materializzate: `organismsSampled = occupiedCellsSampled = 0`, medie a 0, nessun valore inventato. | Test `gestisce un campione vuoto senza inventare vegetazione`. |
| 4 | `scripts/e1_ecosystem.experiment.ts` conteneva un percorso Windows hardcoded (`C:/Users/matti/...`). | Default portabile `join(tmpdir(), "e1-results.json")`; `E1_OUT` continua a sovrascrivere. | Test `lo script usa una destinazione temporanea portabile`; nuova corsa con `E1_OUT` esplicito. |
| 5 | S08 ricostruisce il `World` da snapshot: `World.fromSnapshot()` azzera `lastStats`, quindi i contatori per tick del campione potevano essere persi. | `accumulate()` restituisce `E1TickEvents`; il runner li passa a `sampleState()` prima del cull. I contatori cumulativi risiedono nel runner, fuori dal `World`. | Test `i contatori cumulativi sopravvivono alla perturbazione`; paragone corsa con/senza cull al tick 4. |
| 6 | Non era verificato che le opzioni sperimentali S08 sopravvivessero a `World.fromSnapshot()`. | `assertSnapshotOptionsPreserved()` controlla `advancedGenome`/`geneEffects` in `applySetup()` e `applyPerturbation()` e fallisce se cambiano. Nessuna modifica al motore. | Test `S08 conserva le opzioni snapshot prima e dopo la ricostruzione`, incluso caso con opzioni false. |

---

## 2. File modificati

### Codice harness

- `tools/e1/metrics.ts` — `E1TickEvents`, wrap toroidale, deduplicazione celle, `organismsSampled`, `occupiedCellsSampled`, eventi per tick passati a `sampleState()`, `accumulate()` con valore di ritorno.
- `tools/e1/runner.ts` — cattura gli eventi prima della perturbazione, commento esplicito sui contatori cumulativi fuori dal `World`.
- `tools/e1/initialConditions.ts` — guard sulle opzioni snapshot preservate in setup e perturbazione.
- `scripts/e1_ecosystem.experiment.ts` — `node:os`/`node:path`, default `join(tmpdir(), "e1-results.json")`, `E1_OUT` invariato.

### Test

- `tests/e1/e1_metrics.test.ts` — riscritto con **11 test**, inclusi casi richiesti: celle duplicate, campione vuoto, perturbazioni, continuità contatori, effetti del cull, portabilità output.

### Documentazione

- `docs/research/e1/E1_METRICS.md` — nuove definizioni, tabella campo → definizione, evento per tick.
- `docs/research/e1/E1_EXPERIMENTS.md` — variabili aggiornate, nota S08, comando con output portabile.
- `docs/research/e1/E1_VALIDATION_REPORT.md` — **riscritto** con la nuova esecuzione reale.
- `docs/research/e1/E1_SCIENTIFIC_AUDIT.md` — nota sulla guard E1.1 e numeri aggiornati (predazione, vegetazione occupata).
- `docs/research/e1/README.md` — base `db86444`, 11/11 test, nuova durata, riga per questo report.
- `tools/e1/README.md` — metriche, snapshot/counters, output portabile.

**Non toccati:** `simulation/**`, genetica, mutazioni, ereditarietà, selezione, renderer, G1/G1-b, G2, salvataggi, PR #1 (G1-b).

---

## 3. Test eseguiti e risultati

Toolchain: Node `v22.14.0`, TypeScript `5.9.3`, Vitest `4.1.12`, Next.js `16.3.0`.

| Comando | Risultato |
|---|---|
| `npx tsc --noEmit --incremental false` | **exit 0** |
| `npx vitest run tests/e1/e1_metrics.test.ts` | **11/11 passati**, 2.85 s |
| `npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts` con `E1_TICKS=900`, `E1_LONG_TICKS=2700`, `E1_SEEDS=11,12`, `E1_SAMPLE_EVERY=50`, `E1_OUT=...\e1-results-e1.1.json` | **1/1 passato**, **134.88 s**, 24 corse, JSON 501.371 byte |
| `npx next build` | **exit 0**, compilazione + TypeScript OK, 3 pagine statiche |
| `npx vitest run` sul branch E1.1 (2 esecuzioni) | 715 passati / 10 falliti / 1 skipped (63 file) |
| `npx vitest run` su worktree pulito `origin/main` `db86444` (2 esecuzioni) | 705–706 passati / 8–9 falliti / 1 skipped (62 file) |
| `npx vitest run tests/settlementDefaults.test.ts` su branch e su `main` | **4/4 passati** in entrambi |

### Distinzione errori preesistenti / introdotti

- Fallimenti **preesistenti** (identici su branch e `main`): `tests/fauna180.test.ts`, `tests/hydrology.test.ts`, `tests/planet.test.ts` (1 o 2 test a seconda della corsa), `tests/reproduction.test.ts` (2 test), `tests/vibeGenomeV1110.test.ts` (3 test).
- L’unico fallimento extra del branch nella suite completa (`settlementDefaults`, timeout 5000 ms) è **carico-dipendente**: passa 4/4 se eseguito da solo su entrambi i rami. Non è un difetto deterministico introdotto da E1: il branch ha un file di test in più e la suite parallela supera il timeout.
- Nessun errore TypeScript o di build introdotto da E1.1.

### Risultati scientifici aggiornati (nuova esecuzione)

- 24 corse, seed 11/12, 900 tick (2700 per S12, 300 con estinzione al tick 2 per S07).
- S01: 150→19 / 150→17. S02: 220→8 / 220→12 (113 uccisioni entrambi). S03: 40→10 / 40→20.
- S04: 150→27 / 150→45, 0 uccisioni. S05: 150→18 / 150→31, 0 uccisioni. S06: H 0.6864 / 0.6849, 48 / 51 uccisioni cumulative.
- S07: estinzione al tick 2, 99 / 96 morti. S08: 26→5→4 e 24→5→3 (t=400/450/900), 5 / 0 nascite cumulative.
- S09/S10: vegetazione iniziale 0.0735 / 0.0600 contro 0.4330 / 0.4222; esiti finali non coerenti tra seed.
- S12: seed 11 specia a t=2400 (H 0.6581), seed 12 resta a 1 specie con ripresa 27→95.

Tutti i numeri e la tabella completa sono in `E1_VALIDATION_REPORT.md`. Il JSON grezzo non è committato.

---

## 4. Anomalie ancora aperte

1. **Motore non modificato:** i flag interni non serializzati (`enableDispersalCost`, `enableCollisions`, `regionEstablishment`) restano azzerati da `World.fromSnapshot()`; E1.1 li rileva solo per le due opzioni usate dall’harness. La proposta 8 del report finale resta aperta.
2. **Indicatore di vegetazione parziale:** anche dopo la deduplicazione, la misura resta condizionata alle celle occupate e materializzate; non è uno stock globale. La proposta 9 resta aperta.
3. **Causalità di morte:** `deaths` aggrega fame e vecchiaia; `predationKills` è separato ma per tick. Nessuna separazione aggiuntiva senza toccare il motore.
4. **Dinamiche non dimostrate:** crescita sostenibile, oscillazioni preda-predatore, recupero post-cull, effetto habitat riproducibile, attribuzione selezione vs deriva. Sono risultati negativi **verificati**, non difetti noti dell’harness.
5. **Suite completa non verde a priori:** 8–10 fallimenti preesistenti/flaky su `main` e sul branch, come documentato sopra. Non rientrano nell’ambito E1 e non sono stati corretti.
6. **Avviso Vite** su `configLoader: 'native'` / ESM in CommonJS nei file `vitest*.config.ts`: pre-esistente, non bloccante.

---

## 5. Compatibilità con l’ultima versione di main

- `origin/main` è stata aggiornata da `c35c287` a **`db86444`** prima delle correzioni.
- La diff `c35c287..db86444` tocca solo `LEGGIMI.txt`, `lib/anatomy/**`, `lib/phenotype/**`, `tests/anatomyG2.test.ts`, `tests/phenotypeG2.test.ts`, `docs/graphics/G2*.md`: **nessuna sovrapposizione** con i percorsi E1.
- Il branch è stato aggiornato tramite **rebase** su `db86444` (non merge): dopo il rebase HEAD era `9cfb12a`, poi il commit di hardening E1.1 ha aggiunto le correzioni. Il commit E1 originale è stato riposto sopra la `main` corrente e il lavoro G2/anatomia/fenotipo degli altri agenti è preservato.
- TypeScript, test E1, build Next.js e nuovo esperimento sono stati eseguiti **su questo branch aggiornato**, quindi su codice compatibile con `db86444`.
- La PR #2 resta aperta e separata; il remoto è stato aggiornato con `push --force-with-lease` del solo branch `research/e1-ecosystem-qa`. Nessun merge in `main`, nessuna modifica alla PR #1 (G1-b).

---

## 6. Conclusione

E1.1 chiude le sei anomalie dell’harness individuate nella revisione correttiva, senza alterare il motore né i risultati senza una nuova esecuzione. La nuova corsa di 24 run è reale, riproducibile e documentata; i fallimenti della suite completa sono stati confrontati con `main` e classificati come preesistenti o flaky da carico. Il branch è allineato all’ultima `main` e la PR resta separata.
