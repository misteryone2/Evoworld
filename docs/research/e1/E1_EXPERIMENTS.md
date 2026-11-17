# E1 — Scenari sperimentali riproducibili

Tutti gli scenari usano `tools/e1/runner.ts` + `scripts/e1_ecosystem.experiment.ts`, `World.step()` e seed espliciti. **`E1_TICKS`, `E1_LONG_TICKS`, `E1_SEEDS`, `E1_SAMPLE_EVERY` controllano durata e repliche**; ogni scenario dichiara dimensioni del mondo, popolazione iniziale e condizioni iniziali. Nessuna regola biologica viene modificata: le condizioni iniziali sono scritte nello snapshot prima del primo step; la perturbazione S08 è una rimozione esplicita di organismi a un tick stabilito.

> `TICKS_PER_YEAR = 400`: 900 tick ≈ 2.25 anni simulati; 2700 tick ≈ 6.75 anni.

## Variabili monitorate in tutti gli scenari

`population`, `speciesAlive/TotalEver/Extinct`, `speciesCounts`, Shannon `H` e evenness, `births/deaths/predationKills` per tick e cumulativi, tassi per capita, `meanEnergy`, `meanAge`, frazione carnivori/erbivori, medie dei tratti ereditari (carnivory, size, speed, metabolism, vision, evasion, huntingSkill), vegetazione media nelle celle occupate, distanza genetica media campionata. Definizioni in `E1_METRICS.md`.

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

## S09 — Habitat povero

- **Condizioni:** 150 fondatori riposizionati nelle 24 celle con vegetazione baseline più bassa (non ocean); 128×128.
- **Variabili:** vegetazione occupata, energia, popolazione, mortalità.
- **Durata:** 900 tick.
- **Atteso:** minore guadagno energetico e maggiore declino rispetto a S10.
- **Anomalia:** nessuna differenza misurabile da S10.
- **Successo:** divergenza osservabile delle traiettorie S09 vs S10.

## S10 — Habitat ricco

- **Condizioni:** come S09 ma nelle 24 celle con vegetazione baseline più alta.
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

---

## Esecuzione

```powershell
$env:PATH = "C:\Users\matti\AppData\Local\Temp\opencode\node-v22.14.0-win-x64;$env:PATH"
$env:E1_TICKS="900"; $env:E1_LONG_TICKS="2700"; $env:E1_SEEDS="11,12"; $env:E1_SAMPLE_EVERY="50"
npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts
```

Per eseguire un solo scenario: `E1_SCENARIOS=S06_predator_prey_mixed`. L’output JSON contiene per ogni run: seed, condizioni, tick completati, `extinctAt`, tempo di esecuzione e l’intera serie di campioni.
