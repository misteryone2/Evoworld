# E1 — Metriche osservazionali

**Branch:** `research/e1-ecosystem-qa`  
**Implementazione:** `tools/e1/metrics.ts` (`sampleState()`, `accumulate()`, `sampledGeneticDistance()`)  
**Principio:** ogni metrica è calcolata **solo** da dati che il motore espone già: `World.getStats()`, `world.organisms`, `world.planet.peekCell()` e i genomi presenti negli organismi. Nessun valore viene inventato, stimato da modelli esterni o letto da campi privati del motore.

---

## 1. Sorgenti dati realmente disponibili

| Sorgente | Campi usati | Natura |
|---|---|---|
| `World.getStats()` | `tick`, `year`, `season`, `population`, `speciesCount`, `speciesAlive`, `speciesTotalEver`, `speciesExtinct`, `births`, `deaths`, `predationKills`, `averageGenome` | Statistiche calcolate dal motore una volta per tick. **`births/deaths/predationKills` sono per tick, non cumulativi** (`world.ts:286-305`). |
| `world.organisms` | `id`, `speciesId`, `position`, `energy`, `age`, `genome` (tratti base) | Stato individuale vivo. È l’unica fonte per conteggi per specie, energia, età e tratti. |
| `world.planet.peekCell(x, y)` | `vegetation`, `terrain` | Lettura read-only; restituisce la cella solo se il chunk è già materializzato, altrimenti `null`. **Non materializza chunk** (`planet.ts:282-299`). |
| `world.planet.sampleBaseline(x, y)` | `vegetation`, `terrain` | Baseline analitica senza materializzazione. Usata solo per scegliere le condizioni iniziali di S09/S10, non per le serie temporali. |
| `shannonDiversityIndex()` | array di popolazioni per specie | Funzione pura già presente in `lib/biodiversity.ts:14-25`. |
| `geneticDistance(a, b)` | genomi di due organismi | Funzione pura già presente in `simulation/biology/genome.ts`. |

---

## 2. Definizioni operative

Sia \(N = |world.organisms|\) al momento del campionamento.

### 2.1 Popolazione

- **`population`** = \(N\). Coincide con `getStats().population`; l’harness usa direttamente l’array pubblico per poter contare anche subito dopo una perturbazione.
- **`speciesCounts`** = mappa `speciesId → conteggio`, ottenuta iterando gli organismi vivi.
- **`speciesAlive` / `speciesTotalEver` / `speciesExtinct`** = valori del registry esposti da `getStats()`. `speciesAlive` è il numero di specie con popolazione > 0; `speciesTotalEver` è il totale storico; `speciesExtinct` è il numero di specie estinte.

### 2.2 Biodiversità

- **Ricchezza osservata** \(S\) = numero di chiavi di `speciesCounts` con conteggio > 0.
- **Shannon** \(H = -\sum_i p_i \ln p_i\), con \(p_i = n_i / N\). Se \(N = 0\), \(H = 0\).
- **Evenness** \(J = H / \ln S\) se \(S > 1\), altrimenti \(J = 0\).

Interpretazione: \(H = 0\) indica una sola specie (o popolazione vuota); valori più alti indicano distribuzione più equilibrata. Non è un indicatore di “qualità ecologica” e non implica stabilità.

### 2.3 Natalità, mortalità, pressione predatoria

Per ogni tick \(t\):

- **`births`** = `getStats().births` al tick \(t\).
- **`deaths`** = `getStats().deaths` al tick \(t\). **Non include le uccisioni da predazione**, che il motore tiene in un contatore separato (`world.ts:283,302-303`).
- **`predationKills`** = `getStats().predationKills` al tick \(t\).
- **`birthRate`** = `births / max(1, N)`, **`deathRate`** = `deaths / max(1, N)`, **`predationPressure`** = `predationKills / max(1, N)`.

L’harness accumula i tre contatori per tick in `cumulativeBirths`, `cumulativeDeaths`, `cumulativePredationKills`. **Non è possibile separare morte per fame da morte per vecchiaia** con i dati disponibili: servirebbe una modifica al motore, non eseguita.

### 2.4 Estinzioni

- **`extinctAt`** (nel risultato della corsa) = primo tick in cui `world.organisms.length === 0`; `null` se la popolazione sopravvive fino alla fine.
- **`speciesExtinct`** = conteggio storico fornito dal registry. Non viene inferito dalla scomparsa temporanea di una specie campionata.

### 2.5 Risorse ambientali

- **`occupiedVegetation`** = media di `cell.vegetation` sulle celle occupate da organismi vivi per cui `peekCell()` restituisce una cella.
- **`occupiedLandFraction`** = frazione di quelle celle con `terrain !== "ocean"`.
- **`occupiedCellsSampled`** = numero di celle effettivamente lette.

