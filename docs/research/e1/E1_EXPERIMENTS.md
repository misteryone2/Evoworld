# E1 — Scenari sperimentali riproducibili

Tutti gli scenari usano `tools/e1/runner.ts`, `World.step()` e seed espliciti. La fase E1.0/E1.1 usa `scripts/e1_ecosystem.experiment.ts` con **`E1_TICKS`, `E1_LONG_TICKS`, `E1_SEEDS`, `E1_SAMPLE_EVERY`**; la fase E1.2 usa `scripts/e1_ecosystem.phase2.experiment.ts` con **`E1_PHASE2_SEEDS`, `E1_PHASE2_TICKS`, `E1_PHASE2_SAMPLE_EVERY`, `E1_PHASE2_OUT`**. Ogni scenario dichiara dimensioni del mondo, popolazione iniziale e condizioni iniziali. Nessuna regola biologica viene modificata: le condizioni iniziali sono scritte nello snapshot prima del primo step; la perturbazione S08 è una rimozione esplicita di organismi a un tick stabilito, con selezione deterministica stratificata per specie.

> `TICKS_PER_YEAR = 400`: 900 tick ≈ 2.25 anni simulati; 2700 tick ≈ 6.75 anni.

## Variabili monitorate in tutti gli scenari

`population` (post-perturbazione), `populationAtStart`/`populationAfterStep`, `perturbationRemoved`/`perturbationKept`, `speciesAlive/TotalEver/Extinct`, `speciesCounts`, Shannon `H` e evenness, `births/deaths/predationKills` per tick e cumulativi, tassi per capita con denominatore pre-perturbazione, `meanEnergy`, `meanAge`, frazione carnivori/erbivori, medie dei tratti ereditari, vegetazione media nelle **celle geografiche distinte** (`organismsSampled` vs `occupiedCellsSampled`), distanza genetica su coppie uniche con copertura dichiarata. Definizioni in `E1_METRICS.md`.

---

## S01 — Stabilità, baseline

- **Condizioni iniziali:** seed 11/12; mondo 128×128; 150 fondatori; advanced genome attivi; nessuna perturbazione.
- **Variabili:** popolazione, nascite/morti, energia media, vegetazione occupata, tratti.
- **Durata:** 900 tick (campione ogni 50).
- **Risultato atteso (teorico):** popolazione che si assesta su un plateau sostenuto senza estinzione.
- **Indicatori di anomalia:** calo monotonico, nascite ≈ 0, estinzione prima del termine.
- **Criterio di successo:** sopravvivenza + nascite cumulative > 0 + popolazione finale ≥ 20% dell’iniziale.

## S02 — Scarsità / alta densità

- **Condizioni:** seed 11/12; 64×64; 220 fondatori (alta densità su area piccola).
- **Variabili:** popolazione, vegetazione occupata, mortalità, predazione.
- **Durata:** 900 tick.
- **Atteso:** forte competizione, depletion della vegetazione, successiva regolazione denso-dipendente o collasso.
- **Anomalia:** crescita illimitata; vegetazione che non si riprende dopo il calo.
- **Successo:** osservare un feedback misurabile tra densità e vegetazione, anche se il risultato è il collasso.

## S03 — Risorse abbondanti, bassa densità

- **Condizioni:** seed 11/12; 192×192; 40 fondatori.
- **Variabili:** popolazione, nascite, energia media.
- **Durata:** 900 tick.
- **Atteso:** crescita verso la capacità sostenibile, poi plateau.
- **Anomalia:** declino nonostante vegetazione disponibile; crescita senza limite.
- **Successo:** traiettoria di crescita osservabile o documento del motivo per cui non parte (soglia energetica / compagno).

## S04 — Monocoltura erbivora

- **Condizioni:** tutti i fondatori con `carnivory = 0.05`; 128×128; 150.
- **Variabili:** popolazione, vegetazione, nascite, `predationKills` (atteso 0).
- **Durata:** 900 tick.
- **Atteso:** competizione vegetativa senza predazione.
- **Anomalia:** predazione > 0; incremento di carnivoria senza pressione selettiva.
- **Successo:** `predationKills = 0` e dinamica guidata solo da risorse/mortalità.

