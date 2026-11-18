# E2.2 — Correzioni della review indipendente

**Branch:** `research/e2-ecosystem-dynamics`  
**Commit codice finale:** `23778c4e8a29f0bf2e2d968a9322b50b5907f2c8`  
**Commit review precedente (superate):** `26983e352b39611137cc00268496cbb7be0f666f`  
**Data:** 2026-11-18  
**Stato:** difetto P1 corretto, analisi e dataset rigenerati, validazione estesa completata; **nessuna PR, nessun merge**.

Questo documento sostituisce la versione precedente delle correzioni. Registra la correzione del difetto P1 della IAAFT (padding/troncamento su FFT radix-2), la rigenerazione completa senza toccare il motore, la validazione statistica estesa e la provenienza del nuovo dataset. Le correzioni statistiche della review precedente restano valide e sono mantenute.

---

## 1. Difetto P1 e correzione

Il difetto P1 era nella trasformata usata dalla IAAFT: `fft()`/`transform()` arrotondano la lunghezza alla potenza di due successiva e l'anti-trasformazione restituiva la parte reale dell'array con padding. Nelle serie E2.2 con `N=271` (primo) — e anche `N=100`, `160` — questo introduciva campioni sintetici e poi li troncava, alterando spettro, autocorrelazione e lunghezza effettiva dei surrogati.

| Aspetto | Stato corretto | File |
|---|---|---|
| Lunghezza IAAFT | `exactAmplitudeSpectrum()`, `exactTransform()` e `exactIfftReal()` operano sempre su `N` campioni; nessun padding e nessun troncamento | `tools/e2/fourier.ts` |
| Piano di trasformata | radix-2 per potenze di due; matrice DFT diretta cache per `N<=600`; Rader per primi oltre 600; Cooley–Tukey a radix misto per gli altri composti; piani cache | `tools/e2/fourier.ts` |
| Rank-remapping | riordina esattamente `N` valori; la distribuzione empirica resta identica a priori | `tools/e2/surrogateInference.ts` |
| Convergenza | errore spettrale normalizzato completo dopo il rank-remapping, tolleranza `1e-3`; criterio, budget, iterazioni usate ed errori finali/migliori registrati in `SurrogateNullTest.convergence` | `tools/e2/surrogateInference.ts` |
| FFT con padding | `fft()/transform()` restano disponibili solo per la cross-correlazione via convoluzione, dove il padding è parte del metodo, non della IAAFT | `tools/e2/fourier.ts` |
| Inference invariata | statistica `max|r|` su tutti i lag accettati; `p=(1+#{nullMaxAbs>=observedMaxAbs})/(B+1)`; Fisher cross-seed; unità statistica = corsa/seed | `tools/e2/surrogateInference.ts`, `tools/e2/foodWebReport.ts` |
| Dataset | nuovo archivio `e2.2-foodweb-iaaft-review`; archivio originale e dataset della review precedente non sovrascritti | `scripts/e2_foodweb_dataset.experiment.ts` |

**Criterio di convergenza.** Dopo ogni rank-remapping si calcola

`E = sqrt(Σ_k (|X_surrogato(k)| − |X_serie(k)|)² / Σ_k |X_serie(k)|²)`

sullo spettro di ampiezza alla lunghezza esatta. Il surrogato si ferma se `E <= 1e-3`; altrimenti esegue il budget completo. Il budget è `12` nelle analisi e nella calibrazione, `24` nella validazione dedicata. I report non devono essere letti come “convergenza numerica raggiunta”: nei casi non degenerati la tolleranza non è stata raggiunta entro 12 iterazioni. La preservazione spettrale è quindi una quantità misurata sull'errore spettrale completo, non un'asserzione dedotta dall'autocorrelazione lag-1.

---

## 2. Correzioni della review precedente mantenute

