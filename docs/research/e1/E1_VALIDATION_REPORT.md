# E1 — Report finale di validazione (risultati verificati, E1.1)

**Data:** 2026-11-17  
**Branch:** `research/e1-ecosystem-qa` (creata da `main` @ `c35c287`, aggiornata con **rebase** su `main` @ `db86444`, **nessun merge in main**)  
**Motore:** non modificato. Sono stati aggiunti solo `tools/e1/**`, `tests/e1/**`, `scripts/e1_ecosystem.experiment.ts` e documentazione in `docs/research/e1/**`.

> I numeri di questo report provengono da una **nuova esecuzione reale dopo le correzioni E1.1**. I risultati del vecchio report (vegetazione mediata per organismo) sono superati e non vengono più presentati come finali.

---

## 1. Comandi ed esecuzioni realmente effettuate

Toolchain: Node `v22.14.0` portabile, Vitest `4.1.12`, TypeScript `5.9.3`, Next.js `16.3.0`.

### 1.1 Verifica statica e test isolati

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
Set-Location "C:\Users\matti\Documents\Progetto predefinito\Evoworld-git"

npx tsc --noEmit --incremental false
npx vitest run tests/e1/e1_metrics.test.ts
```

Risultati:

- `npx tsc --noEmit --incremental false`: **exit 0**.
- `npx vitest run tests/e1/e1_metrics.test.ts`: **11 test passati / 11**, duration **2.85 s**.

gli 11 test verificano: determinismo a parità di seed, coerenza delle metriche con lo stato pubblico, deduplicazione della vegetazione per cella geografica, campione vuoto senza vegetazione inventata, condizioni iniziali esplicite, estinzione forzata, conservazione S08 di `advancedGenome`/`geneEffects` prima e dopo `World.fromSnapshot()`, continuità dei contatori cumulativi attraverso la perturbazione, effetto osservabile del cull, divergenza tra seed diversi, portabilità del percorso di output.

### 1.2 Esperimento completo

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
$env:E1_TICKS="900"
$env:E1_LONG_TICKS="2700"
$env:E1_SEEDS="11,12"
$env:E1_SAMPLE_EVERY="50"
$env:E1_OUT="C:\Users\matti\AppData\Local\Temp\e1-results-e1.1.json"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts
```

Risultato: **Test Files 1 passed (1)**, **Tests 1 passed (1)**, duration **134.88 s** (tests **133.16 s**). Output JSON: `C:\Users\matti\AppData\Local\Temp\e1-results-e1.1.json` (non committato). L’avviso Vite su `configLoader: 'native'` / ESM in CommonJS è pre-esistente e non blocca l’esecuzione.

**Corse:** 12 scenari × 2 seed = **24**. Tick: 900 per S01–S11, 2700 per S12, 300 (terminato al tick 2) per S07. Campionamento ogni 50 tick. `TICKS_PER_YEAR = 400`: 900 tick ≈ 2.25 anni simulati, 2700 tick ≈ 6.75 anni.

### 1.3 Build e suite completa (distinzione errori preesistenti)

```powershell
npx next build
npx vitest run
```

Risultati reali:

- `npx next build`: **exit 0** (compilazione e TypeScript OK, 3 pagine statiche generate).
- Suite completa sul branch E1.1: **715 passati / 10 falliti / 1 skipped** (63 file), in due esecuzioni ripetute.
- Suite completa su worktree pulito di `origin/main` @ `db86444`: **705–706 passati / 8–9 falliti / 1 skipped** (62 file), in due esecuzioni ripetute.
- I fallimenti stabili sono gli stessi su branch e `main`: `fauna180`, `hydrology`, `planet` (1 o 2 test a seconda della corsa), `reproduction` (2 test), `vibeGenomeV1110` (3 test). Sono quindi **preesistenti** e non introdotti da E1.
- L’unico fallimento aggiuntivo del branch (`settlementDefaults`, timeout di 5000 ms in `a restored World resumes with the same defaults as a fresh one`) è **dipendente dal carico**: eseguito da solo passa **4/4** sia sul branch sia su `main`. Non è una differenza deterministica introdotta da E1.
- E1 non tocca `simulation/**`, genetica, mutazioni, ereditarietà, selezione, renderer, G1/G1-b, G2 o formati di salvataggio.

---

## 2. Risultati di tutte le corse

