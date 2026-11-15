# EvoWorld v1.11.0 — Report di verifica

Data dell'audit: 15 novembre 2026. Ambiente: sandbox Linux, **una sola CPU**, Node con Vitest 4.1, Next 16.3. Nessun dispositivo
fisico: tutto ciò che riguarda FPS, telefono e GPU è **non verificato**.

## 1. Riferimenti Git
| Branch | Commit | Contenuto |
|---|---|---|
| `main` | `1967a47` | non modificato |
| `preserve/post-1.10.5-head` | `1967a47` | conserva il lavoro successivo a `50c350b` (v1.10.6–1.10.10: cielo, nuvole, camera libera) |
| `consolidation/v1.10.5` | `6d20b3b` (da `50c350b`) | correzioni v1.10.5: ridisegno in pausa, test `vibeCameraQa` |
| `integration/v1.11.0` | da `1967a47`: `c5af533` (correzioni v1.10.5 portate sopra HEAD), `6f1809a` (genoma), poi documentazione/esperimenti | linea della v1.11.0 |

Perché la linea v1.11.0 parte da `1967a47` e non da `50c350b`: su `50c350b` **`tsc` fallisce** (`app/page.tsx` e
`CameraModeBar` usano la modalità `"free"` che il `Planet3DView.tsx` del pacchetto v1.10.5 non conosce: quel pacchetto
aveva sovrascritto una versione più recente del file). `1967a47` è l'albero coerente. Il lavoro successivo a `50c350b`
non è stato eliminato né modificato, salvo la correzione del ridisegno in pausa in `Planet3DView.tsx`.
**Non** gli è stata attribuita una versione definitiva.

## 2. Test e compilazione (linea `integration/v1.11.0`)
| Comando | Esito |
|---|---|
| `npm install --legacy-peer-deps` | ok (il semplice `npm install` fallisce per un bug di npm sui peer) |
| `npx tsc --noEmit` | pulito |
| `npx vitest run --testTimeout=60000` | **655 superati, 3 falliti, 658 totali** (58 file, 2 con failure) |
| `npx next build` | ok |
| `npm run benchmark` | **non eseguito** (benchmark di scala volutamente lento; una sola CPU e limite di tempo per comando) |

### Le 3 failure (nessuna è una regressione della v1.11.0)
1. `reproduction.test.ts` — 2 test. **Preesistenti**: falliscono già alla v1.10.0 (`fc381ac`), prima di ogni lavoro di
   animazione, in modo riproducibile. L'ipotesi del documento di passaggio (cella (5,5) con vegetazione 0,26) **non è stata
   verificata**.
2. `fauna180.test.ts` — sfumatura ventre-dorso (ventre atteso 1, trovato 1,08). Causa: `addBellyGradient` di `1967a47`.
   La formula con 1,08 compare l'11 nov (`60bab31`), sparisce con il pacchetto v1.10.5 (`0e04600`) e torna con `1967a47`:
   la cronologia indica una modifica fatta e riapplicata di proposito, ma **l'intenzione non è dimostrata**. Aspettativa del
   test lasciata com'è, in attesa di conferma di Mattia.