## S05 — Stress carnivoro

- **Condizioni:** tutti i fondatori con `carnivory = 0.6`; 128×128; 150.
- **Variabili:** popolazione, uccisioni, energia.
- **Durata:** 900 tick.
- **Atteso:** pressione predatoria interna, selezione su evasione/abilità venatoria, possibile collasso.
- **Anomalia:** zero uccisioni per omogeneità di carnivoria; sopravvivenza indefinita senza prede.
- **Successo:** misurare se la regola “bersaglio con carnivoria strettamente minore” produce caccia in una popolazione omogenea.

## S06 — Predatore–preda misto

- **Condizioni:** 180 fondatori divisi a metà: `carnivory = 0.05` (specie 1) e `0.6` (specie 2); 160×160.
- **Variabili:** popolazione per specie, frazione carnivori, uccisioni cumulative, Shannon, energia.
- **Durata:** 900 tick.
- **Atteso:** oscillazioni preda-predatore o almeno pressione predatoria prolungata.
- **Anomalia:** uccisioni concentrate nei primi tick; estinzione di una specie senza recupero.
- **Successo:** coesistenza di due specie + uccisioni distribuite sull’orizzonte temporale.

## S07 — Estinzione forzata (controllo mortalità)

- **Condizioni:** 100 fondatori con energia 3 ed età = lifespan−1; 96×96.
- **Variabili:** tempo fino a popolazione 0, decessi.
- **Durata:** 300 tick (termina prima se estinta).
- **Atteso:** estinzione in pochi tick per energia ≤ 0 / vecchiaia.
- **Anomalia:** sopravvivenza oltre pochi tick; nascite da individui morenti.
- **Successo:** `extinctAt` definito e piccolo; registry aggiornato a specie estinta.

## S08 — Recupero dopo perturbazione (cull 80%)

- **Condizioni:** baseline 128×128/150; rimozione dell’80% degli organismi al tick 450 (900/2), senza RNG e senza cambi di regole.
- **Variabili:** popolazione prima/dopo, nascite cumulative, energia media.
- **Durata:** 900 tick.
- **Atteso:** recupero demografico se risorse e compagni sono disponibili.
- **Anomalia:** popolazione che resta bloccata a pochi individui; nascite nulle nonostante energia media alta.
- **Successo:** popolazione dopo il cull che torna a crescere in modo significativo entro 450 tick.
- **Controllo E1.1:** il runner verifica che `advancedGenome`/`geneEffects` sopravvivano a `World.fromSnapshot()` e conserva gli eventi del tick e i contatori cumulativi fuori dal `World` ricostruito; il cull non altera quindi le misure del tick 450.
- **Controllo E1.2:** la selezione non usa più l’indice dell’array ma `hash32(tick, speciesId, id)` con quota per specie; il report dichiara rimossi/conservati totali e per specie, e i tassi del tick usano la popolazione pre-cull.

## S09 — Habitat povero

- **Condizioni:** 150 fondatori riposizionati nelle 24 celle con vegetazione baseline più bassa **nella griglia campionata** (non ocean, `globalExtremesClaimed: false`); 128×128.
- **Variabili:** vegetazione occupata, energia, popolazione, mortalità.
- **Durata:** 900 tick.
- **Atteso:** minore guadagno energetico e maggiore declino rispetto a S10.
- **Anomalia:** nessuna differenza misurabile da S10.
- **Successo:** divergenza osservabile delle traiettorie S09 vs S10.

## S10 — Habitat ricco

- **Condizioni:** come S09 ma nelle 24 celle con vegetazione baseline più alta della stessa griglia campionata.
- **Variabili:** come S09.
- **Durata:** 900 tick.
- **Atteso:** crescita o sopravvivenza maggiore rispetto a S09.
- **Anomalia:** vegetazione iniziale alta che non si traduce in energia/crescita.
- **Successo:** differenza misurabile e coerente con il guadagno vegetativo.

## S11 — Controllo neutrale dei geni estesi