| Problema | Correzione | File |
|---|---|---|
| `|r|` alto letto come sequenzialità con lag negativo | Segno di `r` e segno del lag separati; quadranti espliciti; verdetto `EVIDENZA_SEQUENZIALITA_POSITIVA/NEGATIVA` | `tools/e2/timeseries.ts`, `tools/e2/foodWebReport.ts` |
| Picco scelto dopo la ricerca sui lag senza correzione | Statistica test = `max|r|` su tutti i lag accettati; p-value `(1+hits)/(B+1)` | `tools/e2/surrogateInference.ts` |
| Tick trattati come repliche indipendenti | Unità statistica = corsa/seed; combinazione Fisher dei p-value per seed | `tools/e2/surrogateInference.ts`, `tools/e2/foodWebReport.ts` |
| Verdetto causale implicito | Quattro livelli separati: descrittivo, statistico, sequenzialità, causalità; quest'ultima sempre `NON_IDENTIFICABILE` | `tools/e2/foodWebReport.ts` |
| Solo erbivoro→carnivoro aveva un verdetto | `sequencingByPair` per ogni coppia, incluso erbivoro→kills | `tools/e2/foodWebReport.ts` |
| Fisher p arrotondato a 0 | Arrotondamento a cifre significative (`roundProbability`) | `tools/e2/surrogateInference.ts` |

---

## 3. Ambiente

```powershell
$env:Path = 'C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;' + $env:Path
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'
$raw = 'C:\Users\matti\AppData\Local\Temp\opencode\e2.2-results'
$out = 'C:\Users\matti\AppData\Local\Temp\opencode\e2.2-review-iaaft'
New-Item -ItemType Directory -Force -Path $out | Out-Null
```

Runtime: Node `v22.14.0`, V8 `12.4.254.21-node.22`.

Blocchi grezzi invarianti:

| Blocco | File | SHA-256 |
|---|---|---|
| A primario | `e2.2-main.json` | `96d533b3c579238246aba071f36003b3c990b30a9e232e560bb4a22382f445e7` |
| B seed | `e2.2-seed.json` | `1c4e33fc373d804feca97401ba3fe475163222eedc19fa8c89dd4c9eba656d59` |
| C durata | `e2.2-duration.json` | `a4580bd3c0c12f573a6df2e9af88f9219158bfde9b375f2c061b9ed52593cbd9` |
| D campionamento | `e2.2-sampling.json` | `d81f2c5ac146ec84678a75535525fe8c54cb4c74eb4f7b086b489d3fd26d9d32` |

---

## 4. Rigenerazione delle quattro analisi

Il selettore `E2_FOODWEB_REANALYSIS_ONLY` permette di rigenerare un blocco alla volta mantenendo lo stesso percorso di codice. Il timeout esplicito dello script è `1800000` ms per i blocchi a 271 punti.

```powershell
$inputs = @{
  MAIN = 'e2.2-main.json'; SEED = 'e2.2-seed.json'
  DURATION = 'e2.2-duration.json'; SAMPLING = 'e2.2-sampling.json'
}
foreach ($key in $inputs.Keys) {
  Set-Item -Path "env:E2_FOODWEB_REANALYSIS_$key" -Value "$raw\$($inputs[$key])"
  $lower = $key.ToLowerInvariant()
  Set-Item -Path "env:E2_FOODWEB_REANALYSIS_${key}_OUT" -Value "$out\$lower.json"
}
$env:E2_FOODWEB_REANALYSIS_EXECUTED_AT = '2026-11-18T14:10:00.000Z'
foreach ($block in 'main','seed','duration','sampling') {
  $env:E2_FOODWEB_REANALYSIS_ONLY = $block
  npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_reanalysis.experiment.ts --reporter=dot
}
```

**Exit code:** `0` per tutti e quattro i blocchi. Ogni report è collegato al rispettivo blocco grezzo tramite `review.sourceBlockSha256`.

