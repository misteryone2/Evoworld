# E2.2.1 — Inferential hardening report

> Stato: rapporto finale compilato con gli artefatti di QA, calibrazione, validazione sintetica, stabilità, rianalisi e generazione dataset. Tutti i valori riportati provengono da esecuzioni registrate; i comandi con exit diverso da 0 sono segnalati esplicitamente nella sezione 10.

## 1. Sintesi esecutiva

Questa attività ha aggiunto un livello di **inferential hardening** all'analisi E2.2 senza rieseguire o modificare le 120 simulazioni biologiche. Sono stati introdotti: QA per-surrogato (IAAFT a lunghezza esatta, degrado esplicito a `NON_VALUTABILE`), calibrazione Monte Carlo FPR con limiti pre-registrati, famiglie di test multipli pre-dichiarate (Holm FWER primaria, BH FDR esplorativa con BY sensitivity) e validazione sintetica separata dalle conclusioni biologiche.

L'esito principale è che **l'evidenza P1 di sequenzialità positiva `herbivore→kills` in S06 non sopravvive**: in tutti e 4 i blocchi il verdetto diventa `NON_VALUTABILE` per QA insoddisfatta. Su 50 assessorati, 43 diventano `NON_VALUTABILE`, 4 perdono la significatività e restano 6 `NON_DIMOSTRATO` e 1 `INDICATIVO_NEGATIVO`, tutti nella famiglia esplorativa `vegetation_carnivore` e tutti non significativi sotto BY. La causalità resta `NON_IDENTIFICABILE` in ogni caso.

La calibrazione Monte Carlo su 48 celle × 1000 dataset indipendenti classifica 22 celle come accettate, 8 come degradate a `NON_VALUTABILE` per alta autocorrelazione, 8 come attese non valutabili (degenerate) e 10 come rigettate senza rilassare le soglie. Sulle sole celle accettate il FPR è `0.0448` (CI95 `0.0421–0.0476`), con p medio `0.5064` e KS `0.0419`; il regime high-phi resta critico (solo 4 celle high-phi accettate, FPR `0.0483`).

Raccomandazione: **fermarsi per revisione indipendente**, senza approvare merge.

## 2. Scope e isolamento

- Nessuna simulazione biologica rieseguita.
- Dati grezzi delle 120 corse: invarianti (hash verificati).
- Dataset originale e dataset P1 IAAFT review: invarianti (hash verificati).
- Modifiche limitate a: `tools/e2/**`, `tests/e2/**`, `scripts/e2*.ts`, documentazione E2.2.1 e nuovi dataset.
- `git diff --name-only` prima del commit: solo file E2 statistici/test/scripts/docs; zero file protetti.

## 3. Modifiche implementate

### 3.1 QA per-surrogato

`tools/e2/surrogateInference.ts` registra per ogni surrogato N, iterazioni, errore spettrale finale/migliore, convergenza, finitezza, lunghezza esatta, conservazione della distribuzione empirica, autocorrelazioni ai lag `1,2,3,5,10,20`, validità numerica e motivi di invalidazione. L'algoritmo IAAFT, il PRNG e la regola p-value restano invariati.

### 3.2 Hardening inference

`tools/e2/inferenceHardening.ts` aggiunge:

- gate QA pre-registrato e degrado esplicito a `NON_VALUTABILE`;
- conteggio surrogati validi/invalidi, non convergenti accettati e motivi di invalidazione;
- Fisher su soli test valutabili;
- Wilson CI, KS su griglia discreta e limiti di accettazione FPR;
- Holm FWER, BH FDR e sensibilità BY;
- conversione finale dei verdict e compattazione dei dettagli per-surrogato nei report.

### 3.3 Generatori sintetici

`tools/e2/syntheticSeries.ts` fornisce AR(1) deterministici Gaussiani/uniformi/esponenziali/discreti/binari, indipendenza, lag noto, segno noto, trend comune, rumore comune, regime shift, tie massicci e degenerazioni.

## 4. QA sensitivity e scelta delle soglie

Lo sweep finale (`qa-sensitivity.json`, SHA-256 `4ef0143bbdca5f873cf0732a15e0cb95c272b39099faa1fa934ce2cfa03cc6f6`) copre 75 celle: `N ∈ {100,160,271,512,1024}`, `phi ∈ {0,0.25,0.65,0.90,0.95}` e tre distribuzioni. A soglia spettrale `0.05`:

- 70/75 celle hanno almeno un surrogato accettato e un errore ACF ensemble misurabile; 5 celle discrete a `phi=0` non ne hanno;
- 21/70 celle misurabili superano l'errore ACF ensemble `0.15`;
- l'errore ACF ensemble massimo è `0.6578` (`N=100`, `phi=0.95`, discrete), con `0.3755` per Gaussiano e `0.3468` a `N=271`, `phi=0.95`;
- l'errore spettrale finale massimo è `0.1727` e la frazione di surrogati che raggiungono la tolleranza stretta `1e-3` entro 12 iterazioni è `0` in ogni cella.

La riduzione della soglia a `0.02` porta l'accettazione a zero o quasi zero in molte celle senza risolvere l'ACF; l'aumento a `0.2` non riduce l'errore ACF ensemble sotto `0.15` (es. `0.1978` a `N=100`, exponential, `phi=0`). Non esiste quindi una soglia spettrale che renda tutte le celle accettabili. Il lag aggiuntivo `floor(N/4)` è stato rimosso perché troppo rumoroso; restano i lag fissi `1,2,3,5,10,20`. La regola adottata è degradare a `NON_VALUTABILE` le celle il cui ACF ensemble supera `0.15`, senza rilassare la soglia. I surrogati non convergenti ma entro il gate vengono conservati e conteggiati in `nonConvergedAccepted`; la convergenza stretta è diagnostica, non requisito di validità.