- **Condizioni:** come S01 ma `enableGeneEffects: false` (geni presenti ma inerti sul fenotipo); 128×128/150.
- **Variabili:** tratti ereditari, popolazione, divergenza genetica.
- **Durata:** 900 tick.
- **Atteso:** separare la deriva rispetto a S01; se i tratti cambiano ugualmente, il cambiamento non è attribuibile agli effetti dei geni estesi.
- **Anomalia:** differenze deterministiche attribuibili a effetti disattivati.
- **Successo:** confronto S01 vs S11 che quantifichi deriva vs effetto fenotipico.

## S12 — Orizzonte lungo (speciazione e adattamento)

- **Condizioni:** 192×192; 200 fondatori; seed 11/12.
- **Variabili:** `speciesTotalEver`, Shannon, distanza genetica, medie dei tratti, popolazione.
- **Durata:** 2700 tick ≈ 6.75 anni simulati (controllo speciazione ogni 200 tick).
- **Atteso:** eventuale speciazione e variazione ereditaria misurabile; non garantita.
- **Anomalia:** speciazione in ogni seed indipendentemente da geografia/genetica; oppure nessuna variazione.
- **Successo:** almeno un evento documentato oppure conclusione esplicita “non osservato in questi semi”; mai inferito.

## S13 — Controllo habitat: posizione povera, risorse ricche

- **Condizioni:** stesse posizioni campionate di S09, ma vegetazione iniziale sovrascritta con i valori della griglia ricca di S10 (stessi indici di selezione); 128×128/150.
- **Variabili:** come S09/S10, più `setupInfo.habitat.resourceCells`.
- **Durata:** 900 tick.
- **Atteso:** isola l’effetto della risorsa a parità di posizione.
- **Successo:** differenza misurabile S13 vs S09 e confronto 2×2 con S10/S14.

## S14 — Controllo habitat: posizione ricca, risorse povere

- **Condizioni:** stesse posizioni campionate di S10, ma vegetazione iniziale sovrascritta con i valori della griglia povera di S09.
- **Variabili:** come S13.
- **Durata:** 900 tick.
- **Atteso:** isola l’effetto della posizione a parità di vegetazione iniziale.
- **Successo:** differenza misurabile S14 vs S10 e confronti incrociati con S09/S13.

---

## Esecuzione

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
$env:E1_TICKS="900"; $env:E1_LONG_TICKS="2700"; $env:E1_SEEDS="11,12"; $env:E1_SAMPLE_EVERY="50"
# facoltativo; senza E1_OUT lo script scrive e1-results.json nella temp di sistema (os.tmpdir())
$env:E1_OUT="C:\Users\matti\AppData\Local\Temp\e1-results-e1.1.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts
```

Per eseguire un solo scenario della fase 1: `E1_SCENARIOS=S06_predator_prey_mixed`. L’output JSON contiene per ogni run: seed, condizioni, tick completati, `extinctAt`, tempo di esecuzione e l’intera serie di campioni. Il percorso predefinito è portabile (`join(tmpdir(), "e1-results.json")`); `E1_OUT` continua a sovrascriverlo.

### Fase E1.2 — protocollo multi-seed

```powershell
$env:E1_PHASE2_SEEDS="1,2,3,4,5,6,7,8,9,10,11,12"
$env:E1_PHASE2_TICKS="900"; $env:E1_PHASE2_SAMPLE_EVERY="50"
$env:E1_PHASE2_OUT="C:\Users\matti\AppData\Local\Temp\e1-phase2-results.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts
```

Il protocollo esegue 12 seed × 7 scenari (S01, S06, S08, S09, S10, S13, S14) = 84 corse. L’output JSON separa `scientificReport` (senza tempi), `results` (senza `elapsedMs`) e `timing`. Il report contiene media, deviazione standard campionaria, min/max, IC95 con t di Student, distribuzione delle popolazioni finali, tasso di estinzione, frequenza di speciazione, confronto habitat 2×2 e confronto con/senza perturbazione. I percorsi sono risolti da `tools/e1/experiment.ts`; `E1_PHASE2_OUT` / `E1_OUT` sovrascrivono il predefinito portabile.