`B/D/K` = nascite / morti / uccisioni **cumulative**. `Carn.` = frazione di organismi con `carnivory >= 0.35`. `Veg.` = vegetazione media sulle **celle geografiche distinte** occupate (indicatore parziale, vedi `E1_METRICS.md`). `Org.` = organismi campionati; `Celle` = celle distinte campionate. I valori decimali usano il punto, come nel JSON.

| Scenario | Seed | Tick | Pop 0→f | Min–Max | Specie alive/tot | H finale | B/D/K | Carn. 0→f | Veg. 0→f | Org. 0→f | Celle 0→f | Extinct |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S01 baseline | 11 | 900 | 150→19 | 18–150 | 1/1 | 0.0000 | 12/97/46 | 0.3333→0.2105 | 0.2632→0.2806 | 150→19 | 149→18 | – |
| S01 baseline | 12 | 900 | 150→17 | 17–150 | 1/1 | 0.0000 | 6/78/61 | 0.3400→0.4118 | 0.2275→0.3727 | 150→17 | 149→17 | – |
| S02 dense scarcity | 11 | 900 | 220→8 | 7–220 | 1/1 | 0.0000 | 5/104/113 | 0.3364→0.2500 | 0.2678→0.4960 | 220→8 | 215→7 | – |
| S02 dense scarcity | 12 | 900 | 220→12 | 10–220 | 1/1 | 0.0000 | 6/101/113 | 0.3409→0.4167 | 0.2388→0.2876 | 220→12 | 213→11 | – |
| S03 low density | 11 | 900 | 40→10 | 10–40 | 1/1 | 0.0000 | 10/37/3 | 0.3500→0.0000 | 0.2619→0.4829 | 40→10 | 40→10 | – |
| S03 low density | 12 | 900 | 40→20 | 15–40 | 1/1 | 0.0000 | 14/32/2 | 0.2750→0.2000 | 0.2237→0.5300 | 40→20 | 40→20 | – |
| S04 herbivore | 11 | 900 | 150→27 | 27–150 | 1/1 | 0.0000 | 15/138/0 | 0.0000→0.0000 | 0.2632→0.2901 | 150→27 | 149→26 | – |
| S04 herbivore | 12 | 900 | 150→45 | 41–150 | 1/1 | 0.0000 | 21/126/0 | 0.0000→0.0000 | 0.2275→0.3220 | 150→45 | 149→44 | – |
| S05 carnivore | 11 | 900 | 150→18 | 18–150 | 1/1 | 0.0000 | 8/140/0 | 1.0000→1.0000 | 0.2632→0.4516 | 150→18 | 149→18 | – |
| S05 carnivore | 12 | 900 | 150→31 | 27–150 | 1/1 | 0.0000 | 16/135/0 | 1.0000→1.0000 | 0.2275→0.4659 | 150→31 | 149→30 | – |
| S06 mixed | 11 | 900 | 180→43 | 38–180 | 2/2 | 0.6864 | 32/121/48 | 0.5000→0.5581 | 0.2651→0.4143 | 180→43 | 180→43 | – |
| S06 mixed | 12 | 900 | 180→39 | 32–180 | 2/2 | 0.6849 | 27/117/51 | 0.5000→0.5641 | 0.2388→0.3351 | 180→39 | 180→37 | – |
| S07 old/weak | 11 | 2/300 | 100→0 | 0–100 | 0/1 | 0.0000 | 0/99/1 | 0.3100→0.0000 | 0.2715→0.0000 | 100→0 | 99→0 | 2 |
| S07 old/weak | 12 | 2/300 | 100→0 | 0–100 | 0/1 | 0.0000 | 0/96/4 | 0.2900→0.0000 | 0.2119→0.0000 | 100→0 | 100→0 | 2 |
| S08 cull 80% | 11 | 900 | 150→4 | 3–150 | 1/1 | 0.0000 | 5/87/46 | 0.3333→0.2500 | 0.2632→0.3947 | 150→4 | 149→4 | – |
| S08 cull 80% | 12 | 900 | 150→3 | 3–150 | 1/1 | 0.0000 | 0/70/59 | 0.3400→0.3333 | 0.2275→0.3866 | 150→3 | 149→3 | – |
| S09 poor habitat | 11 | 900 | 150→13 | 11–150 | 1/1 | 0.0000 | 8/80/65 | 0.3333→0.1538 | 0.0735→0.2373 | 150→13 | 24→13 | – |
| S09 poor habitat | 12 | 900 | 150→9 | 9–150 | 1/1 | 0.0000 | 2/79/64 | 0.3400→0.4444 | 0.0600→0.3919 | 150→9 | 24→9 | – |
| S10 rich habitat | 11 | 900 | 150→12 | 12–150 | 1/1 | 0.0000 | 8/88/58 | 0.3333→0.2500 | 0.4330→0.2976 | 150→12 | 24→12 | – |
| S10 rich habitat | 12 | 900 | 150→24 | 19–150 | 1/1 | 0.0000 | 16/81/61 | 0.3400→0.3750 | 0.4222→0.4840 | 150→24 | 24→23 | – |
| S11 neutral genes | 11 | 900 | 150→12 | 10–150 | 1/1 | 0.0000 | 6/92/52 | 0.3333→0.1667 | 0.2632→0.2189 | 150→12 | 149→10 | – |
| S11 neutral genes | 12 | 900 | 150→25 | 23–150 | 1/1 | 0.0000 | 12/83/54 | 0.3400→0.4000 | 0.2275→0.4178 | 150→25 | 149→24 | – |
| S12 long horizon | 11 | 2700 | 200→38 | 31–200 | 2/2 | 0.6581 | 117/217/62 | 0.3950→0.5526 | 0.2680→0.2853 | 200→38 | 200→37 | – |
| S12 long horizon | 12 | 2700 | 200→95 | 27–200 | 1/1 | 0.0000 | 152/190/67 | 0.3450→0.0105 | 0.2296→0.4202 | 200→95 | 200→94 | – |