## 5. Calibrazione Monte Carlo

Disegno pre-registrato: 9 chunk, 48 celle, **1000 dataset indipendenti per cella**, `B=49`, `iterations=12`, α `0.05`. Limiti di accettazione: FPR `<=0.065`, limite superiore Wilson CI95 `<=0.075`, media p `0.45–0.55`, KS su griglia discreta `<=0.045`, tasso `NON_VALUTABILE<=0.05`. Nessun limite è stato rilassato dopo aver visto i risultati. L'aggregato è `calibration-aggregate.json` (SHA-256 riportato nella sezione 11).

### 5.1 Classificazione delle celle

| Disposizione | Celle | Significato |
|---|---:|---|
| `ACCEPTED` | 22 | Tutti i limiti pre-registrati soddisfatti. |
| `DEGRADED_NON_VALUTABILE` | 8 | Alta autocorrelazione con QA insufficiente: regime `NON_VALUTABILE`, escluso dalla calibrazione applicabile. |
| `EXPECTED_NON_VALUTABILE` | 8 | Celle degenere/quasi degenere per disegno: `NON_VALUTABILE` atteso, non un fallimento. |
| `REJECTED` | 10 | Limiti pre-registrati non soddisfatti: richiedono indagine, non interpretazione. |

### 5.2 Aggregati

| Gruppo | Celle | Dataset indipendenti | Rigetti | FPR | CI95 Wilson | p medio | KS worst | `NON_VALUTABILE` |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| **Celle accettate** | 22 | 21.929 | 982 | **0.0448** | 0.0421–0.0476 | 0.5064 | 0.0419 | 0.0032 |
| Tutte le celle | 48 | 36.875 | 1.903 | 0.0516 | 0.0494–0.0539 | 0.4941 | 1.0000 | 0.2318 |
| `main_independent` (accettate) | 12 | 11.962 | 545 | 0.0456 | 0.0420–0.0494 | 0.5049 | 0.0419 | 0.0032 |
| `different_autocorrelation` (accettate) | 3 | 2.983 | 133 | 0.0446 | 0.0377–0.0526 | 0.5082 | 0.0245 | 0.0057 |
| `non_gaussian` (accettate) | 3 | 2.990 | 123 | 0.0411 | 0.0346–0.0489 | 0.5050 | 0.0323 | 0.0033 |
| `ties` (accettate) | 4 | 3.994 | 181 | 0.0453 | 0.0393–0.0522 | 0.5108 | 0.0220 | 0.0015 |
| `degenerate` (accettate) | 0 | 0 | 0 | — | — | — | — | — |
| High-phi (`phi>=0.9`, tutte) | 16 | 13.764 | 859 | 0.0624 | 0.0585–0.0666 | 0.4749 | 0.1691 | 0.1398 |
| High-phi (solo accettate) | 4 | 3.977 | 192 | 0.0483 | — | — | — | — |

Il risultato calibrazione **applicabile** è quello delle 22 celle accettate: FPR `0.0448`, CI95 `0.0421–0.0476`, p medio `0.5064`, KS `0.0419`, `NON_VALUTABILE=0.0032`. L'aggregato "tutte le celle" include le celle degradate, attese e rigettate e **non** costituisce un risultato di accettazione.

Il regime high-phi è il punto critico: considerando tutte le 16 celle `phi>=0.9`, FPR `0.0624` (limite `0.065`), ma KS `0.1691` e `NON_VALUTABILE=0.1398` superano i limiti; 8 celle sono degradate e 4 rigettate. Solo 4 celle high-phi (`main-phi0.9-N271`, `main-phi0.9-N512`, `mixed-phi0.9-0.25-N271`, `mixed-phi0.95-0.65-N271`) sono accettate, con FPR `0.0483`. Non è stata applicata alcuna relaxation: le celle high-phi non accettate restano fuori dalla calibrazione applicabile.

### 5.3 Tabella per cella

