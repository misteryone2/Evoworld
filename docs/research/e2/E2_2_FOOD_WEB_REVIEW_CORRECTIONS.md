# E2.2 — Correzioni della review indipendente

**Branch:** `research/e2-ecosystem-dynamics`  
**Commit codice review:** `26983e352b39611137cc00268496cbb7be0f666f`  
**Data:** 2026-11-18  
**Stato:** correzioni statistiche rigenerate, dataset review generato e validato; **nessuna PR, nessun merge**.

Questo documento registra in forma riproducibile le correzioni richieste dalla review: segno del lag, selezione del lag, modello nullo autocorrelazione-aware, coerenza statistica, separazione dei livelli di evidenza e rigenerazione completa. Il motore biologico non è stato toccato.

---

## 1. Correzioni applicate

| Problema | Correzione | File |
|---|---|---|
| `|r|` alto veniva letto come sequenzialità anche con lag negativo | Segno di `r` e segno del lag sono campi separati; quadranti espliciti; verdetto `EVIDENZA_SEQUENZIALITA_POSITIVA/NEGATIVA` | `tools/e2/timeseries.ts`, `tools/e2/foodWebReport.ts` |
| Picco scelto dopo la ricerca sui lag senza correzione | Statistica test = `max|r|` su tutti i lag accettati; p-value `(1+hits)/(B+1)` | `tools/e2/surrogateInference.ts` |
| Tick trattati come repliche indipendenti | Unità statistica = corsa/seed; combinazione Fisher dei p-value per seed | `tools/e2/surrogateInference.ts`, `tools/e2/foodWebReport.ts` |
| Null senza autocorrelazione | IAAFT su residui detrendizzati; spettro di ampiezza approssimato, distribuzione empirica esatta | `tools/e2/fourier.ts`, `tools/e2/surrogateInference.ts` |
| Verdetto causale implicito | Quattro livelli separati: descrittivo, statistico, sequenzialità, causalità; quest’ultima sempre `NON_IDENTIFICABILE` | `tools/e2/foodWebReport.ts` |
| Solo erbivoro→carnivoro aveva un verdetto | `sequencingByPair` per ogni coppia, incluso erbivoro→kills | `tools/e2/foodWebReport.ts` |
| Fisher p arrotondato a 0 | Arrotondamento a cifre significative (`roundProbability`) | `tools/e2/surrogateInference.ts` |
| Dataset originale non doveva cambiare | Nuovo dataset `e2.2-foodweb-review`; verifica hash dell’archivio originale prima della scrittura | `scripts/e2_foodweb_dataset.experiment.ts` |

---

## 2. Ambiente

```powershell
$env:Path = 'C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;' + $env:Path
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'
$raw = 'C:\Users\matti\AppData\Local\Temp\opencode\e2.2-results'
$out = 'C:\Users\matti\AppData\Local\Temp\opencode\e2.2-review'
New-Item -ItemType Directory -Force -Path $out | Out-Null
```

Runtime rilevato: Node `v22.14.0`, V8 `12.4.254.21-node.22`.

Blocchi grezzi invarianti:

| Blocco | File | SHA-256 |
|---|---|---|
| A primario | `e2.2-main.json` | `96d533b3c579238246aba071f36003b3c990b30a9e232e560bb4a22382f445e7` |
| B seed | `e2.2-seed.json` | `1c4e33fc373d804feca97401ba3fe475163222eedc19fa8c89dd4c9eba656d59` |
| C durata | `e2.2-duration.json` | `a4580bd3c0c12f573a6df2e9af88f9219158bfde9b375f2c061b9ed52593cbd9` |
| D campionamento | `e2.2-sampling.json` | `d81f2c5ac146ec84678a75535525fe8c54cb4c74eb4f7b086b489d3fd26d9d32` |

---

## 3. Rigenerazione delle analisi

```powershell
$env:E2_FOODWEB_REANALYSIS_MAIN = "$raw\e2.2-main.json"
$env:E2_FOODWEB_REANALYSIS_SEED = "$raw\e2.2-seed.json"
$env:E2_FOODWEB_REANALYSIS_DURATION = "$raw\e2.2-duration.json"
$env:E2_FOODWEB_REANALYSIS_SAMPLING = "$raw\e2.2-sampling.json"
$env:E2_FOODWEB_REANALYSIS_MAIN_OUT = "$out\e2.2-review-main.json"
$env:E2_FOODWEB_REANALYSIS_SEED_OUT = "$out\e2.2-review-seed.json"
$env:E2_FOODWEB_REANALYSIS_DURATION_OUT = "$out\e2.2-review-duration.json"
$env:E2_FOODWEB_REANALYSIS_SAMPLING_OUT = "$out\e2.2-review-sampling.json"
$env:E2_FOODWEB_REANALYSIS_EXECUTED_AT = '2026-11-18T13:00:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_reanalysis.experiment.ts
```

**Exit code:** `0`. **Output:** quattro report review, 36/36/36/12 corse, 3/3/3/1 scenari. I `results` restano identici ai blocchi grezzi; solo `scientificReport`, `protocol.surrogate` e metadata `review` sono rigenerati.

