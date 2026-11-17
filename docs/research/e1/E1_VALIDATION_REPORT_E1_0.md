# E1 ÔÇö Report finale di validazione (risultati verificati)

**Data:** 2026-11-17  
**Branch:** `research/e1-ecosystem-qa` (creata da `main` @ `c35c287`, **nessun merge in main**)  
**Motore:** non modificato. Sono stati aggiunti solo `tools/e1/**`, `tests/e1/**`, `scripts/e1_ecosystem.experiment.ts` e documentazione in `docs/research/e1/**`.

---

## 1. Comandi ed esecuzioni realmente effettuate

Toolchain: Node `v22.14.0` portabile, Vitest `4.1.12`, TypeScript `5.9.3`.

### 1.1 Verifica statica e test isolati

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
Set-Location "C:\Users\matti\Documents\Progetto predefinito\Evoworld-git"

npx tsc --noEmit --incremental false
npx vitest run tests/e1/e1_metrics.test.ts
```

Risultati:

- `npx tsc --noEmit --incremental false`: **exit 0**.
- `npx vitest run tests/e1/e1_metrics.test.ts`: **6 test passati / 6**, duration ~2.46 s.

I 6 test verificano: determinismo a parit├á di seed, coerenza delle metriche con lo stato pubblico, condizioni iniziali esplicite, estinzione forzata, effetto osservabile del cull, divergenza tra seed diversi.

### 1.2 Esperimento completo

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
$env:E1_TICKS="900"
$env:E1_LONG_TICKS="2700"
$env:E1_SEEDS="11,12"
$env:E1_SAMPLE_EVERY="50"
$env:E1_OUT="C:\Users\matti\AppData\Local\Temp\opencode\e1-results.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts
```

Risultato: **Test Files 1 passed (1)**, **Tests 1 passed (1)**, duration **126.93 s** (tests **125.16 s**). Output JSON: `C:\Users\matti\AppData\Local\Temp\opencode\e1-results.json` (non committato). LÔÇÖavviso Vite su `configLoader: 'native'` / ESM in CommonJS ├¿ pre-esistente e non blocca lÔÇÖesecuzione.

**Corse:** 12 scenari ├ù 2 seed = **24**. Tick: 900 per S01ÔÇôS11, 2700 per S12, 300 (terminato prima) per S07. Campionamento ogni 50 tick. `TICKS_PER_YEAR = 400`: 900 tick Ôëê 2.25 anni simulati, 2700 tick Ôëê 6.75 anni.

---

## 2. Risultati di tutte le corse

`B/D/K` = nascite / morti / uccisioni **cumulative**. `Carn.` = frazione di organismi con `carnivory >= 0.35`. `Veg.` = vegetazione media nelle celle occupate e materializzate (indicatore parziale, vedi `E1_METRICS.md`). I valori decimali usano il punto, come nel JSON.