Note: in S07 la vegetazione finale è `0.0000` con `Celle 0→0`: significa **nessuna cella campionata**, non “vegetazione zero misurata”. In S06 l’H iniziale è 0.6931 perché il setup crea subito due gruppi uguali. In S09/S10 `Celle 0→24` riflette il posizionamento iniziale su 24 celle distinte, mentre `Org. 0→150` conta tutti i fondatori.

---

## 3. Risultati per area ecologica

### 3.1 Stabilità, densità e risorse (S01–S03)

- **Baseline S01:** 150 → **19** (seed 11) e 150 → **17** (seed 12) in 900 tick. Nascite cumulative 12 e 6 contro 97 e 78 morti. Non si osserva un plateau stabile.
- **Scarsità S02:** 220 → **8** e **12**, con **113 uccisioni in entrambi i seed**: la densità elevata amplifica la predazione, non produce regolazione stabile.
- **Bassa densità S03:** 40 → **10** e **20**, con sole 10 e 14 nascite cumulative. Anche su 192×192 con pochi fondatori non parte una crescita sostenuta: il vincolo osservabile è la soglia energetica/riproduzione, non lo spazio.

**Conclusione verificata:** in questi semi non emerge crescita sostenibile dalle condizioni iniziali testate. Questo è un risultato negativo importante, non un difetto dell’harness.

### 3.2 Erbivori, carnivori e predazione (S04–S06)

- **S04 erbivori:** 150 → 27 e 45, **0 uccisioni** in entrambi i seed. La dinamica è guidata da mortalità e risorse vegetali.
- **S05 carnivori omogenei:** 150 → 18 e 31, **0 uccisioni**. Il codice richiede un bersaglio con carnivoria *strettamente inferiore* (`predation.ts:100-170`): se tutti sono a 0.6 non esistono prede valide. Con il cap 0.85, i carnivori di vertice sono inoltre strutturalmente immuni.
- **S06 misto:** due specie sopravvivono fino al tick 900 (H finale 0.6864 e 0.6849) con 48 e 51 uccisioni cumulative. La pressione predatoria è **transiente**:

  | Seed | Uccisioni a t=100 | Uccisioni a t=300 | Uccisioni a t=900 |
  |---:|---:|---:|---:|
  | 11 | 36 | 45 | 48 |
  | 12 | 39 | 50 | 51 |

  Dopo il primo impulse non si osserva alcun ciclo preda-predatore sostenuto nei 900 tick.

### 3.3 Mortalità, estinzione e recupero (S07–S08)