| Report | SHA-256 | Corse | Scenari |
|---|---|---:|---:|
| `main.json` | `c8f4682884836cfbbcb2cb6050ceceb0f505d64a620ce0f507f5735cd5599d35` | 36 | 3 |
| `seed.json` | `17332ba65a54f9c5be733d78471f44a6ef8170c6c5e54c4f8495748e38d1a250` | 36 | 3 |
| `duration.json` | `7d0ea169b5fbd4af1e6ca23874731ac4ee4c5571b5497ca2869054a942d2df69` | 36 | 3 |
| `sampling.json` | `6b2af5c6543767c9914cca93a2e6ebe95db60a6a66e5fed382cb5314cc2f50b2` | 12 | 1 |

Configurazione dichiarata nei report: `IAAFT`, `surrogates=199`, `iterations=12`, `seed=0x5eed1234`, `alpha=0.05`, `minOverlappingObservations=30`. La soglia effettiva è `max(30, ceil(0,25·271))=68` osservazioni per 271 campioni.

Nei 600 record di test surrogati dei quattro report, le iterazioni usate sono `12` nei casi non degenerati (`0` nei casi degenerati); l'errore spettrale finale medio arriva fino a `0,240242387`, il massimo osservato è `0,527383515`; `71640/238800` surrogati soddisfano la tolleranza prima del budget. Questi valori sono metadata espliciti, non una dichiarazione di convergenza numerica.

---

## 5. Sensibilità

```powershell
$env:E2_FOODWEB_SENS_MAIN = "$out\main.json"
$env:E2_FOODWEB_SENS_SEED = "$out\seed.json"
$env:E2_FOODWEB_SENS_DURATION = "$out\duration.json"
$env:E2_FOODWEB_SENS_SAMPLING = "$out\sampling.json"
$env:E2_FOODWEB_SENS_OUT = "$out\sensitivity.json"
$env:E2_FOODWEB_SENS_EXECUTED_AT = '2026-11-18T14:20:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_sensitivity.experiment.ts --reporter=dot
```

**Exit code:** `0`. **Schema:** `evoworld.e2.foodweb-sensitivity.v1`.  
**SHA-256:** `e24e831e421b0bcd44ef8fea49d171ca67297c4813996fa4dc9c39433fbd0b97`.

- `classificationMatches=true` per S04, S05, S06 in seed e durata.
- `truncatedPrimaryMatchesGenuineDuration=true`.
- Lag H→C sulla griglia comune a 20 tick: `−1,6667 / −2,5000 / −3,3333` per `sampleEvery=10/5/20`; verdetto `NON_DIMOSTRATO` in tutte e tre le cadenze.

---

## 6. Validazione estesa

```powershell
foreach ($name in 'MAIN','SEED','DURATION','SAMPLING') {
  $lower = $name.ToLower()
  Set-Item -Path "env:E2_FOODWEB_VALIDATION_RAW_$name" -Value "$raw\e2.2-$lower.json"
  Set-Item -Path "env:E2_FOODWEB_VALIDATION_REVIEW_$name" -Value "$out\$lower.json"
}
$env:E2_FOODWEB_VALIDATION_ORIGINAL_MANIFEST = 'docs/research/e2/datasets/e2.2-foodweb.manifest.json'
$env:E2_FOODWEB_VALIDATION_ORIGINAL_ARCHIVE = 'docs/research/e2/datasets/e2.2-foodweb.json.gz'
$env:E2_FOODWEB_VALIDATION_OUT = "$out\e2.2-iaaft-validation.json"
$env:E2_FOODWEB_VALIDATION_EXECUTED_AT = '2026-11-18T14:30:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_review_validation.experiment.ts --reporter=dot
```

**Exit code:** `0`. **Schema:** `evoworld.e2.foodweb-review-validation.v2`.  
**Output:** `e2.2-iaaft-validation.json`, SHA-256 `f4678ffa0649708296d3e15407694b1025bf2cd6534da5371d35767ce41f35a6`.

### 6.1 Proprietà IAAFT obbligatorie

Budget di validazione `24`, tolleranza `1e-3`. L'errore autocorrelativo è il massimo dell'errore assoluto ai lag `1,2,3,5`.