| Scenario | Seed | Tick | Pop 0ÔåÆf | MinÔÇôMax | Specie alive/tot | H finale | B/D/K | Carn. 0ÔåÆf | Veg. 0ÔåÆf | Extinct |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S01 baseline | 11 | 900 | 150ÔåÆ19 | 18ÔÇô150 | 1/1 | 0 | 12/97/46 | 0.3333ÔåÆ0.2105 | 0.2634ÔåÆ0.2855 | ÔÇô |
| S01 baseline | 12 | 900 | 150ÔåÆ17 | 17ÔÇô150 | 1/1 | 0 | 6/78/61 | 0.3400ÔåÆ0.4118 | 0.2266ÔåÆ0.3727 | ÔÇô |
| S02 dense scarcity | 11 | 900 | 220ÔåÆ8 | 7ÔÇô220 | 1/1 | 0 | 5/104/113 | 0.3364ÔåÆ0.2500 | 0.2691ÔåÆ0.4492 | ÔÇô |
| S02 dense scarcity | 12 | 900 | 220ÔåÆ12 | 10ÔÇô220 | 1/1 | 0 | 6/101/113 | 0.3409ÔåÆ0.4167 | 0.2379ÔåÆ0.2636 | ÔÇô |
| S03 low density | 11 | 900 | 40ÔåÆ10 | 10ÔÇô40 | 1/1 | 0 | 10/37/3 | 0.3500ÔåÆ0.0000 | 0.2619ÔåÆ0.4829 | ÔÇô |
| S03 low density | 12 | 900 | 40ÔåÆ20 | 15ÔÇô40 | 1/1 | 0 | 14/32/2 | 0.2750ÔåÆ0.2000 | 0.2237ÔåÆ0.5300 | ÔÇô |
| S04 herbivore | 11 | 900 | 150ÔåÆ27 | 27ÔÇô150 | 1/1 | 0 | 15/138/0 | 0ÔåÆ0 | 0.2634ÔåÆ0.2975 | ÔÇô |
| S04 herbivore | 12 | 900 | 150ÔåÆ45 | 41ÔÇô150 | 1/1 | 0 | 21/126/0 | 0ÔåÆ0 | 0.2266ÔåÆ0.3285 | ÔÇô |
| S05 carnivore | 11 | 900 | 150ÔåÆ18 | 18ÔÇô150 | 1/1 | 0 | 8/140/0 | 1ÔåÆ1 | 0.2634ÔåÆ0.4516 | ÔÇô |
| S05 carnivore | 12 | 900 | 150ÔåÆ31 | 27ÔÇô150 | 1/1 | 0 | 16/135/0 | 1ÔåÆ1 | 0.2266ÔåÆ0.4752 | ÔÇô |
| S06 mixed | 11 | 900 | 180ÔåÆ43 | 38ÔÇô180 | 2/2 | 0.6864 | 32/121/48 | 0.5000ÔåÆ0.5581 | 0.2651ÔåÆ0.4143 | ÔÇô |
| S06 mixed | 12 | 900 | 180ÔåÆ39 | 32ÔÇô180 | 2/2 | 0.6849 | 27/117/51 | 0.5000ÔåÆ0.5641 | 0.2388ÔåÆ0.3238 | ÔÇô |
| S07 old/weak | 11 | 2/300 | 100ÔåÆ0 | 0ÔÇô100 | 0/1 | 0 | 0/99/1 | 0.3100ÔåÆ0 | 0.2695ÔåÆn/d | 2 |
| S07 old/weak | 12 | 2/300 | 100ÔåÆ0 | 0ÔÇô100 | 0/1 | 0 | 0/96/4 | 0.2900ÔåÆ0 | 0.2119ÔåÆn/d | 2 |
| S08 cull 80% | 11 | 900 | 150ÔåÆ4 | 3ÔÇô150 | 1/1 | 0 | 5/87/46 | 0.3333ÔåÆ0.2500 | 0.2634ÔåÆ0.3947 | ÔÇô |
| S08 cull 80% | 12 | 900 | 150ÔåÆ3 | 3ÔÇô150 | 1/1 | 0 | 0/70/59 | 0.3400ÔåÆ0.3333 | 0.2266ÔåÆ0.3866 | ÔÇô |
| S09 poor habitat | 11 | 900 | 150ÔåÆ13 | 11ÔÇô150 | 1/1 | 0 | 8/80/65 | 0.3333ÔåÆ0.1538 | 0.0727ÔåÆ0.2373 | ÔÇô |
| S09 poor habitat | 12 | 900 | 150ÔåÆ9 | 9ÔÇô150 | 1/1 | 0 | 2/79/64 | 0.3400ÔåÆ0.4444 | 0.0594ÔåÆ0.3919 | ÔÇô |
| S10 rich habitat | 11 | 900 | 150ÔåÆ12 | 12ÔÇô150 | 1/1 | 0 | 8/88/58 | 0.3333ÔåÆ0.2500 | 0.4331ÔåÆ0.2976 | ÔÇô |
| S10 rich habitat | 12 | 900 | 150ÔåÆ24 | 19ÔÇô150 | 1/1 | 0 | 16/81/61 | 0.3400ÔåÆ0.3750 | 0.4226ÔåÆ0.4716 | ÔÇô |
| S11 neutral genes | 11 | 900 | 150ÔåÆ12 | 10ÔÇô150 | 1/1 | 0 | 6/92/52 | 0.3333ÔåÆ0.1667 | 0.2634ÔåÆ0.2456 | ÔÇô |
| S11 neutral genes | 12 | 900 | 150ÔåÆ25 | 23ÔÇô150 | 1/1 | 0 | 12/83/54 | 0.3400ÔåÆ0.4000 | 0.2266ÔåÆ0.4117 | ÔÇô |
| S12 long horizon | 11 | 2700 | 200ÔåÆ38 | 31ÔÇô200 | 2/2 | 0.6581 | 117/217/62 | 0.3950ÔåÆ0.5526 | 0.2680ÔåÆ0.2797 | ÔÇô |
| S12 long horizon | 12 | 2700 | 200ÔåÆ95 | 27ÔÇô200 | 1/1 | 0 | 152/190/67 | 0.3450ÔåÆ0.0105 | 0.2296ÔåÆ0.4192 | ÔÇô |