Configurazione surrogate dichiarata in ogni report: `IAAFT`, `surrogates=199`, `iterations=12`, `seed=0x5eed1234`, `alpha=0.05`, `minOverlappingObservations=30` (soglia effettiva 68 per 271 punti).

---

## 4. Sensibilità corretta

```powershell
$env:E2_FOODWEB_SENS_MAIN = "$out\e2.2-review-main.json"
$env:E2_FOODWEB_SENS_SEED = "$out\e2.2-review-seed.json"
$env:E2_FOODWEB_SENS_DURATION = "$out\e2.2-review-duration.json"
$env:E2_FOODWEB_SENS_SAMPLING = "$out\e2.2-review-sampling.json"
$env:E2_FOODWEB_SENS_OUT = "$out\e2.2-review-sensitivity.json"
$env:E2_FOODWEB_SENS_EXECUTED_AT = '2026-11-18T13:10:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_sensitivity.experiment.ts
```

**Exit code:** `0`. **Schema:** `evoworld.e2.foodweb-sensitivity.v1`; `review.schema=evoworld.e2.foodweb-sensitivity-review.v1`.

Esiti essenziali:

- `classificationMatches` = `true` per S04, S05, S06 in seed e durata.
- `lagSignMatches.S06_predator_prey_mixed` = `true` per seed, `false` per durata.
- `truncatedPrimaryMatchesGenuineDuration=true`.
- Varianti di cadenza: lag H→C −1,67 / −2,50 / −3,33 tick per `sampleEvery=10/5/20`.

---

## 5. Validazione indipendente

```powershell
foreach ($name in 'MAIN','SEED','DURATION','SAMPLING') {
  $lower = $name.ToLower()
  Set-Item -Path "env:E2_FOODWEB_VALIDATION_RAW_$name" -Value "$raw\e2.2-$lower.json"
  Set-Item -Path "env:E2_FOODWEB_VALIDATION_REVIEW_$name" -Value "$out\e2.2-review-$lower.json"
}
$env:E2_FOODWEB_VALIDATION_ORIGINAL_MANIFEST = 'docs/research/e2/datasets/e2.2-foodweb.manifest.json'
$env:E2_FOODWEB_VALIDATION_ORIGINAL_ARCHIVE = 'docs/research/e2/datasets/e2.2-foodweb.json.gz'
$env:E2_FOODWEB_VALIDATION_OUT = "$out\e2.2-review-validation.json"
$env:E2_FOODWEB_VALIDATION_EXECUTED_AT = '2026-11-18T13:20:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_review_validation.experiment.ts
```

**Exit code:** `0`. **Schema output:** `evoworld.e2.foodweb-review-validation.v1`.

| Test | Risultato |
|---|---|
| Blocchi grezzi | 4/4 invarianti per hash file e hash stabile dei `results` |
| Archivio originale | `payloadSha256=755d2a4f…e772d`, `archiveSha256=d407c8d3…b79` |
| Positivo sintetico | `EVIDENZA_SEQUENZIALITA_POSITIVA`; Fisher `p=8,35464e−34`; 12/12 seed forti |
| Negativo sintetico | `EVIDENZA_SEQUENZIALITA_NEGATIVA`; 0/12 `r>0,lag>0`; 12/12 `r<0,lag>0`; `strongPositiveLagSeeds=0` |
| Sincrono | `NON_DIMOSTRATO`; statistica `NON_VALUTABILE`; 12/12 lag nulli |
| Lag search | 401 nominali, 41 su griglia, 360 senza coppie, 41 accettati, 251 coppie minime, perdita estrema 0,073801 |
| IAAFT proprietà | errore distribuzione `0`; autocorr observed `0,681633` vs surrogate `0,6732255` (errore `0,0084075`); trend residuo surrogate max `0,009335` |
| Calibrazione nullo | 120 test indipendenti × 99 surrogati; FPR `0,0583333`; `p` medio `0,5240833` |
| Realtà | H→C `NON_DIMOSTRATO` in 4/4 blocchi; H→kills `EVIDENZA_SEQUENZIALITA_POSITIVA` in 4/4 blocchi |

---

## 6. Dataset review

Il codice committato deve essere pulito prima della generazione. Stato verificato: solo il branch ahead di 1 commit, nessun file modificato.

```powershell
foreach ($name in 'MAIN','SEED','DURATION','SAMPLING') {
  $lower = $name.ToLower()
  Set-Item -Path "env:E2_FOODWEB_DATASET_$name" -Value "$out\e2.2-review-$lower.json"
}
$env:E2_FOODWEB_DATASET_SENSITIVITY = "$out\e2.2-review-sensitivity.json"
$env:E2_FOODWEB_DATASET_ORIGINAL_ARCHIVE = 'docs/research/e2/datasets/e2.2-foodweb.json.gz'
$env:E2_FOODWEB_DATASET_ORIGINAL_MANIFEST = 'docs/research/e2/datasets/e2.2-foodweb.manifest.json'
$env:E2_FOODWEB_DATASET_OUT_DIR = 'docs/research/e2/datasets'
$env:E2_FOODWEB_DATASET_LABEL = 'e2.2-foodweb-review'
$env:E2_FOODWEB_DATASET_CODE_COMMIT = '26983e352b39611137cc00268496cbb7be0f666f'
$env:E2_FOODWEB_DATASET_WORKING_TREE_DIRTY = '0'
$env:E2_FOODWEB_DATASET_EXECUTED_AT = '2026-11-18T13:30:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_dataset.experiment.ts
```