- **S07:** estinzione della popolazione al **tick 2** in entrambi i seed, con 99 e 96 morti. Il controllo di mortalità funziona.
- **S08 (cull dell’80% al tick 450):**

  | Seed | Pop a t=400 | Pop a t=450 | Pop a t=900 | Nascite cumulative | Energia media a t=900 | Celle distinte a t=450 |
  |---:|---:|---:|---:|---:|---:|---:|
  | 11 | 26 | 5 | 4 | 5 | 97.74 | 5 |
  | 12 | 24 | 5 | 3 | 0 | 102.33 | 5 |

  Non si osserva recupero demografico nei 450 tick successivi, nonostante energia media alta. L’ipotesi più coerente con il codice è un effetto Allee emergente (soglia energetica 130 + compagno entro raggio 4 + tentativo stocastico), ma **non è stata strumentata per prova causale**: riportiamo l’osservazione, non la spiegazione come fatto verificato. Il test E1.1 conferma che il cull non cancella eventi del tick né contatori cumulativi e non altera le opzioni snapshot.

### 3.4 Habitat e controllo genetico (S09–S11)

- **S09 vs S10:** la manipolazione iniziale è stata efficace: vegetazione occupata iniziale povera **0.0735 / 0.0600** contro ricca **0.4330 / 0.4222**. Tuttavia gli esiti finali non sono coerenti tra seed: seed 11 → povera 13, ricca 12; seed 12 → povera 9, ricca 24. **Non possiamo quindi affermare un effetto habitat robusto** su due soli seed.
- **S11 (geni estesi inerti) vs S01:** popolazioni finali 12/25 contro 19/17; le medie dei tratti si muovono in direzioni non coerenti tra seed (es. seed 11: `size` 1.5902→1.7208 vs S01 1.5902→1.2421; `huntingSkill` 0.3889→0.2778 vs 0.3889→0.3964; seed 12: `vision` 7.9463→6.4152 vs 7.9463→7.6493). Il cambiamento dei tratti è osservabile, ma **deriva e selezione non sono separabili** con le metriche disponibili.

### 3.5 Orizzonte lungo (S12)

| Seed | Pop 0→f | Min | Specie finali | H finale | Carnivory medio 0→f | Distanza genetica 0→f | B/D/K |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 11 | 200→38 | 31 | 2 | 0.6581 | 0.3013→0.3613 | 0.3108→0.2481 | 117/217/62 |
| 12 | 200→95 | 27 | 1 | 0 | 0.2866→0.1389 | 0.3121→0.1728 | 152/190/67 |

- Seed 11: la seconda specie compare tra i campioni a t=2100 (1 specie) e t=2400 (2 specie, H 0.6237); a t=2700 H = 0.6581.
- Seed 12: non si verifica speciazione, ma si osserva una **ripresa demografica** dal minimo 27 (t=1200) a 95 (t=2700), con 152 nascite cumulative. Questa è una ripresa naturale in orizzonte lungo, **non** una ripresa dopo la perturbazione artificiale di S08.
- La divergenza genetica campionata diminuisce in entrambi i seed; il verso del cambiamento di carnivoria è opposto. Non è quindi possibile generalizzare un trend adattativo.

---

## 4. Anomalie verificate

1. **Collasso generalizzato alle densità iniziali alte:** tutti i run S01, S02, S04, S05, S06, S08, S09, S10, S11 partono da 150–220 individui e finiscono tra 3 e 45.
2. **Carnivori omogenei senza prede:** S05 produce 0 uccisioni in 900 tick; la regola del bersaglio con carnivoria inferiore e il cap 0.85 rendono la caccia impossibile in monocoltura.
3. **Predazione non oscillatoria:** S06 concentra il 75–76% delle uccisioni entro t=100 e poi cresce di sole 12 unità in 800 tick.
4. **Recupero post-cull assente:** S08 resta a 3–4 individui con 0–5 nascite cumulative fino a t=900.
5. **Indicatore di risorse controintuitivo:** in diversi run la vegetazione *occupata* finale è più alta di quella iniziale (es. S02 seed 11 0.2678→0.4960, S05 seed 11 0.2632→0.4516), mentre la popolazione crolla. Poiché il campione segue gli organismi superstiti, questo **non dimostra** abbondanza globale: è un bias di osservazione parziale, non un nuovo meccanismo. E1.1 ha corretto la media sulle celle distinte, eliminando il peso doppio degli organismi co-locati.
6. **Effetto habitat non riproducibile:** S09/S10 mostrano separazione iniziale netta ma esiti finali incoerenti tra i due seed.
7. **Speciazione seed-dipendente:** a 2700 tick solo S12 seed 11 genera una seconda specie; seed 12 resta a una.
8. **Causalità di morte non risolvibile:** `deaths` aggrega fame e vecchiaia; `predationKills` è un contatore separato e per tick. Nessuna distinzione ulteriore è estraibile senza toccare il motore.