| Cella | Disposizione | Dataset | FPR | CI95 | p medio | KS | NON_VALUTABILE | Motivi |
|---|---|---:|---:|---|---:|---:|---:|---|
| main-phi0-N100 | ACCEPTED | 991 | 0.0545 | 0.0420–0.0704 | 0.5020 | 0.0203 | 0.0090 | — |
| main-phi0-N160 | REJECTED | 1000 | 0.0300 | 0.0211–0.0425 | 0.5284 | 0.0480 | 0.0000 | KS |
| main-phi0-N271 | ACCEPTED | 1000 | 0.0360 | 0.0261–0.0494 | 0.4972 | 0.0240 | 0.0000 | — |
| main-phi0-N512 | ACCEPTED | 1000 | 0.0410 | 0.0304–0.0551 | 0.5105 | 0.0160 | 0.0000 | — |
| main-phi0.25-N100 | ACCEPTED | 990 | 0.0465 | 0.0350–0.0614 | 0.4983 | 0.0291 | 0.0100 | — |
| main-phi0.25-N160 | ACCEPTED | 999 | 0.0460 | 0.0347–0.0609 | 0.5163 | 0.0224 | 0.0010 | — |
| main-phi0.25-N271 | ACCEPTED | 1000 | 0.0490 | 0.0373–0.0642 | 0.4977 | 0.0300 | 0.0000 | — |
| main-phi0.25-N512 | ACCEPTED | 1000 | 0.0430 | 0.0321–0.0574 | 0.4980 | 0.0360 | 0.0000 | — |
| main-phi0.65-N100 | REJECTED | 917 | 0.0436 | 0.0322–0.0589 | 0.5097 | 0.0173 | 0.0830 | tasso NON_VALUTABILE |
| main-phi0.65-N160 | ACCEPTED | 991 | 0.0303 | 0.0213–0.0429 | 0.5092 | 0.0168 | 0.0090 | — |
| main-phi0.65-N271 | ACCEPTED | 1000 | 0.0490 | 0.0373–0.0642 | 0.5007 | 0.0310 | 0.0000 | — |
| main-phi0.65-N512 | ACCEPTED | 1000 | 0.0470 | 0.0355–0.0619 | 0.5272 | 0.0400 | 0.0000 | — |
| main-phi0.9-N100 | DEGRADED | 537 | 0.0764 | 0.0568–0.1019 | 0.4331 | 0.1366 | 0.4630 | FPR, CI, p medio, KS, NON_VALUTABILE |
| main-phi0.9-N160 | DEGRADED | 927 | 0.0701 | 0.0554–0.0884 | 0.4702 | 0.0830 | 0.0730 | FPR, CI, KS, NON_VALUTABILE |
| main-phi0.9-N271 | ACCEPTED | 991 | 0.0545 | 0.0420–0.0704 | 0.4899 | 0.0419 | 0.0090 | — |
| main-phi0.9-N512 | ACCEPTED | 1000 | 0.0500 | 0.0381–0.0653 | 0.5114 | 0.0140 | 0.0000 | — |
| main-phi0.95-N100 | DEGRADED | 429 | 0.0886 | 0.0652–0.1192 | 0.4006 | 0.1691 | 0.5710 | FPR, CI, p medio, KS, NON_VALUTABILE |
| main-phi0.95-N160 | DEGRADED | 859 | 0.0827 | 0.0660–0.1030 | 0.4444 | 0.0998 | 0.1410 | FPR, CI, p medio, KS, NON_VALUTABILE |
| main-phi0.95-N271 | REJECTED | 979 | 0.0715 | 0.0570–0.0894 | 0.4662 | 0.0771 | 0.0210 | FPR, CI, KS |
| main-phi0.95-N512 | REJECTED | 1000 | 0.0420 | 0.0312–0.0563 | 0.4841 | 0.0560 | 0.0000 | KS |
| mixed-phi0.9-0.25-N100 | DEGRADED | 747 | 0.0495 | 0.0361–0.0675 | 0.5067 | 0.0241 | 0.2530 | NON_VALUTABILE |
| mixed-phi0.9-0.25-N271 | ACCEPTED | 997 | 0.0471 | 0.0356–0.0621 | 0.5158 | 0.0242 | 0.0030 | — |
| mixed-phi0.95-0.65-N100 | DEGRADED | 622 | 0.0611 | 0.0448–0.0827 | 0.4905 | 0.0515 | 0.3780 | CI, KS, NON_VALUTABILE |
| mixed-phi0.95-0.65-N271 | ACCEPTED | 989 | 0.0415 | 0.0307–0.0558 | 0.5012 | 0.0245 | 0.0110 | — |
| mixed-phi0.25-0.9-N100 | REJECTED | 768 | 0.0547 | 0.0407–0.0731 | 0.4854 | 0.0447 | 0.2320 | NON_VALUTABILE |
| mixed-phi0.25-0.9-N271 | ACCEPTED | 997 | 0.0451 | 0.0339–0.0599 | 0.5074 | 0.0113 | 0.0030 | — |
| mixed-phi0.65-0.95-N100 | REJECTED | 604 | 0.0563 | 0.0406–0.0776 | 0.4717 | 0.0709 | 0.3960 | CI, KS, NON_VALUTABILE |
| mixed-phi0.65-0.95-N271 | REJECTED | 992 | 0.0595 | 0.0464–0.0760 | 0.4992 | 0.0298 | 0.0080 | CI |
| nongauss-exponential-phi0.65-N160 | REJECTED | 878 | 0.0558 | 0.0425–0.0730 | 0.4965 | 0.0326 | 0.1220 | NON_VALUTABILE |
| nongauss-exponential-phi0.65-N271 | ACCEPTED | 994 | 0.0463 | 0.0349–0.0612 | 0.4988 | 0.0323 | 0.0060 | — |
| nongauss-exponential-phi0.95-N160 | DEGRADED | 855 | 0.0877 | 0.0706–0.1086 | 0.4530 | 0.0925 | 0.1450 | FPR, CI, KS, NON_VALUTABILE |
| nongauss-exponential-phi0.95-N271 | REJECTED | 972 | 0.0658 | 0.0519–0.0832 | 0.4723 | 0.0688 | 0.0280 | FPR, CI, KS |
| nongauss-discrete-phi0.65-N160 | ACCEPTED | 996 | 0.0442 | 0.0331–0.0588 | 0.5085 | 0.0113 | 0.0040 | — |
| nongauss-discrete-phi0.65-N271 | ACCEPTED | 1000 | 0.0330 | 0.0236–0.0460 | 0.5078 | 0.0180 | 0.0000 | — |
| nongauss-discrete-phi0.95-N160 | DEGRADED | 871 | 0.0700 | 0.0549–0.0889 | 0.4398 | 0.1113 | 0.1290 | FPR, CI, p medio, KS, NON_VALUTABILE |
| nongauss-discrete-phi0.95-N271 | REJECTED | 989 | 0.0657 | 0.0519–0.0829 | 0.4595 | 0.0829 | 0.0110 | FPR, CI, KS |
| ties-phi0.25-N160 | ACCEPTED | 1000 | 0.0460 | 0.0347–0.0608 | 0.5136 | 0.0220 | 0.0000 | — |
| ties-phi0.25-N271 | ACCEPTED | 1000 | 0.0440 | 0.0329–0.0586 | 0.5086 | 0.0180 | 0.0000 | — |
| ties-phi0.65-N160 | ACCEPTED | 995 | 0.0553 | 0.0427–0.0713 | 0.5101 | 0.0179 | 0.0050 | — |
| ties-phi0.65-N271 | ACCEPTED | 999 | 0.0360 | 0.0261–0.0495 | 0.5108 | 0.0152 | 0.0010 | — |
| degenerate-* (8 celle) | EXPECTED | 0 | — | — | — | — | 1.0000 | atteso per disegno |