| `N` | Errore spettrale max | Errore distribuzione | Errore autocorr. max | Finite | Deterministico | Iterazioni |
|---:|---:|---:|---:|---|---|---:|
| 100 | `0,046202889` | `0` | `0,037402055` | sì | sì | 24 |
| 160 | `0,026085407` | `0` | `0,009999292` | sì | sì | 24 |
| 271 | `0,023074578` | `0` | `0,003955791` | sì | sì | 24 |
| 256 | `0,019144668` | `0` | `0,006479020` | sì | sì | 24 |
| 512 | `0,009405645` | `0` | `0,005213310` | sì | sì | 24 |

Serie degenerati: costante (`N=160`, errore spettrale `0`), quasi costante (`N=160`, `2,6642549e−16`) e con valori ripetuti (`N=271`, `0,192279995`). Tutti finiti, con errore di distribuzione `0`.

### 6.2 Calibrazione, potenza e sensibilità

| Test | Risultato |
|---|---|
| Calibrazione nullo | AR(1) indipendenti, `phi=0/0,25/0,65/0,9`, `N=100/160/271`, 32 test per cella × 49 surrogati: FPR medio `0,033854167`, `p` medio `0,506666667`; FPR per `phi=0,9` = `0,09375/0,09375/0,0625` |
| Potenza a lag noto | 4 configurazioni (`N=100/271`, `phi=0,3/0,7`, lag 3): `8/8` lag positivi e Fisher `p=5,4987e−19` in ciascuna |
| Iterazioni | errore spettrale medio `0,136832575` a 1 iterazione → `0,024022862` a 12 → `0,020111847` a 24; p-value nullo `0,48/0,50/0,50/0,50` a 2/6/12/24 iterazioni |
| Numero di surrogati | `B=19/49/99/199` → p-value `0,45/0,50/0,46/0,44` |
| Blocchi grezzi e archivio originale | 4/4 invarianti per file e hash stabile dei `results`; payload e archivio originali invarianti |
| Positivo/negativo/sincrono sintetici | `EVIDENZA_SEQUENZIALITA_POSITIVA`, `EVIDENZA_SEQUENZIALITA_NEGATIVA`, `NON_DIMOSTRATO` con statistica `NON_VALUTABILE`; 12/12 lag nulli nel caso sincrono |
| Lag search | 401 nominali, 41 sulla griglia, 360 senza coppie, 41 accettati, coppie minime 251, perdita estrema `0,073801` |

### 6.3 Confronto prima/dopo la correzione P1

Il confronto tra i report della review precedente e quelli rigenerati mostra **nessun cambio di verdetto**: 20/20 coppie/blocchi S06 e 50/50 verdict across all scenarios rimangono identici. Cambiano i p-value surrogati, non la direzione descrittiva né la classificazione.

| Blocco | Coppia | p prima → dopo | Verdetto |
|---|---|---:|---|
| A primario | erbivoro→carnivoro | `4,36722e−36` → `2,4291e−31` | `NON_DIMOSTRATO` |
| A primario | erbivoro→kills | `2,29569e−40` → `2,29569e−40` | `EVIDENZA_SEQUENZIALITA_POSITIVA` |
| B seed | erbivoro→carnivoro | `6,54386e−36` → `2,60115e−35` | `NON_DIMOSTRATO` |
| B seed | erbivoro→kills | `2,29569e−40` → `2,29569e−40` | `EVIDENZA_SEQUENZIALITA_POSITIVA` |
| C durata | erbivoro→carnivoro | `2,29569e−40` → `2,29569e−40` | `NON_DIMOSTRATO` |
| C durata | erbivoro→kills | `8,14798e−40` → `8,14798e−40` | `EVIDENZA_SEQUENZIALITA_POSITIVA` |
| D campionamento | erbivoro→carnivoro | `1,29417e−35` → `7,06857e−31` | `NON_DIMOSTRATO` |
| D campionamento | erbivoro→kills | `2,29569e−40` → `2,29569e−40` | `EVIDENZA_SEQUENZIALITA_POSITIVA` |

---

## 7. Nuovo dataset