---

## 5. Classificazione finale richiesta

| Dinamica | Stato verificato | Base |
|---|---|---|
| Crescita sostenibile | **Non dimostrata** in questi semi; osservata solo ripresa parziale in S12 seed 12 | S01–S03, S12 |
| Competizione per risorse | **Implementata** nel codice (pool vegetativo condiviso), ma effetto non isolato in modo robusto dai run S09/S10 | `feeding.ts` |
| Oscillazioni preda-predatore | **Non dimostrate** | S06 |
| Estinzioni | **Implementate e osservate** | S07, `speciation.ts` |
| Adattamento nel tempo | **Cambiamento ereditario osservato**; attribuzione a selezione vs deriva **non risolta** | S11, S12 |
| Coesistenza tra specie | **Osservata** in S06 e S12 seed 11 | H ≈ 0.69 / 0.6581 |
| Biodiversità | **Misurabile**; generata in 1 di 2 semi a 2700 tick | `lib/biodiversity.ts`, S12 |
| Collassi ecologici | **Osservati** in quasi tutti i run da densità alta | S01–S11 |
| Recupero dopo perturbazione | **Non osservato** in S08; ripresa naturale osservata in S12 seed 12 | S08, S12 |
| Piante evolventi | **Non supportato** dal codice (`plantGenome.ts` scollegato) | audit |
| Apprendimento intra-vita | **Non supportato** (`brain.ts:29-34`) | audit |
| Disastri / perturbazioni climatiche esterne | **Non implementati** | audit |
| Selezione esplicita fitness-proportionale | **Non implementata** | audit |
| Idrologia globale source-to-sea | **Non implementata** (approssimazione locale) | `hydrology.ts` |

---

## 6. Proposte al motore — **NON IMPLEMENTATE**

Queste sono esclusivamente proposte di QA; **nessuna è stata applicata**. Richiedono approvazione e un agente proprietario del motore.

1. **PROPOSTA:** rendere toroidali i bucket spaziali o allineare la finestra di scansione ai raggi sensoriali reali (`spatialIndex.ts`, `behavior.ts`). Oggi i vicini oltre il bordo e oltre ~6 celle non vengono visti.
2. **PROPOSTA:** clampare il costo di caccia a `min(energy, HUNT_ENERGY_COST)` per evitare energia negativa (`predation.ts:137`).
3. **PROPOSTA:** rivedere il trasferimento `target.energy + 30`, oggi non conservativo (`predation.ts:156`).
4. **PROPOSTA:** separare i contatori di morte per fame e per vecchiaia in `getStats()`, senza cambiare le regole di mortalità.
5. **PROPOSTA:** valutare una soglia di caccia o un meccanismo di ricerca compagno che mitighi l’effetto Allee osservato in S08, solo dopo un A/B controllato.
6. **PROPOSTA:** ricalibrare le soglie di distanza genetica V2 (0.16 / 0.26), oggi effettivamente più tolleranti rispetto a V1 (`genome.ts:191-193`).
7. **PROPOSTA:** depletare in base all’energia realmente acquisita invece che alla domanda (`feeding.ts:230-239`).
8. **PROPOSTA:** preservare anche gli altri flag sperimentali nello snapshot (`World.fromSnapshot()` azzera dispersal/settlement e collisions, `world.ts:363-368`). E1.1 **non** modifica il motore: l’harness verifica solo `advancedGenome`/`geneEffects`, le due opzioni che E1 usa.
9. **PROPOSTA:** esporre un indicatore globale di vegetazione senza materializzare chunk, per rendere misurabile la disponibilità reale di risorse.

---

## 7. Conclusione

L’harness E1, dopo l’hardening E1.1, dimostra che il motore è deterministico e che diverse dinamiche sono **realmente implementate**: mortalità, estinzione, predazione con regole esplicite, competizione emergente per vegetazione, speciazione e misurazione della biodiversità. Allo stesso tempo, i run con seed 11 e 12 **non dimostrano** crescita sostenibile, oscillazioni preda-predatore, recupero dopo cull o un effetto habitat riproducibile; la speciazione compare solo in un semi a 2700 tick. La vegetazione è ora mediata su celle geografiche distinte e organismi/celle sono riportati separatamente; la perturbazione S08 conserva opzioni snapshot, eventi per tick e contatori cumulativi. Il valore di questo report è proprio aver separato ciò che il codice sa fare da ciò che finora era solo narrato come possibile.