Le celle `degenerate-constant-N100/N271`, `degenerate-near-constant-N100/N271`, `degenerate-tied-N100/N271` e `degenerate-binary-N100/N271` sono tutte `EXPECTED_NON_VALUTABILE` e non contribuiscono alla stima FPR. Tre chunk (`main-1`, `main-4`, `mixed-0`) hanno riportato exit `1` per timeout Vitest a 50 minuti **dopo** aver scritto l'artifact; l'integrità è stata verificata in modo indipendente (1000 repliche per cella). Vedi sezione 10.

## 6. Stabilità

**Numero di surrogati (`B=49/99/199`, 80 repliche per cella).** Sul nullo indipendente il FPR è `0.0375` per tutti e tre i valori di `B` (CI95 `0.013–0.105`), con media p `0.490/0.491/0.494`; `NON_VALUTABILE=0`. Sul nullo autocorrelato `phi=0.65`, a 80 repliche il FPR oscilla (`0.100/0.0625/0.075`) e la media p resta bassa (`0.428–0.429`): questa è una diagnosi a bassa potenza campionaria, non la calibrazione accettata. L'alternativa con lag noto 3 mantiene potenza `1.00`, accuratezza del lag `1.00` e della direzione `1.00` per ogni `B`, con `NON_VALUTABILE=0`. L'aumento di `B` riduce la granularità della griglia p-value, come atteso.

**Budget di iterazioni (`I=2/6/12/24`, `B=49`, 80 repliche per cella).** Con `I=2`, la cella autocorrelata diventa interamente `NON_VALUTABILE` e l'alternativa ha `5%` di `NON_VALUTABILE`; l'errore spettrale medio resta circa `0.037`. Con `I>=6` tutte le celle sono valutabili: FPR `0.0375/0.0375/0.0375` sul nullo indipendente e `0.1125/0.100/0.100` su quello autocorrelato, potenza sempre `1.00`. L'errore spettrale medio scende da `0.0169` (`I=6`) a `0.0135` (`I=12`) e `0.0128` (`I=24`), con guadagno marginale oltre 12. La frazione di surrogati che soddisfano la tolleranza stretta rimane `0` a ogni budget, coerente con il QA sweep; per questo la convergenza stretta viene registrata ma non usata come gate. Il budget `12` è confermato come compromesso; `24` resta disponibile solo nella sensitivity.

## 7. Validazione sintetica

| Scenario | Esito | Stima | CI95 Wilson | `NON_VALUTABILE` | Accuratezza lag/direzione | Split-half Δ |
|---|---|---:|---|---:|---|---:|
| `null-independent-phi0-N160` | FPR | 0.040 | 0.016–0.098 | 0 | — | 0.000 |
| `null-independent-phi065-N271` | FPR | 0.040 | 0.016–0.098 | 0 | — | 0.040 |
| `alternative-positive-lag3-phi025-N271` | potenza | 1.000 | 0.963–1.000 | 0 | 1.000 / 1.000 | 0.000 |
| `alternative-positive-lag7-phi065-N271` | potenza | 1.000 | 0.963–1.000 | 0 | 1.000 / 1.000 | 0.000 |
| `alternative-negative-lag3-phi025-N271` | potenza | 1.000 | 0.963–1.000 | 0 | 1.000 / 1.000 | 0.000 |
| `stress-common-trend-N271` | rigetto | 1.000 | 0.963–1.000 | 0 | — | 0.000 |
| `stress-common-noise-N271` | rigetto | 0.390 | 0.300–0.488 | 0 | — | 0.060 |
| `stress-nonstationary-N271` | rigetto | 0.071 | 0.035–0.139 | 0.010 | — | 0.019 |
| `stress-many-ties-N271` | FPR | 0.060 | 0.028–0.125 | 0 | — | 0.000 |
| `stress-degenerate-constant-N100` | NON_VALUTABILE | — | CK superiore 1.000 | 1.000 | — | 0.000 |
| `stress-near-constant-N100` | NON_VALUTABILE | — | CK superiore 1.000 | 1.000 | — | 0.000 |

I scenari `null` usano 100 dataset indipendenti per cella e mostrano FPR `0.04` in entrambi i regimi di autocorrelazione. Le tre alternative con lag noto 3/7 e segno noto raggiungono potenza, accuratezza del lag e accuratezza della direzione pari a `1.00`. Nei casi di stress: il trend comune produce rigetto certo ma **non** implica sequenzialità causale; il rumore comune simultaneo viene rigettato solo nel `39%` dei casi, come atteso per un segno non sequenziale; il regime shift produce `7.1%` di rigetti e `1%` di `NON_VALUTABILE`; i molti tie restano entro `6%` di FPR; serie costanti e quasi costanti sono sempre `NON_VALUTABILE`. Le differenze split-half restano `<=0.06`.

Tutti questi dati sono sintetici con ground truth noto e servono **solo** a validare il metodo: non entrano nelle conclusioni biologiche E2.2.

## 8. Rianalisi E2.2 e correzione multipla

La rianalisi ha rieseguito **solo l'inferenza** sui 4 blocchi già prodotti (`hardened-main.json`, `hardened-seed.json`, `hardened-duration.json`, `hardened-sampling.json`) con `B=199` e `iterations=12`, poi ha combinato i 50 assessorati in `hardened-combined.json`. Le 120 simulazioni biologiche e i 4 raw block non sono stati toccati: gli hash dei raw block sono riportati nella sezione 11.

### 8.1 Famiglie pre-registrate