**Limite importante:** questa è una misura *occupata e condizionata*, non la vegetazione globale del pianeta. Man mano che la popolazione cala, vengono campionate meno celle; un aumento della media finale può riflettere il fatto che restano organismi solo in zone vegetate. Il motore non espone una griglia globale live senza materializzare chunk, quindi non possiamo calcolare uno stock totale di risorse. Nei report, i valori di vegetazione occupata vanno letti come **indicatori parziali**, non come prova di abbondanza o carenza globale.

### 2.6 Energia e età

- **`meanEnergy`** = media di `organism.energy`; **`energySd`** = deviazione standard della stessa distribuzione.
- **`meanAge`** = media di `organism.age` in tick (non in anni o generazioni).

Energia media alta con nascite nulle non dimostra “buona salute” dell’ecosistema: la riproduzione richiede anche compagno nel raggio 4, età ≥ maturità e tentativo stocastico (`reproduction.ts:77-140`).

### 2.7 Dieta e tratti ereditari

- **`carnivoreFraction`** = frazione di organismi con `genome.carnivory >= 0.35`, cioè la soglia usata dal motore per tentare la caccia (`predation.ts:12`).
- **`herbivoreFraction`** = frazione con `carnivory < 0.35`.
- **`meanCarnivory`, `meanSize`, `meanSpeed`, `meanMetabolism`, `meanVision`, `meanEvasion`, `meanHuntingSkill`** = medie dei corrispondenti campi del genoma base degli organismi vivi.

Queste medie sono descrittive della popolazione campionata. **Non dimostrano adattamento**: il cambiamento può derivare da deriva, mortalità differenziale o selezione, che con questi dati non sono separabili. I geni estesi (v2) non sono riassunti dalle metriche correnti; il report li tratta solo come “presenti ma non misurati direttamente”.

### 2.8 Distanza genetica

`meanGeneticDistance` è la media di `geneticDistance()` su al più 120 coppie (o `3N` se \(N\) è piccolo), campionate con `new Random(tick + 1)`, **separato dall’RNG del mondo**. È quindi riproducibile e non perturba il corso della simulazione. È un proxy di divergenza intra-popolazione, non una misura di fitness né una prova di selezione.

---

## 3. Cosa NON è misurabile con l’harness attuale

| Quantità | Motivo |
|---|---|
| Causa esatta di morte (fame vs vecchiaia) | `deaths` aggrega entrambe; servirebbe un contatore nel motore |
| Successo riproduttivo per genitore / per coppia | `getStats()` espone solo il totale per tick |
| Stock globale di vegetazione / nutrienti | `peekCell()` vede solo chunk materializzati; `getCell()` li creerebbe e altererebbe la memoria osservata |
| Competizione per specie | non esiste un evento osservabile “competizione”; è emergente dal pool condiviso |
| Apprendimento intra-vita | non implementato (`brain.ts:29-34`) |
| Evoluzione delle piante | `plantGenome.ts` è scollegato dalla simulazione |
| Perturbazioni climatiche esterne | nessun hook nel motore |
| Effetto fenotipico dei singoli geni estesi | non esposto nelle metriche correnti |

---

## 4. Tabella rapida campo → definizione

| Campo JSON | Unità | Formula / origine |
|---|---|---|
| `tick`, `year`, `season` | tick / anni / stagione | `getStats()` |
| `population` | individui | `len(organisms)` |
| `speciesCounts` | individui per `speciesId` | conteggio diretto |
| `shannon`, `evenness` | adimensionale | Shannon ed evenness sopra |
| `births`, `deaths`, `predationKills` | eventi/tick | `getStats()` (per tick) |
| `cumulativeBirths`, `cumulativeDeaths`, `cumulativePredationKills` | eventi assoluti | somma dei campi per tick |
| `birthRate`, `deathRate`, `predationPressure` | eventi/individuo/tick | conteggio / `max(1,N)` |
| `meanEnergy`, `energySd` | energia | media e deviazione standard di `energy` |
| `meanAge` | tick | media di `age` |
| `carnivoreFraction`, `herbivoreFraction` | frazione | soglia `carnivory 0.35` |
| `mean*` (tratti) | valore del tratto | media del genome base |
| `occupiedVegetation` | 0..1 circa | media `peekCell().vegetation` |
| `occupiedLandFraction` | frazione | celle non-ocean / celle campionate |
| `occupiedCellsSampled` | celle | conteggio |
| `meanGeneticDistance` | distanza | campione deterministico con RNG separato |

---

## 5. Reproducibilità

Ogni riga del JSON di output contiene `seed`, dimensioni del mondo, popolazione iniziale, `setup`, `perturbation`, opzioni, tick completati, `extinctAt`, tempo trascorso e l’intera serie di campioni. Con gli stessi seed e gli stessi parametri d’ambiente, `tools/e1/runner.ts` produce la stessa serie; questo è verificato dal test deterministico in `tests/e1/e1_metrics.test.ts`.