Note: in S07 la vegetazione finale ├¿ `n/d` perch├® non esistono organismi da cui campionare celle; il valore 0 presente nel JSON significa ÔÇ£nessuna cella campionataÔÇØ, non ÔÇ£vegetazione zeroÔÇØ. In S06 lÔÇÖH iniziale ├¿ 0.6931 perch├® il setup crea subito due gruppi uguali.

---

## 3. Risultati per area ecologica

### 3.1 Stabilit├á, densit├á e risorse (S01ÔÇôS03)

- **Baseline S01:** 150 ÔåÆ **19** (seed 11) e 150 ÔåÆ **17** (seed 12) in 900 tick. Nascite cumulative 12 e 6 contro 97 e 78 morti. Non si osserva un plateau stabile.
- **Scarsit├á S02:** 220 ÔåÆ **8** e **12**, con **113 uccisioni in entrambi i seed**: la densit├á elevata amplifica la predazione, non produce regolazione stabile.
- **Bassa densit├á S03:** 40 ÔåÆ **10** e **20**, con sole 10 e 14 nascite cumulative. Anche su 192├ù192 con pochi fondatori non parte una crescita sostenuta: il vincolo osservabile ├¿ la soglia energetica/riproduzione, non lo spazio.

**Conclusione verificata:** in questi semi non emerge crescita sostenibile dalle condizioni iniziali testate. Questo ├¿ un risultato negativo importante, non un difetto dellÔÇÖharness.

### 3.2 Erbivori, carnivori e predazione (S04ÔÇôS06)

- **S04 erbivori:** 150 ÔåÆ 27 e 45, **0 uccisioni** in entrambi i seed. La dinamica ├¿ guidata da mortalit├á e risorse vegetali.
- **S05 carnivori omogenei:** 150 ÔåÆ 18 e 31, **0 uccisioni**. Il codice richiede un bersaglio con carnivoria *strettamente inferiore* (`predation.ts:100-170`): se tutti sono a 0.6 non esistono prede valide. Con il cap 0.85, i carnivori di vertice sono inoltre strutturalmente immuni.
- **S06 misto:** due specie sopravvivono fino al tick 900 (H finale 0.6864 e 0.6849) con 48 e 51 uccisioni cumulative. La pressione predatoria ├¿ per├▓ **transiente**:

  | Seed | Uccisioni a t=100 | Uccisioni a t=300 | Uccisioni a t=900 |
  |---:|---:|---:|---:|
  | 11 | 36 | 45 | 48 |
  | 12 | 39 | 50 | 51 |

  Dopo il primo impulse non si osserva alcun ciclo preda-predatore sostenuto nei 900 tick.

### 3.3 Mortalit├á, estinzione e recupero (S07ÔÇôS08)

- **S07:** estinzione della popolazione al **tick 2** in entrambi i seed, con 99 e 96 morti. Il controllo di mortalit├á funziona.
- **S08 (cull dellÔÇÖ80% al tick 450):**

  | Seed | Pop a t=400 | Pop a t=450 | Pop a t=900 | Nascite cumulative | Energia media a t=900 |
  |---:|---:|---:|---:|---:|---:|
  | 11 | 26 | 5 | 4 | 5 | 97.74 |
  | 12 | 24 | 5 | 3 | 0 | 102.33 |

  Non si osserva recupero demografico nei 450 tick successivi, nonostante energia media alta. LÔÇÖipotesi pi├╣ coerente con il codice ├¿ un effetto Allee emergente (soglia energetica 130 + compagno entro raggio 4 + tentativo stocastico), ma **non ├¿ stata strumentata per prova causale**: riportiamo lÔÇÖosservazione, non la spiegazione come fatto verificato.