Il dataset della review precedente (`e2.2-foodweb-review`, payload `14798d7a…54d75f`, archivio `47298821…8ef84`) è **superato** e non è stato sovrascritto. Il nuovo archivio è generato dall'albero pulito al commit finale.

```powershell
foreach ($name in 'MAIN','SEED','DURATION','SAMPLING') {
  $lower = $name.ToLower()
  Set-Item -Path "env:E2_FOODWEB_DATASET_$name" -Value "$out\$lower.json"
}
$env:E2_FOODWEB_DATASET_SENSITIVITY = "$out\sensitivity.json"
$env:E2_FOODWEB_DATASET_ORIGINAL_ARCHIVE = 'docs/research/e2/datasets/e2.2-foodweb.json.gz'
$env:E2_FOODWEB_DATASET_ORIGINAL_MANIFEST = 'docs/research/e2/datasets/e2.2-foodweb.manifest.json'
$env:E2_FOODWEB_DATASET_OUT_DIR = 'docs/research/e2/datasets'
$env:E2_FOODWEB_DATASET_LABEL = 'e2.2-foodweb-iaaft-review'
$env:E2_FOODWEB_DATASET_CODE_COMMIT = '23778c4e8a29f0bf2e2d968a9322b50b5907f2c8'
$env:E2_FOODWEB_DATASET_WORKING_TREE_DIRTY = '0'
$env:E2_FOODWEB_DATASET_EXECUTED_AT = '2026-11-18T14:40:00.000Z'
npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_dataset.experiment.ts --reporter=dot
```

**Exit code:** `0`. **Output essenziale:**

```text
payloadSha256=d65c1dc8fe33025b991d1b577ccba13adfd9c77d492336410a0903ad1f538f03
archiveSha256=828189b5d9a033ae342f1e534e758ad768292fb0b3fb5d5e81f20c27225c60c4
sourceSha256=f1473528df31677d242cfc374300b2380f090ff08e3eafb4841d96079a645c6c
e1SourceSha256=24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe
codeCommit=23778c4e8a29f0bf2e2d968a9322b50b5907f2c8
workingTreeDirty=false
totalRuns=120
originalDatasetUnchanged=true
```

SHA-256 del manifest generato: `df1f8f9c1b2895ea15643eba9d9489a50e4e7532107f0b6ec618376b83a1eb8e`.

### 7.1 Rigenerazione bit-identica

Rieseguendo lo stesso comando con una directory di output separata: `ARCHIVE_MATCH=True` e `MANIFEST_MATCH=True` sugli stessi hash sopra.

---

## 8. Verifiche finali

```powershell
npx tsc --noEmit --incremental false
npx vitest run tests/e2 --reporter=dot
npx vitest run tests/e1 --reporter=dot
npm run build
```

| Comando | Output essenziale | Exit |
|---|---|---:|
| `npx tsc --noEmit --incremental false` | nessuna diagnostica | `0` |
| `npx vitest run tests/e2 --reporter=dot` | 13 file, 63 test | `0` |
| `npx vitest run tests/e1 --reporter=dot` | 7 file, 65 test | `0` |
| `npm run build` | Next.js 16.3.0 Turbopack, build completata, 3/3 pagine statiche | `0` |
| quattro reanalysis + sensibilità + validazione + dataset | exit `0`, hash verificati | `0` |
| rigenerazione dataset | archivio e manifest byte-identici | `0` |

Diff di file protetti rispetto a `d330c12f345ab26ab7405b908c729e2e2f6bcc22`: **0 corrispondenze**.

---

## 9. Stato finale

Il branch contiene il codice P1 corretto, le analisi rigenerate, la validazione estesa, il nuovo dataset `e2.2-foodweb-iaaft-review`, manifest e documentazione aggiornata. Le 120 corse grezze e l'archivio originale restano invariati. Non è stata aperta alcuna PR e non è stato eseguito alcun merge. Il lavoro si ferma per una nuova review indipendente prima di qualsiasi approvazione E2.2 o di E2.3.
