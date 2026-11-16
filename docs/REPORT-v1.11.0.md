# EvoWorld v1.11.0 — Report di verifica (implementazione della specifica di Vibe)

Ambiente: sandbox Linux a **una sola CPU**, Node, Vitest 4.1, Next 16.3. Nessun dispositivo fisico: FPS, telefono e GPU **non verificati**.

## 1. Riferimenti Git
`main` e `preserve/post-1.10.5-head` = `1967a47` (non modificati). `integration/v1.11.0-vibe-spec` = linea consegnata (da `1967a47`).
`backup/v1.11.0-13geni` = prima versione a 13 geni, progettata prima di ricevere la specifica (non consegnata). `consolidation/v1.10.5` = da `50c350b`.
La linea parte da `1967a47` perché su `50c350b` `tsc` fallisce (`page.tsx` e `CameraModeBar` usano la modalità `"free"`).

## 2. Verifiche tecniche
| Comando | Esito |
|---|---|
| `npx tsc --noEmit` | pulito |
| `npx vitest run --testTimeout=60000` | **680 superati, 5 falliti, 685 totali** (59 file) |
| `npx next build` | ok |
| `npm run benchmark` | **non eseguito** (benchmark di scala lento; una sola CPU, limite di tempo per comando) |

**Le 5 failure (nessuna è una regressione):**
1. `reproduction.test.ts` ×2: preesistenti (falliscono già alla v1.10.0).
2. `fauna180.test.ts` (sfumatura ventre-dorso, 1,08 contro 1): in attesa della conferma di Mattia. Nella linea era comparso un commit precedente (`1680667`) che cambiava l'aspettativa senza la tua autorizzazione: **l'ho ripristinata** com'era in `1967a47`.
3. `vibeGenomeV1110.test.ts` ×2: la suite di Vibe è inclusa **senza modifiche** (31 test su 33 passano). I due fallimenti sono incoerenze tra suite e specifica, non del codice: la chiave `socialTolerance` contiene "social" (test anti-comportamento) e il campo `movementCostFactor` contiene "move" (test PER-03). Dettagli e altri test vuoti in `docs/GENOMA-v1.11.0.md` §8.

**Test nuovi** (`tests/genomeV2.test.ts`, 27): equivalenza con la v1.10 a geni spenti (3 semi × 600 tick, impronte di `1967a47`), neutralità dei predefiniti,
registro, ereditarietà, fondatori, distanza (compresa la riduzione misurata di sqrt(13/ΣW)), migrazione e salvataggi (v1.10 sintetico, roundtrip, ripresa identica,
controllo inerte), effetti di ogni famiglia di geni (mantenimento, digestione, tetto di energia, corazza, corporatura, scatto con costo, paura, memoria, gruppo,
idoneità ambientale dai due lati, quota, stagionalità, investimento parentale, maturità, fedeltà neurale). Più `tests/animationScheduler.test.ts` e la correzione di `vibeCameraQa` (consolidamento v1.10.5).

## 3. Validazione evolutiva (protocollo di Vibe applicato in parte)
**Differenze dal protocollo:** semi 11–15 (non 1, 7, 42, 2026, 99999); mondo 256×256, 150 fondatori; campioni ogni 500 tick (non 100); a 10.000 tick solo il seme 11.
Condizioni: **baseline** = geni spenti (identica alla v1.10), **v1.11** = geni attivi, **controllo neutro** = geni presenti che ereditano e mutano ma senza effetto.

### 4.000 tick, 5 semi (baseline / v1.11 / controllo neutro)
| Seme | Popolazione | Specie mai esistite | Distanza media | Frazione erbivori |
|---|---|---|---|---|
| 11 | 194 / 378 / 555 | 3 / 2 / 1 | 0.2131 / 0.1085 / 0.1131 | 0.98 / 0.93 / 0.99 |
| 12 | 279 / 630 / 129 | 3 / 3 / 1 | 0.134 / 0.216 / 0.203 | 0.95 / 0.95 / 0.26 |
| 13 | 422 / 250 / 419 | 3 / 1 / 2 | 0.239 / 0.157 / 0.1399 | 0.99 / 0.97 / 1 |
| 14 | 820 / 737 / 1112 | 4 / 3 / 1 | 0.0795 / 0.2145 / 0.079 | 0.03 / 0.43 / 0.03 |
| 15 | 1097 / 185 / 152 | 4 / 1 / 2 | 0.125 / 0.1881 / 0.1418 | 0.91 / 0.33 / 0.2 |

Popolazione media: 562 / 436 / 473. **Nessuna estinzione in nessuna delle 15 simulazioni.** Differenze tra condizioni non significative con 5 semi.