Corretti: `vibeCameraQa` "mezza virata con blend 0.5" (l'aspettativa era errata: 22,5° e non 45°; il codice era corretto).
`hydrology` passa col timeout predefinito su questa macchina.

## 3. Correzioni della v1.10.5
- **Ridisegno in pausa** (`lib/animationScheduler.ts` + `Planet3DView.tsx`): con la simulazione ferma o molto lenta le
  creature disegnate continuano a respirare e a riposare, a ~30 Hz. Nessun tick artificiale, nessun dato della simulazione
  toccato. 4 test nuovi. **Non verificato a schermo**: richiede prova manuale su telefono e PC (che la pausa mostri il
  respiro, che la ripresa sia corretta, il consumo di batteria).
- **Limite noto, non corretto**: sostituzione massiva delle creature campionate con popolazione oltre `maxCreatures`
  (misurato: 1.495 su 1.500 a ogni morte). Documento e proposta: `docs/LIMITE-CAMPIONAMENTO-POPOLAZIONE.md`.

## 4. Genoma v1.11.0 — verifiche
- **13 geni avanzati** in 8 famiglie (`docs/GENOMA-v1.11.0.md`), 34 test in `tests/advancedGenome.test.ts`: catalogo,
  neutralità, eredità, mutazione, fondatori, distanza, migrazione, salvataggi, effetti osservabili di ciascuna famiglia.
- **Equivalenza con la v1.10:** con `enableAdvancedGenome:false`, 3 semi × 600 tick (mondo 128×64, 300 fondatori) danno
  lo stesso riassunto (id, posizioni, energie, età, tratti e pesi dei cervelli) del codice di `1967a47`. Con i geni attivi
  il mondo diverge (atteso: i geni hanno effetto).
- **Salvataggi:** un salvataggio v1.10 (senza geni né schema) si carica, i 13 tratti restano identici, i geni partono neutri,
  la simulazione prosegue; salvare e ricaricare un mondo con geni dà una prosecuzione identica; la migrazione è ripetibile.
- **Distanza genetica:** senza geni avanzati identica bit per bit alla v1.10; contributo dei geni limitato a [0, 1] per
  costruzione, indipendente dal numero di geni. Soglie di compatibilità (0,16) e speciazione (0,26) **non modificate**.

## 5. Validazione evolutiva
Parametri: mondo 256×256, 150 fondatori, stessi semi per baseline (senza geni avanzati = v1.10) e v1.11.0,
`scripts/genomeExperiment.experiment.ts`, configurazione `vitest.experiment.config.ts`.

### 5.1 4.000 tick, 5 semi (completato)
| Seme | Pop. baseline | Pop. v1.11.0 | Specie vive (base / v1.11) | Distanza media (base / v1.11) | Frazione carnivori (base / v1.11) |
|---|---|---|---|---|---|
| 11 | 194 | 1142 | 3 / 3 | 0.2131 / 0.1138 | 0.015 / 0 |
| 12 | 279 | 1091 | 3 / 3 | 0.134 / 0.2436 | 0.05 / 0.005 |
| 13 | 422 | 227 | 3 / 4 | 0.239 / 0.1469 | 0.012 / 0.053 |
| 14 | 820 | 907 | 4 / 3 | 0.0795 / 0.0622 | 0.974 / 0.986 |
| 15 | 1097 | 468 | 4 / 3 | 0.125 / 0.2038 | 0.094 / 0.152 |

Popolazione media: baseline 562, v1.11.0 767. **Nessuna estinzione in nessuna delle 10 simulazioni.**
Con 5 semi e una variabilità tra semi così ampia **non si può affermare che una condizione abbia popolazioni più alte**: la
v1.11.0 è più alta in 3 semi e più bassa in 2.

Medie finali dei geni avanzati (v1.11.0), per seme (predefinito: 1; 0 per `torporCapacity`, `thermalBias`, `droughtBias`):

| Gene | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|
| `bodyDensity` | 1.019 | 0.963 | 0.967 | 1.066 | 1.054 |
| `bodyFatReserve` | 1.007 | 1.073 | 1.032 | 0.971 | 0.984 |
| `limbLength` | 0.976 | 1.009 | 1 | 1.009 | 0.921 |
| `sprintBias` | 0.951 | 0.989 | 0.993 | 0.91 | 1.013 |
| `proximitySensing` | 1.163 | 1.015 | 1.065 | 1.082 | 0.963 |
| `torporCapacity` | 0.058 | 0.021 | 0.047 | 0.006 | 0.056 |
| `digestiveEfficiency` | 1.08 | 1.023 | 1.088 | 1.06 | 1.038 |
| `thermalBias` | -0.057 | 0.022 | -0.107 | 0.039 | 0.152 |
| `droughtBias` | -0.189 | 0.16 | -0.077 | 0.186 | -0.059 |
| `meatEfficiency` | 1.059 | 1.017 | 0.902 | 0.998 | 0.972 |
| `gestationInvestment` | 1.027 | 0.992 | 1.001 | 0.908 | 1.028 |
| `maturationRate` | 1.052 | 1.014 | 1.072 | 1.087 | 1.029 |
| `memoryRetention` | 1.068 | 1.033 | 0.974 | 0.805 | 0.977 |

Gli spostamenti sono piccoli (tutti entro ±0,2 dal neutro). `digestiveEfficiency` e `maturationRate` sono sopra il
predefinito in tutti e 5 i semi, ma **senza un controllo a geni neutri non si può attribuire la deriva alla selezione**
(la media di `torporCapacity` è in parte un effetto del limite a zero dei fondatori).

### 5.2 10.000 tick — solo il seme 11 (parziale)
| Tick | Popolazione (base / v1.11) | Specie vive | Distanza media | Frazione carnivori |
|---|---|---|---|---|
| 0 | 150 / 150 | 1 / 1 | 0.3966 / 0.3997 | 0.333 / 0.333 |
| 1000 | 30 / 50 | 1 / 1 | 0.3494 / 0.2827 | 0.167 / 0.1 |
| 2000 | 48 / 103 | 1 / 1 | 0.2595 / 0.2228 | 0.146 / 0.029 |
| 3000 | 97 / 374 | 3 / 2 | 0.2326 / 0.1729 | 0.041 / 0.016 |
| 4000 | 194 / 1142 | 3 / 3 | 0.2131 / 0.1138 | 0.015 / 0 |
| 5000 | 458 / 1163 | 3 / 3 | 0.1461 / 0.1036 | 0.004 / 0 |
| 6000 | 1204 / 1289 | 3 / 3 | 0.0668 / 0.1249 | 0 / 0 |
| 7000 | 1410 / 1174 | 3 / 3 | 0.0427 / 0.175 | 0.001 / 0 |
| 8000 | 1350 / 1259 | 3 / 3 | 0.0395 / 0.2012 | 0 / 0 |
| 9000 | 1463 / 1194 | 2 / 3 | 0.0415 / 0.186 | 0 / 0 |
| 10000 | 1434 / 1158 | 1 / 3 | 0.0374 / 0.1406 | 0 / 0 |

Entrambe le condizioni sopravvivono ai 10.000 tick. In entrambe i carnivori scompaiono (frazione ≈ 0): non è un effetto dei
nuovi geni. A fine corsa la baseline ha 1 specie viva (3 mai esistite) e la v1.11.0 ne ha 3 (4 mai esistite); la diversità
media è più alta con i geni (0,14 contro 0,04), ma è **un solo seme**, e la differenza può dipendere anche dalla deriva dei
tratti di base (le due corse divergono presto). Non è una prova di effetto.

**Non completato:** i semi 12 e 13 a 10.000 tick (fermi a 2.000 tick). Con popolazioni sopra le mille creature ogni run costa
circa 8–10 minuti su questa CPU, oltre il tempo disponibile. Restano da eseguire (comando in `docs/GENOMA-v1.11.0.md`/script).

### 5.3 Cosa NON è stato valutato
Adattamento ai biomi misurato per bioma, equilibrio erbivori/carnivori a lungo termine (i carnivori si estinguono in
entrambe le condizioni), convergenza genetica con controllo neutro, compromessi evolutivi per singolo gene.

## 6. Problemi noti e non completato
- Specifica di Vibe **non ricevuta**: catalogo, matrice degli effetti e piano di test sono stati progettati qui (motivazioni nel documento del genoma).
- `proximitySensing` allarga la percezione solo entro la finestra dei secchi spaziali (≈4–8 celle): pesa per animali con vista bassa.
- Nessuna UI per i geni avanzati; la forma 3D non li usa.
- Speciazione e compatibilità vanno ricalibrate nella v1.12.0.
- Campionamento della popolazione (sezione 3).
- 2 failure di `reproduction` e `fauna180` aperte; benchmark di scala e FPS non eseguiti.
- Da fare a mano su telefono e PC: pausa visiva, fluidità, consumo, comportamento con 500/1.000/2.500 creature.

## 7. Giudizio
**STABILE CON RISERVE** (per la linea `integration/v1.11.0`): compilazione, `tsc` e 655 test su 658 verdi, nessuna
regressione introdotta dalla v1.11.0, equivalenza con la v1.10 dimostrata con i geni spenti. Riserve: failure preesistenti e
`fauna180` aperti, validazione a 10.000 tick incompleta (1 seme su 3), benchmark e prove su dispositivo non eseguiti.