| Famiglia | Metodo | α | Coppie | Note |
|---|---|---:|---|---|
| `primary_s06_sequencing` | Holm FWER | 0.05 | `herbivore_carnivore`, `herbivore_kills` | Dichiarata prima dell'analisi in S06, tutti e 4 i blocchi. Holm perché i blocchi riutilizzano le stesse 120 corse e **non** sono repliche indipendenti. |
| `exploratory_s06_remaining_pairs` | BH FDR | 0.05 | `carnivore_kills`, `vegetation_herbivore`, `vegetation_carnivore` | Esplorativa; BY riportato come sensitivity. Dipendenza positiva plausibile ma non dimostrata. |

### 8.2 Esito per blocco

| Blocco | Test | Valutabili | `NON_VALUTABILE` | Surrogati validi | Surrogati rigettati | Non convergenti accettati |
|---|---:|---:|---:|---:|---:|---:|
| `main` | 180 | 9 | 171 | 1.461 | 330 | 1.461 |
| `seed` | 180 | 6 | 174 | 912 | 282 | 912 |
| `duration` | 180 | 0 | 180 | 0 | 0 | 0 |
| `sampling` | 60 | 3 | 57 | 514 | 83 | 514 |

Le ragioni di invalidazione dominanti, su tutti i blocchi, sono l'errore spettrale dei surrogati A/B oltre `0.05` e l'errore ACF ensemble oltre `0.15`; **tutti** i surrogati accettati rientrano nella categoria `nonConvergedAccepted`, coerente con il QA sweep (la convergenza stretta non è un gate). Le contezze dettagliate per ragione sono nel payload `hardened-combined.json`.

### 8.3 Assessment valutabili residui

| ID | p grezzo | p Holm/BH | p BY | Verdetto prima | Verdetto dopo |
|---|---:|---:|---:|---|---|
| `main\|S04\|vegetation_carnivore` | 0.026212 | 0.045870 | 0.118935 | `NON_DIMOSTRATO` | `NON_DIMOSTRATO` |
| `main\|S05\|vegetation_carnivore` | 0.026212 | 0.045870 | 0.118935 | `NON_DIMOSTRATO` | `NON_DIMOSTRATO` |
| `main\|S06\|vegetation_carnivore` | 0.026212 | 0.045870 | 0.118935 | `NON_DIMOSTRATO` | `NON_DIMOSTRATO` |
| `seed\|S04\|vegetation_carnivore` | 0.199501 | 0.199501 | 0.517278 | `NON_DIMOSTRATO` | `NON_DIMOSTRATO` |
| `seed\|S05\|vegetation_carnivore` | 0.199501 | 0.199501 | 0.517278 | `INDICATIVO_NEGATIVO` | `INDICATIVO_NEGATIVO` |
| `seed\|S06\|vegetation_carnivore` | 0.199501 | 0.199501 | 0.517278 | `NON_DIMOSTRATO` | `NON_DIMOSTRATO` |
| `sampling\|S06\|vegetation_carnivore` | 0.024479 | 0.045870 | 0.118935 | `NON_DIMOSTRATO` | `NON_DIMOSTRATO` |

Tutti i 7 assessment residui appartengono alla famiglia esplorativa `vegetation_carnivore`: tre superano BH a `0.05` ma **non** superano BY (`0.1189`), quindi restano `NON_DIMOSTRATO`; quello `INDICATIVO_NEGATIVO` resta tale. Nessun assessment della famiglia primaria è valutabile: l'evidenza P1 di sequenzialità positiva `herbivore→kills` in S06 **non è confermata**, e anche `herbivore→carnivore`, già `NON_DIMOSTRATO` in P1, diventa `NON_VALUTABILE`.

### 8.4 Separazione dei verdict

Per ogni assessorato la descrizione osservativa (serie e picchi misurati), la significatività (p grezzo/addustato e QA), la direzione (positiva/negativa/mista dove rilevabile), il verdetto finale e la causalità sono campi distinti. In particolare:

- **descrizione**: invariata, deriva dai raw block originali;
- **significatività**: rivalutata con gate QA e correzione multipla; 43/50 casi diventano `NON_VALUTABILE`;
- **direzione**: non attribuita nei casi `NON_VALUTABILE`; nei 7 casi valutabili resta indicativa e non causale;
- **verdetto finale**: `NON_VALUTABILE` (43), `NON_DIMOSTRATO` (6), `INDICATIVO_NEGATIVO` (1);
- **causalità**: sempre `NON_IDENTIFICABILE`, indipendentemente dal verdetto.

La significatività, anche laddove presente, non implica sequenzialità causale: il test rileva struttura temporale, non direzione causale.

## 9. Cambiamenti di verdict rispetto a P1

Dei 50 assessorati, **43 cambiano verdetto** e **4 perdono la significatività**. Nessun verdetto cambia in senso di maggiore evidenza.

### 9.1 Significatività perse (tutte in S06)

| Blocco | Coppia | P1 | Dopo hardening (pre-adjustment) | Finale |
|---|---|---|---|---|
| `main` | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` | `NON_VALUTABILE` | `NON_VALUTABILE` |
| `seed` | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` | `NON_VALUTABILE` | `NON_VALUTABILE` |
| `duration` | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` | `NON_VALUTABILE` | `NON_VALUTABILE` |
| `sampling` | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` | `NON_VALUTABILE` | `NON_VALUTABILE` |

### 9.2 Elenco completo dei 43 cambiamenti