### 3.4 Habitat e controllo genetico (S09ÔÇôS11)

- **S09 vs S10:** la manipolazione iniziale ├¿ stata efficace: vegetazione occupata iniziale povera **0.0727 / 0.0594** contro ricca **0.4331 / 0.4226**. Tuttavia gli esiti finali non sono coerenti tra seed: seed 11 ÔåÆ povera 13, ricca 12; seed 12 ÔåÆ povera 9, ricca 24. **Non possiamo quindi affermare un effetto habitat robusto** su due soli seed.
- **S11 (geni estesi inerti) vs S01:** popolazioni finali 12/25 contro 19/17; le medie dei tratti si muovono in direzioni non coerenti tra seed (es. seed 11: `size` 1.7208 vs 1.2421, `huntingSkill` 0.2778 vs 0.3964; seed 12: `vision` 6.4152 vs 7.6493). Il cambiamento dei tratti ├¿ osservabile, ma **deriva e selezione non sono separabili** con le metriche disponibili.

### 3.5 Orizzonte lungo (S12)

| Seed | Pop 0ÔåÆf | Min | Specie finali | H finale | Carnivory medio 0ÔåÆf | Distanza genetica 0ÔåÆf | B/D/K |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 11 | 200ÔåÆ38 | 31 | 2 | 0.6581 | 0.3013ÔåÆ0.3613 | 0.3108ÔåÆ0.2481 | 117/217/62 |
| 12 | 200ÔåÆ95 | 27 | 1 | 0 | 0.2866ÔåÆ0.1389 | 0.3121ÔåÆ0.1728 | 152/190/67 |

- Seed 11: la seconda specie compare tra i campioni a t=2100 (1 specie) e t=2400 (2 specie, H 0.6237); a t=2700 H = 0.6581.
- Seed 12: non si verifica speciazione, ma si osserva una **ripresa demografica** dal minimo 27 (t=1200) a 95 (t=2700), con 152 nascite cumulative. Questa ├¿ una ripresa naturale in orizzonte lungo, **non** una ripresa dopo la perturbazione artificiale di S08.
- La divergenza genetica campionata diminuisce in entrambi i seed; il verso del cambiamento di carnivoria ├¿ opposto. Non ├¿ quindi possibile generalizzare un trend adattativo.

---

## 4. Anomalie verificate

1. **Collasso generalizzato alle densit├á iniziali alte:** tutti i run S01, S02, S04, S05, S06, S08, S09, S10, S11 partono da 150ÔÇô220 individui e finiscono tra 3 e 45.
2. **Carnivori omogenei senza prede:** S05 produce 0 uccisioni in 900 tick; la regola del bersaglio con carnivoria inferiore e il cap 0.85 rendono la caccia impossibile in monocoltura.
3. **Predazione non oscillatoria:** S06 concentra il 75ÔÇô76% delle uccisioni entro t=100 e poi cresce di sole 9ÔÇô12 unit├á in 800 tick.
4. **Recupero post-cull assente:** S08 resta a 3ÔÇô4 individui con 0ÔÇô5 nascite cumulative fino a t=900.
5. **Indicatore di risorse controintuitivo:** in diversi run la vegetazione *occupata* finale ├¿ pi├╣ alta di quella iniziale (es. S02 seed 11 0.2691ÔåÆ0.4492, S05 seed 11 0.2634ÔåÆ0.4516), mentre la popolazione crolla. Poich├® il campione segue gli organismi superstiti, questo **non dimostra** abbondanza globale: ├¿ un bias di osservazione parziale, non un nuovo meccanismo.
6. **Effetto habitat non riproducibile:** S09/S10 mostrano separazione iniziale netta ma esiti finali incoerenti tra i due seed.
7. **Speciazione seed-dipendente:** a 2700 tick solo S12 seed 11 genera una seconda specie; seed 12 resta a una.
8. **Causalit├á di morte non risolvibile:** `deaths` aggrega fame e vecchiaia; `predationKills` ├¿ un contatore separato e per tick. Nessuna distinzione ulteriore ├¿ estraibile senza toccare il motore.