**Exit code:** `0`. **Output essenziale:**

```text
E2.2 review dataset written: e2.2-foodweb-review.json.gz
payloadSha256=14798d7a2188e3cf5aafdac9e82d75584ef07961791e8fb64ab93b68cd05475f
archiveSha256=47298821e188c53f6e677a69d336006193d48e5955b282ef4674d7aa39b8ef84
sourceSha256=2360a0d61b9127df36d67a379e3b723d4d4c6f9954608183d8c6d5b6800a111a
e1SourceSha256=24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe
codeCommit=26983e352b39611137cc00268496cbb7be0f666f
workingTreeDirty=false
totalRuns=120
originalDatasetUnchanged=true
```

SHA-256 del file manifest generato: `53194477a91415d920ce4354a359b4213251ca16fa95693c07b8972cab4b6620`.

### 6.1 Rigenerazione bit-identica

Rieseguendo lo stesso comando con `E2_FOODWEB_DATASET_OUT_DIR=$out\regeneration`:

- **Exit code:** `0`.
- Archivio: `ARCHIVE_MATCH=True`, `47298821e188c53f6e677a69d336006193d48e5955b282ef4674d7aa39b8ef84`.
- Manifest: `MANIFEST_MATCH=True`, `53194477a91415d920ce4354a359b4213251ca16fa95693c07b8972cab4b6620`.

---

## 7. Verifiche finali

```powershell
npx tsc --noEmit --incremental false
npx vitest run tests/e2 --reporter=dot
npx vitest run tests/e1 --reporter=dot
npm run build
```

| Comando | Output essenziale | Exit |
|---|---|---:|
| `npx tsc --noEmit --incremental false` | nessuna diagnostica | `0` |
| `npx vitest run tests/e2 --reporter=dot` | `12 passed`, `56 tests passed` | `0` |
| `npx vitest run tests/e1 --reporter=dot` | `7 passed`, `65 tests passed` | `0` |
| `npm run build` | Next.js 16.3.0 Turbopack, `Compiled successfully`, `Finished TypeScript`, 3/3 pagine statiche | `0` |
| `scripts/e2_foodweb_reanalysis.experiment.ts` | 4 report review | `0` |
| `scripts/e2_foodweb_sensitivity.experiment.ts` | sensibilità corretta | `0` |
| `scripts/e2_foodweb_review_validation.experiment.ts` | tutti i controlli superati | `0` |
| `scripts/e2_foodweb_dataset.experiment.ts` | dataset review + manifest | `0` |
| rigenerazione dataset | archivio e manifest byte-identici | `0` |

Diff di file protetti rispetto a `d330c12f345ab26ab7405b908c729e2e2f6bcc22`: **0 corrispondenze** sui pattern `simulation/**`, `tools/e1/**`, `tests/e1/**`, `lib/anatomy/**`, `lib/phenotype/**`, `docs/research/e1/**`, `scripts/e1*`, `app/**`, `src/**`, `next.config*`, `package*`.

---

## 8. Cambiamenti conclusivi

### 8.1 Confermati

- 120 corse grezze e archivio originale invariati.
- Kills nulle in S04/S05 (36/36 ciascuno) e positive in S06.
- Persistenza/coesistenza in S06 e determinismo del troncamento A→900.
- Identità strutturale `herbivoreFraction + carnivoreFraction = 1`.
- Direzione descrittiva erbivori→kills a lag positivo in tutti i blocchi.

### 8.2 Degradati o riformulati

- La sequenzialità erbivori→kills non si basa più su 12/12 seed o `|r|>=0,5`: richiede IAAFT con massimo sui lag e Fisher cross-seed.
- La dipendenza erbivoro→carnivoro resta `NON_DIMOSTRATO`, ma ora il motivo esplicito è l’instabilità della direzione del lag, non l’assenza di associazione statistica.
- `INDICATIVO_*` e `NON_DIMOSTRATO` sono determinati da direzione + statistica, non da soglie arbitrarie.

### 8.3 Respinti

- Significatività da `|r|>=0,5` o concordanza di seed.
- Tick come osservazioni indipendenti.
- Correlazione negativa forte come sequenzialità positiva.
- Qualsiasi salto da lag osservazionale a causalità.

---

## 9. Stato finale

Il branch contiene il codice corretto, le analisi rigenerate, il dataset review e la documentazione aggiornata. Non è stata aperta alcuna PR e non è stato eseguito alcun merge. Il lavoro si ferma per una nuova review indipendente prima di E2.3.