| Blocco | Scenario | Coppia | P1 → Finale |
|---|---|---|---|
| main | S04 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S04 | `herbivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S04 | `carnivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S04 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S05 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S05 | `herbivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S05 | `carnivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S05 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S06 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| main | S06 | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` → `NON_VALUTABILE` |
| main | S06 | `carnivore_kills` | `INDICATIVO_POSITIVO` → `NON_VALUTABILE` |
| main | S06 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S04 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S04 | `herbivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S04 | `carnivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S04 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S05 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S05 | `herbivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S05 | `carnivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S05 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S06 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| seed | S06 | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` → `NON_VALUTABILE` |
| seed | S06 | `carnivore_kills` | `INDICATIVO_POSITIVO` → `NON_VALUTABILE` |
| seed | S06 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S04 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S04 | `herbivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S04 | `carnivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S04 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S04 | `vegetation_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S05 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S05 | `herbivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S05 | `carnivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S05 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S05 | `vegetation_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S06 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S06 | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` → `NON_VALUTABILE` |
| duration | S06 | `carnivore_kills` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S06 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| duration | S06 | `vegetation_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| sampling | S06 | `herbivore_carnivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |
| sampling | S06 | `herbivore_kills` | `EVIDENZA_SEQUENZIALITA_POSITIVA` → `NON_VALUTABILE` |
| sampling | S06 | `carnivore_kills` | `INDICATIVO_POSITIVO` → `NON_VALUTABILE` |
| sampling | S06 | `vegetation_herbivore` | `NON_DIMOSTRATO` → `NON_VALUTABILE` |

I 7 assessorati non cambiati sono tutti `vegetation_carnivore` nei blocchi `main`, `seed` e `sampling`, elencati nella sezione 8.3.

## 10. Test eseguiti

Tutti i comandi sono stati eseguiti da `C:\Users\matti\Documents\Progetto predefinito\Evoworld-git` con Node `v22.14.0` e `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`. Il log completo, inclusi gli ID dei job background, è in `test-results.md`. **Nessun test non eseguito è riportato come PASS.**

| Comando | Exit | Risultato | Warning | Durata |
|---|---:|---|---|---:|
| `npx tsc --noEmit --pretty false` (dopo core QA + script calibrazione) | 0 | pulito | nessuno | non instrumentata |
| QA sensitivity, 1ª run (lag `floor(N/4)`) | 0 | superseded: lag troppo rumoroso | nessuno | 9.646 ms shell / 8,51 s Vitest |
| QA sensitivity, 2ª run (gate ACF individuale) | 0 | superseded: ACF individuale è diagnostico | nessuno | 8,27 s Vitest |
| QA sensitivity, 3ª run (ACF ensemble, bound `0.10`) | 0 | superseded: bound poi fissato a `0.15` | nessuno | 8,49 s Vitest |
| QA sensitivity finale (`E2_HARDENING_QA_EXECUTED_AT=...16:15Z`) | 0 | 1/1, SHA `4ef0143b...cc6f6` | nessuno | 8,63 s Vitest |
| Calibrazione `main-0`, KS continuo | 0 | superseded da KS su griglia discreta | `main-phi0-N160` KS continuo `0.068` | 1.032.928 ms shell / 1.031,71 s Vitest |
| Test focalizzati, 1º tentativo | 1 | 31/33; 2 assertion troppo strette | 2 failure di assertion | 8.210 ms shell / 4,66 s Vitest |
| Launcher parallelo `run-remaining-throttled.ps1` (13 child) | 1 | 0/13 utilizzabili | `STATUS_CONTROL_C_EXIT` (-1073741510) | 55.917 ms |
| `run-calibration-sequential.ps1` 1º tentativo | 1 | chunk non riconosciuto | parsing argomento; corretto con `-ChunksCsv` | 5.071 ms |
| Test focalizzati corretti | 0 | 4 file, 33/33 | nessuno | 7.240 ms shell / 4,19 s Vitest |
| `npx tsc --noEmit --pretty false` (dopo script stabilità/sintetici/rianalisi/dataset) | 0 | pulito | nessuno | non instrumentata |
| `npx vitest run tests/e2` | 0 | 14 file, 70/70 | nessuno | 18.445 ms shell / 10,44 s Vitest |
| `npx vitest run tests/e1` | 0 | 7 file, 65/65 | nessuno | 13.649 ms shell / 7,45 s Vitest |
| `npm run build` | 0 | build Next.js 16.3.0 riuscito | nessuno | 36.671 ms |
| `synthetic-null` | 0 | FPR `0.040` in entrambi i null | nessuno | vedi `test-results.md` |
| `synthetic-alternative` | 0 | potenza/lag/direzione `1.00` | nessuno | 176.729 ms shell / 175,53 s Vitest |
| `synthetic-stress` | 0 | 6 scenari, degeneri `NON_VALUTABILE=1` | nessuno | 354.034 ms shell / 350,90 s Vitest |
| `stability-surrogates` | 0 | 9 righe, `B=49/99/199` | nessuno | 994.460 ms shell / 992,93 s Vitest |
| `stability-iterations` | 0 | 12 righe, `I=2/6/12/24`; `I=2` fallisce il nullo autocorrelato | nessuno | 541.172 ms shell / 538,53 s Vitest |
| `npx tsc --noEmit --pretty false` (dopo fix aggregator/report) | 0 | pulito | nessuno | non instrumentata |
| `run-reanalysis-sequential.ps1` — `main` | 0 | 180 test, 9 valutabili | nessuno | 712.391 ms shell / 709,42 s Vitest |
| `run-reanalysis-sequential.ps1` — `seed` | 0 | 180 test, 6 valutabili | nessuno | 592.315 ms shell / 586,62 s Vitest |
| `run-reanalysis-sequential.ps1` — `duration` | 0 | 180 test, 0 valutabili | nessuno | 103.064 ms shell / 100,58 s Vitest |
| `run-reanalysis-sequential.ps1` — `sampling` | 0 | 60 test, 3 valutabili | nessuno | 685.950 ms shell / 679,83 s Vitest |
| `run-reanalysis-sequential.ps1` — combine | 0 | 50 assessorati, 43 cambiati, 4 significatività perse | nessuno | 36.055 ms shell / 30,87 s Vitest |
| `run-calibration-sequential.ps1` — `main-0` | 0 | 4 celle, `calibration-main-0.json` | nessuno | 1.680.856 ms shell / 1.678,01 s Vitest |
| `run-calibration-sequential.ps1` — `main-1` | 1 | 4 celle, artifact completo verificato | timeout Vitest 3.000.000 ms dopo 3.250.336 ms; artifact scritto prima del timeout | 3.255.626 ms shell / 3.252,58 s Vitest |
| `run-calibration-sequential.ps1` — `main-2` | 0 | 4 celle, `calibration-main-2.json` | nessuno | 2.036.410 ms shell / 2.030,77 s Vitest |
| `run-calibration-sequential.ps1` — `main-3` | 0 | 4 celle, `calibration-main-3.json` | nessuno | 1.655.202 ms shell / 1.653,08 s Vitest |
| `run-calibration-sequential.ps1` — `main-4` | 1 | 4 celle, artifact completo verificato | timeout Vitest 3.000.000 ms dopo 3.272.451 ms; artifact scritto prima del timeout | 3.277.645 ms shell / 3.274,78 s Vitest |
| `run-calibration-sequential.ps1` — `mixed-0` | 1 | 8 celle, artifact completo verificato | timeout Vitest 3.000.000 ms dopo 3.235.321 ms; artifact scritto prima del timeout | 3.239.814 ms shell / 3.237,24 s Vitest |
| `run-calibration-sequential.ps1` — `nongauss-0` | 0 | 8 celle, `calibration-nongauss-0.json` | nessuno | 2.329.252 ms shell / 2.327,97 s Vitest |
| `run-calibration-sequential.ps1` — `ties-0` | 0 | 4 celle, `calibration-ties-0.json` | nessuno | 2.541.263 ms shell / 2.535,72 s Vitest |
| `run-calibration-sequential.ps1` — `degenerate-0` | 0 | 8 celle, `calibration-degenerate-0.json` | nessuno | 1.862.478 ms shell / 1.855,45 s Vitest |
| Aggregatore calibrazione | 0 | 48 celle: 22 accettate, 8 degradate, 8 attese, 10 rigettate; FPR accettate `0.0448` | nessuno | 2.977 ms shell / 1,38 s Vitest |
| Generatore dataset/manifest | 0 | payload `cf3834f6...4463e9`, archive `54c6ad5d...23e3e`, manifest `afcdbb98...56c42`, 120 run, raw/prior invarianti | nessuno | 22.601 ms shell / 21,37 s Vitest |
| `npx tsc --noEmit --pretty false` (finale) | 0 | pulito | nessuno | 41.534 ms |
| Test focalizzati finali | 0 | 4 file, 33/33 | nessuno | 2.590 ms shell / 1,46 s Vitest |
| `npx vitest run tests/e2` (finale) | 0 | 14 file, 70/70 | nessuno | 3.093 ms shell / 1,90 s Vitest |
| `npx vitest run tests/e1` (finale) | 0 | 7 file, 65/65 | nessuno | 2.961 ms shell / 1,85 s Vitest |
| `npm run build` (finale) | 0 | build Next.js 16.3.0, TypeScript pulito | nessuno | 38.789 ms |
| Diff file protetti | 0 | output vuoto | nessuno | non instrumentata |
| Verifica SHA-256 indipendente di dataset, artifact e dataset preservati | 0 | tutti gli hash corrispondono | nessuno | non instrumentata |

## 11. Artefatti e hash

### 11.1 Dataset E2.2.1

| Elemento | Valore |
|---|---|
| Payload | `docs/research/e2/datasets/e2.2-foodweb-inferential-hardening.json.gz` |
| Manifest | `docs/research/e2/datasets/e2.2-foodweb-inferential-hardening.manifest.json` |
| `payloadSha256` | `cf3834f616df6b66014598ba47ca6313ba851886182e5e10ed646a97df4463e9` |
| `archiveSha256` | `54c6ad5dfd8d5cd972bccf33b5a13a114e737c5cb01b8fb44ceb46e8b1223e3e` |
| Manifest SHA-256 | `afcdbb98634c098a78aa23ab863f6507e52fc9a301a405cee70c4692fee56c42` |
| `sourceSha256` | `496fefc739b439c56ac020d713bc3175332a18297b1013ab29c1eac065faed06` |
| `e1SourceSha256` | `24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe` |
| `codeCommit` | `70e4f5bd15f36d8456b8b0934d20a54d1121a4e5` |
| `workingTreeDirty` | `false` |
| Runtime | Node `v22.14.0`, V8 `12.4.254.21-node.22` |
| `executedAt` | `2026-11-18T20:30:00.000Z` |
| `totalRuns` | 120 |

### 11.2 Raw block invarianti

| Blocco | SHA-256 |
|---|---|
| `e2.2-main.json` | `96d533b3c579238246aba071f36003b3c990b30a9e232e560bb4a22382f445e7` |
| `e2.2-seed.json` | `1c4e33fc373d804feca97401ba3fe475163222eedc19fa8c89dd4c9eba656d59` |
| `e2.2-duration.json` | `a4580bd3c0c12f573a6df2e9af88f9219158bfde9b375f2c061b9ed52593cbd9` |
| `e2.2-sampling.json` | `d81f2c5ac146ec84678a75535525fe8c54cb4c74eb4f7b086b489d3fd26d9d32` |

### 11.3 Dataset preservati

| Dataset | Payload SHA-256 | Archive SHA-256 | Manifest SHA-256 |
|---|---|---|---|
| `e2.2-foodweb` (originale) | `755d2a4f778ba8c90243daee3dd01e63530380567ac36875d8ecc281dc5e772d` | `d407c8d3a906ff1d0909681f95a9f441173f502eb61a3b39970a82ef17f7cb79` | `8e0a5ed662fa43f574e03c2622ef25aa6d5c35d6f296d4521a8ea6efca29691f` |
| `e2.2-foodweb-iaaft-review` (P1) | `d65c1dc8fe33025b991d1b577ccba13adfd9c77d492336410a0903ad1f538f03` | `828189b5d9a033ae342f1e534e758ad768292fb0b3fb5d5e81f20c27225c60c4` | `df1f8f9c1b2895ea15643eba9d9489a50e4e7532107f0b6ec618376b83a1eb8e` |

### 11.4 Artifact di validazione (SHA-256)

| Artifact | SHA-256 |
|---|---|
| `qa-sensitivity.json` | `4ef0143bbdca5f873cf0732a15e0cb95c272b39099faa1fa934ce2cfa03cc6f6` |
| `calibration-aggregate.json` | `518ebe3f7fe7c49968620994310c916850f9b01dc0058a25a11e4b6b09e91c72` |
| `synthetic-null.json` | `4a7974dd01c5bec2ba7a19dffbb9e0f4484d2e242dba95c5009a01cd5c136dd7` |
| `synthetic-alternative.json` | `78e742fbb3a276b58ee5914963d7adf66d5946a55ab9ffd2c16a13b49662a452` |
| `synthetic-stress.json` | `b77d4e235b8a9abdb7002109ccc976e26bc6052ed9e012ca3978e92bd1d4b357` |
| `stability-surrogates.json` | `a6f66adb2abe0d06d0981a8f5a4ac87dda328c980a6c3317f437f56f4563d584` |
| `stability-iterations.json` | `f63c82c0299462b6ee60230ae0e31340150d32f301e762572c222b28547fb639` |
| `hardened-main.json` | `07f25651733b853614eb7c6063309b6acddfa6b0bfef66c99e501da9a5bcaf30` |
| `hardened-seed.json` | `de4a3533b3582cbf1bf3dba8544487d19055db3b95410b07ec42a88c26843b75` |
| `hardened-duration.json` | `a1d9f5bdb955250be4139f6e38c8b5f86e488fb11cfb4d4ba3072820475a4c30` |
| `hardened-sampling.json` | `7ac1128d1bf6ece678554a1d21d8d6354c7d8a8ccb6426d06fadb9a73f1b76e6` |
| `hardened-combined.json` | `5bc80bc342815e53f192bd86e68b87206b5015e192cc2250d06048a212694525` |

## 12. Criticalità residua

1. **Surrogati non convergenti accettati.** Tutti i surrogati accettati nella rianalisi rientrano in `nonConvergedAccepted`: entro 12 iterazioni nessuno raggiunge la tolleranza stretta `1e-3`, pur rispettando il gate pre-registrato. La convergenza stretta è registrata ma non è un gate; questo limite va tenuto presente nella interpretazione.
2. **Degrado massivo a `NON_VALUTABILE`.** 43/50 assessorati (86%) non sono valutabili per errore spettrale o ACF ensemble oltre le soglie. Non è stato rilassato alcun limite per recuperare significatività: il risultato è una perdita di potenza, non un fallimento del controllo.
3. **Dipendenza tra blocchi.** I quattro blocchi riutilizzano le stesse 120 corse e non sono repliche indipendenti. Holm è stato applicato alla famiglia primaria e BH/BY a quella esplorativa, ma l'interpretazione come FWER/FDR indipendente non è garantita.
4. **Calibrazione con `B=49`, `iterations=12`.** Il compromesso computazionale è stato scelto prima dei risultati; la calibrazione non è equivalente a `B=199`, usato nella rianalisi. La stabilità `B=49/99/199` sul nullo indipendente è `0.0375` per tutti, ma la granularità della griglia p-value differisce.
5. **Stazionarietà e trend comune.** Lo scenario `stress-common-trend` viene rigettato nel 100% dei casi: il test rileva struttura temporale anche quando non c'è sequenzialità. Il test non distingue trend comune da relazione sequenziale.
6. **Rumore comune e regime shift.** Il rumore comune simultaneo è rigettato solo nel 39% dei casi e il regime shift nel 7,1%: la specificità rispetto a queste strutture non è perfetta.
7. **Direzione e causalità.** Anche nei 7 casi valutabili la direzione resta indicativa; la causalità è sempre `NON_IDENTIFICABILE`.
8. **Potenza ridotta.** Il degrado colpisce soprattutto `duration` (0 valutabili su 180 test): eventuali effetti in quel blocco non possono essere né confermati né esclusi con questo metodo.

9. **Calibrazione high-phi e celle rigettate.** 10 celle non soddisfano i limiti pre-registrati e richiedono indagine: non sono state interpretate né fatte passare. 8 celle high-phi sono degradate e 4 rigettate; solo 4 high-phi sono accettate. Il FPR complessivo `0.0448` non può essere esteso a tutto il dominio `phi>=0.9`.
10. **Timeout dei job di calibrazione.** Tre chunk (`main-1`, `main-4`, `mixed-0`) sono usciti con exit `1` per timeout Vitest a 50 minuti, sebbene gli artifact risultino completi e verificati. Il dato è utilizzabile ma l'esecuzione non è registrata come "test PASS"; il log riporta exit reale e warning.

## 13. Stato branch e raccomandazione

- Branch: `research/e2-ecosystem-dynamics`
- Base `main`: `d330c12f345ab26ab7405b908c729e2e2f6bcc22`
- Commit codice: `70e4f5bd15f36d8456b8b0934d20a54d1121a4e5`
- Commit documentazione/dataset: `2bc64ef12b7ea96dfab643d4be593fa3b7f0e599`
- Push: completato su `origin/research/e2-ecosystem-dynamics`; il primo push ha pubblicato `2bc64ef12b7ea96dfab643d4be593fa3b7f0e599`, il secondo pubblica la finalizzazione di questo report. Nessun push su `main`.
- Nessun PR, nessun merge, nessuna modifica a `main`.
- Raccomandazione: **fermarsi per revisione indipendente**; non approvare il merge.