---

## 5. Classificazione finale richiesta

| Dinamica | Stato verificato | Base |
|---|---|---|
| Crescita sostenibile | **Non dimostrata** in questi semi; osservata solo ripresa parziale in S12 seed 12 | S01ÔÇôS03, S12 |
| Competizione per risorse | **Implementata** nel codice (pool vegetativo condiviso), ma effetto non isolato in modo robusto dai run S09/S10 | `feeding.ts` |
| Oscillazioni preda-predatore | **Non dimostrate** | S06 |
| Estinzioni | **Implementate e osservate** | S07, `speciation.ts` |
| Adattamento nel tempo | **Cambiamento ereditario osservato**; attribuzione a selezione vs deriva **non risolta** | S11, S12 |
| Coesistenza tra specie | **Osservata** in S06 e S12 seed 11 | H Ôëê 0.69 / 0.6581 |
| Biodiversit├á | **Misurabile**; generata in 1 di 2 semi a 2700 tick | `lib/biodiversity.ts`, S12 |
| Collassi ecologici | **Osservati** in quasi tutti i run da densit├á alta | S01ÔÇôS11 |
| Recupero dopo perturbazione | **Non osservato** in S08; ripresa naturale osservata in S12 seed 12 | S08, S12 |
| Piante evolventi | **Non supportato** dal codice (`plantGenome.ts` scollegato) | audit |
| Apprendimento intra-vita | **Non supportato** (`brain.ts:29-34`) | audit |
| Disastri / perturbazioni climatiche esterne | **Non implementati** | audit |
| Selezione esplicita fitness-proportionale | **Non implementata** | audit |
| Idrologia globale source-to-sea | **Non implementata** (approssimazione locale) | `hydrology.ts` |

---

## 6. Proposte al motore ÔÇö **NON IMPLEMENTATE**

Queste sono esclusivamente proposte di QA; **nessuna ├¿ stata applicata**. Richiedono approvazione e un agente proprietario del motore.

1. **PROPOSTA:** rendere toroidali i bucket spaziali o allineare la finestra di scansione ai raggi sensoriali reali (`spatialIndex.ts`, `behavior.ts`). Oggi i vicini oltre il bordo e oltre ~6 celle non vengono visti.
2. **PROPOSTA:** clampare il costo di caccia a `min(energy, HUNT_ENERGY_COST)` per evitare energia negativa (`predation.ts:137`).
3. **PROPOSTA:** rivedere il trasferimento `target.energy + 30`, oggi non conservativo (`predation.ts:156`).
4. **PROPOSTA:** separare i contatori di morte per fame e per vecchiaia in `getStats()`, senza cambiare le regole di mortalit├á.
5. **PROPOSTA:** valutare una soglia di caccia o un meccanismo di ricerca compagno che mitighi lÔÇÖeffetto Allee osservato in S08, solo dopo un A/B controllato.
6. **PROPOSTA:** ricalibrare le soglie di distanza genetica V2 (0.16 / 0.26), oggi effettivamente pi├╣ tolleranti rispetto a V1 (`genome.ts:191-193`).
7. **PROPOSTA:** depletare in base allÔÇÖenergia realmente acquisita invece che alla domanda (`feeding.ts:230-239`).
8. **PROPOSTA:** preservare i flag sperimentali nello snapshot (`World.fromSnapshot()` li azzera, `world.ts:363-368`).
9. **PROPOSTA:** esporre un indicatore globale di vegetazione senza materializzare chunk, per rendere misurabile la disponibilit├á reale di risorse.

---

## 7. Conclusione

LÔÇÖharness E1 dimostra che il motore ├¿ deterministico e che diverse dinamiche sono **realmente implementate**: mortalit├á, estinzione, predazione con regole esplicite, competizione emergente per vegetazione, speciazione e misurazione della biodiversit├á. Allo stesso tempo, i run con seed 11 e 12 **non dimostrano** crescita sostenibile, oscillazioni preda-predatore, recupero dopo cull o un effetto habitat riproducibile; la speciazione compare solo in un semi a 2700 tick. Il valore di questo report ├¿ proprio aver separato ci├▓ che il codice sa fare da ci├▓ che finora era solo narrato come possibile.
