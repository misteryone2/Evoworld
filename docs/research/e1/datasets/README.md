# Dataset E1 — risultati riproducibili

Questa cartella contiene gli artefatti scientifici compressi della fase E1.2 e della fase E1.3. Il JSON grezzo non viene committato: ogni archivio `.json.gz` è accompagnato da un `.manifest.json` con checksum, provenance e comando esatto di riproduzione.

| Artefatto | Contenuto |
|---|---|
| `e1-phase2-baseline.json.gz` | Baseline E1.2, 84 corse (12 seed × 7 scenari), metriche spaziali pre-correzione, commit `d1e2b5b` |
| `e1-phase2-e1.3.json.gz` | Stesse 84 corse dopo la correzione di `wrapCellCoord()` e con confronti appaiati |
| `e1-phase2-comparison.json` | Confronto campo per campo tra i due output |

## Struttura del payload

Ogni archivio decompresso è un oggetto con:

- `schema`: versione del formato (`evoworld.e1.dataset.v1`);
- `provenance`: commit, `workingTreeDirty`, SHA-256 dei sorgenti E1.3, runtime Node/V8, timestamp ISO, nota. `sourceSha256` è calcolato sui byte dei sorgenti con terminatori di riga **LF**, come memorizzati nel repository: su Windows con `core.autocrlf=true`, normalizzare i file a LF prima di ricalcolarlo;
- `protocol`: scenario ID, seed, tick, `sampleEvery`, numero di corse e comando di riproduzione;
- `configuration`: per corsa — scenario, seed, dimensioni, popolazione iniziale, setup con metadati, perturbazione, opzioni;
- `results`: campioni grezzi per tick (senza tempi di esecuzione);
- `metrics`: report statistico calcolato dall'harness (con `pairedComparisons` in E1.3).

## Riproduzione esatta

Eseguire dalla radice del repository, sul branch `research/e1-ecosystem-qa`. **Usare Node `v22.14.0`**: il motore non usa `Math.random()` (PRNG mulberry32), ma impiega funzioni trascendenti (`Math.sin`, `Math.pow`, `Math.exp`) i cui ultimi bit possono differire tra versioni di V8 e far divergere le traiettorie dopo alcune centinaia di tick. Il runtime usato è registrato nella provenance del dataset:

```powershell
$env:E1_PHASE2_SEEDS = "1,2,3,4,5,6,7,8,9,10,11,12"
$env:E1_PHASE2_TICKS = "900"
$env:E1_PHASE2_SAMPLE_EVERY = "50"
$env:E1_PHASE2_OUT = "<percorso locale a scelta>.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts
```

L'output deve essere confrontato con il dataset dopo aver rimosso i campi variabili (`elapsedMs`, `timestamp`, `generatedAt`) tramite `stripVariableData()` e aver escluso la sezione `provenance`: il checksum `payloadSha256` è calcolato su JSON canonico con chiavi ordinate.

## Verifica del checksum

```powershell
# PowerShell (archiveSha256)
Get-FileHash -Algorithm SHA256 -Path "e1-phase2-e1.3.json.gz"

# Node (payloadSha256: checksum del payload decompresso, non del file gzip)
node -e "const fs=require('fs'),z=require('zlib'),c=require('crypto');const p=z.gunzipSync(fs.readFileSync('e1-phase2-e1.3.json.gz'));console.log(c.createHash('sha256').update(p).digest('hex'))"
```

## Rigenerazione degli artefatti

```powershell
$env:E1_DATASET_INPUT = "<percorso locale all'output phase2>"
$env:E1_DATASET_LABEL = "e1-phase2-e1.3"
$env:E1_DATASET_PHASE = "E1.3"
$env:E1_DATASET_OUT_DIR = "docs/research/e1/datasets"
npx vitest run --config vitest.experiment.config.ts scripts/e1_dataset.experiment.ts
```

I manifest committati conservano la provenance **effettiva delle corse**: `codeCommit = d1e2b5b` e `workingTreeDirty = true`, perché gli strumenti E1.3 non erano ancora committati quando le simulazioni sono state eseguite. `sourceSha256` identifica in modo immutabile i sorgenti esatti usati ed è il riferimento autorevole. Lo script di finalizzazione (che imposta `codeCommit` al commit corrente e `workingTreeDirty = false`) è disponibile solo per una successiva pubblicazione release, non è stato applicato a questi artefatti per non renderli inconsistenti con il payload che accompagnano:

```powershell
$env:E1_DATASET_FINALIZE = "1"
$env:E1_DATASET_LABEL = "e1-phase2-e1.3"
npx vitest run --config vitest.experiment.config.ts scripts/e1_dataset.experiment.ts
```

Nessun percorso assoluto o dato personale è presente negli artefatti: `assertPortable()` in `tools/e1/dataset.ts` fa fallire la generazione se ne rileva uno.