### 10.000 tick, solo seme 11 (baseline / v1.11)
| Tick | Popolazione | Specie vive | Distanza media | Frazione erbivori |
|---|---|---|---|---|
| 0 | 150 / 150 | 1 / 1 | 0.3966 / 0.3058 | 0.67 / 0.67 |
| 1000 | 30 / 33 | 1 / 1 | 0.3494 / 0.2404 | 0.83 / 0.82 |
| 2000 | 48 / 64 | 1 / 1 | 0.2595 / 0.1719 | 0.85 / 0.91 |
| 3000 | 97 / 169 | 3 / 2 | 0.2326 / 0.1373 | 0.96 / 0.94 |
| 4000 | 194 / 378 | 3 / 2 | 0.2131 / 0.1085 | 0.98 / 0.93 |
| 5000 | 458 / 804 | 3 / 2 | 0.1461 / 0.073 | 1.0 / 0.97 |
| 6000 | 1204 / 1161 | 3 / 2 | 0.0668 / 0.0519 | 1 / 0.98 |
| 7000 | 1410 / 1293 | 3 / 2 | 0.0427 / 0.047 | 1.0 / 0.99 |
| 8000 | 1350 / 1279 | 3 / 2 | 0.0395 / 0.045 | 1 / 1.0 |
| 9000 | 1463 / 1358 | 2 / 2 | 0.0415 / 0.0394 | 1 / 1.0 |
| 10000 | 1434 / 1314 | 1 / 1 | 0.0374 / 0.039 | 1 / 1 |

Entrambe sopravvivono; in entrambe i carnivori scompaiono. Un solo seme: descrittivo, non prova.

### Criteri di accettazione di Vibe (a 4.000 tick dove non indicato)
| # | Criterio | Esito |
|---|---|---|
| 1 | Sopravvivenza ≥3/5 a 10.000 tick | **non valutabile** (10.000 tick solo sul seme 11: sopravvive); a 4.000 tick 5/5 |
| 2 | Varianza della popolazione ≤2× baseline | rapporti v1.11/baseline: 3,8 / 6,5 / 0,37 / 1,2 / 0,02 → rispettato in 3 semi su 5; **indicativo** (campioni ogni 500 tick, 9 punti) |
| 3 | Almeno il 20% di erbivori e carnivori non fissi | v1.11 5/5 (erbivori 43%–97%); la **baseline fallisce il seme 14** (3% erbivori) |
| 4 | ≥5 geni a più del 5% del range dal predefinito in ≥3/5 semi | formalmente 5/5, **ma il controllo neutro dà lo stesso 5/5** (9–14 geni): il criterio non distingue selezione da deriva e limite a zero. Differenze di segno rispetto al controllo (n = 5, rumorose): `digestiveEfficiency` (−0,035 contro +0,007), `memorySpan` (+0,036 contro −0,041), `neuralStability` (−0,033 contro +0,034) |
| 5 | Almeno una speciazione su 5 semi | sì (specie mai esistite >1 in 3 semi su 5), **ma meno che in baseline** (media 2,0 contro 3,4; controllo 1,4): effetto previsto della distanza normalizzata |
| 6 | 100% dei salvataggi v1.10 caricabili | sì sul salvataggio sintetico testato; non su salvataggi reali di Mattia |
Soglie di allarme: nessuna scattata (estinzioni, fissazione rapida <1.000 tick, distanza fuori da 0,1–0,8 nei v1.11, non-riproducibilità).

**Lettura onesta.** Nessun problema bloccante, ma anche nessuna prova di selezione sui nuovi geni: il controllo neutro mostra lo stesso spostamento medio.
Per saperlo servono più semi e più tick. La riduzione delle specie è coerente con la distanza della specifica (fattore 0,744) e va ricalibrata nella v1.12.0.

## 4. Decisioni provvisorie in attesa di Mattia (tutte in costanti nominate in `geneExpression.ts`)
ADA-02 (quota senza vegetazione di quota), ECO-01 (riduce la domanda, non il guadagno), ordine dei modulatori, tetto della corazza (2,2),
predefiniti neutri, distanza con i pesi del catalogo (soglie non toccate), costo dello scatto anche alla preda.

## 5. Problemi noti e non verificato
- Limite del campionamento della popolazione disegnata (non corretto): `docs/LIMITE-CAMPIONAMENTO-POPOLAZIONE.md`.
- Correzione del ridisegno in pausa non vista a schermo; FPS e telefono non verificati; `npm run benchmark` non eseguito.
- Nessuna UI per i geni estesi; la forma 3D non li usa. `proximity`-like effetti sono limitati dalla finestra di ricerca di `behavior.ts` (3×3 secchi da 4 celle).
- 10.000 tick solo sul seme 11; criterio 2 con campionamento rado.

## 6. Giudizio
**STABILE CON RISERVE.** Compilazione, `tsc`, 680/685 test, equivalenza con la v1.10 a geni spenti, migrazione e determinismo verificati; nessuna
soglia di allarme scattata. Riserve: fauna180 e due test di `reproduction` aperti, incoerenze della suite di Vibe da risolvere con Vibe,
decisioni provvisorie, validazione evolutiva parziale e non conclusiva sulla selezione, nessuna prova su dispositivo.
