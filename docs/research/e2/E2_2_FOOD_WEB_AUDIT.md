# E2.2 — Audit delle dinamiche trofiche e dell'osservabilità

**Fase:** E2.2 Food Web Dynamics
**Branch:** `research/e2-ecosystem-dynamics`
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22`
**Data:** 2026-11-18
**Stato:** audit completato; strumenti ed esperimenti additivi descritti in [E2_2_EXPERIMENTAL_MATRIX.md](E2_2_EXPERIMENTAL_MATRIX.md).

Questo audit stabilisce **quali affermazioni sulle reti trofiche sono supportabili** con la sola strumentazione E1 immutata. Non modifica il motore, i geni, la selezione, la riproduzione, il metabolismo, la predazione, il renderer, G1/G1-b/G2, `lib/anatomy/**`, `lib/phenotype/**`, `tools/e1/**` o i formati di salvataggio. Tutto il codice E2.2 è additivo.

---

## 1. Perché serve un audit trofico

E2.1 ha mostrato che le correlazioni tra serie di tratti restano elevate anche dopo detrending, ma non possono essere lette come dipendenza trofica. E2.2 deve rispondere a una domanda più stretta — *i carnivori seguono le prede e le uccisioni registrate con un ritardo misurabile?* — senza trasformare etichette di tratto in ruoli ecologici osservati.

La distinzione fondamentale è (tratto / evento / mortalità / risorsa / identità):

| Livello | Osservabile E1 | **Non** osservabile |
|---|---|---|
| Tratto | `carnivoreFraction`, `herbivoreFraction`, `meanCarnivory` | Chi ha attaccato chi in un dato tick |
| Evento | `predationKills`, `predationPressure`, `cumulativePredationKills` | Tentativi falliti, preda effettiva, energia trasferita |
| Mortalità | `deaths` **e** `predationKills` (contatori separati) | Causa individuale di morte (fame vs vecchiaia vs predazione) |
| Risorsa | `occupiedVegetation` (media su celle occupate) | Stock vegetazionale globale, domanda/budget regionale |
| Identità | `speciesCounts`, ID di specie | ID predatore/preda, ID genitore/figlio, mappa individuale |

**Regola di E2.2:** ogni conclusione deve dichiarare se usa un tratto, un evento contato o un proxy di risorsa. Mai inferire un ruolo trofico individuale da una frazione di popolazione.

---

## 2. Osservabili misurabili (fonte: `tools/e1/metrics.ts`)

`E1Sample` ha **44 campi** (il testo "45 campi" in `E2_0_ENGINE_ECOLOGY_AUDIT.md:96` è obsoleto; il codice è fonte di verità).

### 2.1 Popolazione e tratti

| Campo | Semantica dal codice | Unità | Uso in E2.2 |
|---|---|---|---|
| `population` | `world.organisms.length` dopo `step()` e dopo eventuale cull | individui | denominatore dei conteggi di tratto |
| `carnivoreFraction` | frazione di organismi con `genome.carnivory >= 0.35` | frazione | **etichetta di tratto**, non ruolo di attacco |
| `herbivoreFraction` | complemento (`carnivory < 0.35`) | frazione | **etichetta di tratto**, non consumo vegetale osservato |
| `meanCarnivory` | media di `genome.carnivory` | tratto [0,1] | verifica che la frazione non sia un artefatto di soglia |
| `speciesCounts` | conteggi viventi per `speciesId` | individui/specie | distinzione tra gruppi S06 (specie 1/2) |
| `meanEnergy`, `meanAge`, `meanSize`, `meanSpeed`, `meanHuntingSkill` | medie dei genomi viventi | vari | covariate descrittive, non meccanismi |

Operazionalizzazione usata: `conteggioErbivori(t) = population(t) × herbivoreFraction(t)` e `conteggioCarnivori(t) = population(t) × carnivoreFraction(t)`. Le frazioni sono arrotondate a 4 decimali in E1, quindi i conteggi sono **approssimati**; l'errore è al massimo dell'ordine di `population × 5e-5`.

### 2.2 Predazione e mortalità

| Campo | Semantica dal codice | Unità | Uso in E2.2 |
|---|---|---|---|
| `predationKills` | uccisioni **nel singolo tick** campionato | eventi/tick | istantaneo; con `sampleEvery=10` è un campione, non un aggregate |
| `cumulativePredationKills` | contatore cumulativo del runner | eventi | la serie affidabile per intervalli |
| `predationPressure` | `predationKills / eventDenominator` | eventi/individuo/tick | normalizzazione, non frazione di morti |
| `deaths` | morti **esclusi** `predationKills` (A07) | eventi/tick | mortalità non predatoria |

Tasso intervallare usato in E2.2:

```
killRate(t_i) = (cumulativePredationKills(t_i) - cumulativePredationKills(t_{i-1})) / (t_i - t_{i-1})
```

È una media sull'intervallo tra campioni, **non** il numero di uccisioni in un singolo tick. `predationKills` al tick campionato viene conservato separatamente come snapshot puntuale.

**A07 — `predationKills` non confluisce in `deaths`.** La mortalità totale non è leggibile da un solo contatore: va sommata. Di conseguenza `predationKills` **non** è "tutte le morti" e un calo di popolazione senza kills non implica assenza di predazione né la implica.

### 2.3 Risorse e spazio

| Campo | Semantica dal codice | Limite |
|---|---|---|
| `occupiedVegetation` | media della vegetazione su **celle distinte occupate** da organismi (`peekCell`, senza materializzazione) | non è uno stock globale; cambia quando cambia la distribuzione degli organismi |
| `occupiedLandFraction` | frazione di quelle celle con `terrain !== "ocean"` | composizione del campione, non disponibilità di risorsa |
| `organismsSampled`, `occupiedCellsSampled` | supporto del campione | denotano la copertura, non l'abbondanza di risorsa |

---

## 3. Cosa non è osservabile senza modifiche al motore

Elenchi derivati da `E2_0_ENGINE_ECOLOGY_AUDIT.md:100` e dal codice:

1. **Identità predatore/preda** — impossibile ricostruire archi individuali o grafo trofico.
2. **Tentativi di caccia falliti** — solo le uccisioni riuscite sono contate.
3. **Flusso energetico individuale** — per A05 l'energia non è conservativa nella predazione.
4. **Causa individuale di morte** — fame, vecchiaia e predazione non sono separabili per individuo.
5. **Stock vegetazionale globale e domanda regionale** — per A06 la depletion segue la domanda, non il guadagno effettivo.
6. **`meanFitness` per organismo/specie nelle serie** — esiste solo in `SpeciesHabitat` via `getSpeciesGenomeStats()`, fuori da `RunResult`; inoltre materializza chunk (A08).

**Conseguenza per l'inferenza:** E2.2 può misurare *sequenzialità temporale aggregata* tra tratti, kills e proxy di risorsa. Non può misurare *chi mangia chi*, né dimostrare che un tratto causi una uccisione.

---

## 4. Anomalie rilevanti e loro impatto sull'interpretazione

| ID | Anomalia | Impatto su E2.2 |
|---|---|---|
| A04 | Predatori apicali immuni per `carnivory <= 0.85`, con regola "preda a carnivoria inferiore" | Le catene sono troncate per costruzione: in S05 (tutti `carnivory=0.6`) non può esserci predazione tra conspecifici. Kills basse non provano assenza di "dipendenza", ma assenza di prede idonee |
| A05 | Energia di caccia non conservativa, costo non clampato | Non interpretare variazioni energetiche come flusso trofico |
| A06 | Depletion vegetazionale ∝ domanda, non guadagno | `occupiedVegetation` può calare anche senza calo energetico reale |
| A07 | `predationKills` escluso da `deaths` | Mortalità totale = somma; kills ≠ tutte le morti |
| A08 | `getSpeciesGenomeStats()` materializza chunk | E1 evita `getCell()` usando `peekCell()`; E2.2 non chiama API che materializzano |
| A10 | Allee effect emergente (soglia energia 130, raggio accoppiamento 4) | Collasso e mancata ricolonizzazione possono essere demografici, non trofici |
| A12 | Documentazione obsoleta | Codice e test sono fonte di verità; la geometria S06 corretta è sotto |

### 4.1 Correzione di un drift nella matrice

La matrice E2.1 (`E2_EXPERIMENTAL_MATRIX.md:82`) affermava che S04/S05/S06 avessero "stessa geometria e popolazione iniziale". **Non è corretto**: `tools/e1/scenarios.ts:46-48` definisce S04 e S05 a 128×128/150 fondatori e S06 a 160×160/180 fondatori (90 erbivori `speciesId=1`, 90 carnivori `speciesId=2` per parità di indice). Il confronto S06−S05 e S06−S04 è quindi **descrittivo e confuso** (geometria + densità + composizione): va riportato come tale, non come effetto della sola dieta.

---

## 5. Semantica dei setup trofici

| Scenario | Setup E1 | Assegnazione iniziale | Note |
|---|---|---|---|
| S04 | `herbivore` | `carnivory = 0.05` per tutti i 150 fondatori, `speciesId = 1` | Controllo "senza predazione attesa" (A04). Mutazione solo iniziale |
| S05 | `carnivore` | `carnivory = 0.6` per tutti i 150 fondatori, `speciesId = 1` | Tutti sopra soglia di caccia ma sotto soglia apicale: predazione tra conspecifici impossibile (A04) |
| S06 | `mixed` | indice pari → `0.05`, `speciesId=1`; indice dispari → `0.6`, `speciesId=2` | 90/90. `syncRegistry()` crea `speciesId=2` con `parentSpeciesId=null`: separazione artificiale, non speciazione |

L'applicazione dei setup avviene su uno snapshot e ricostruisce il mondo; **non modifica regole**. RNG del mondo è deterministico per seed; gli hash dell'harness sono separati e non consumano il RNG del motore.

---

## 6. Definizioni operative E2.2

| Quantità | Definizione | Unità / attenzione |
|---|---|---|
| Serie erbivora | `population × herbivoreFraction` | conteggio approssimato di **tratto** |
| Serie carnivora | `population × carnivoreFraction` | conteggio approssimato di **tratto** |
| Kills cumulativi | `cumulativePredationKills` | eventi from tick 0 |
| Tasso kills intervallare | Δ cumulativo / Δ tick | eventi/tick mediati sull'intervallo |
| Presenza gruppo | conteggio di tratto `> 0` | 0 ⇔ nessun portatore; ≥1 ⇔ almeno un portatore atteso |
| Persistenza | frazione di campioni con presenza | fine dell'orizzonte, non "permanenza evolutiva" |
| Coesistenza | campioni con entrambi i conteggi `> 0` | descrittiva |
| Lag | `crossCorrelation(a,b)` accoppia `a[t]` con `b[t+lag]` | **tick**, non campioni; **lag positivo = b dopo a**. Con `sampleEvery=10` solo multipli di 10 sono stimabili |
| Detrending | residui di regressione lineare sul tick | riduce trend comuni; non rimuove causalità né la dimostra |
| Oscillazione | picchi/minimi con prominence ≥10% dell'escursione | intervallo medio in tick |

---

## 7. Regole di inferenza

1. **Un lag positivo è sequenzialità, non causalità.** Serve una manipolazione delle popolazioni per parlare di causa; non disponibile.
2. **Una frazione di tratto non è un ruolo.** `carnivoreFraction=0.6` non dice chi ha ucciso.
3. **`herbivoreFraction` non misura consumo vegetale.** `occupiedVegetation` è un proxy su celle occupate.
4. **Kills ≠ mortalità totale**, e kills nulle non provano assenza di dipendenza trofica quando mancano prede idonee (A04).
5. **Confronti S04/S05/S06 non randomizzati e non bilanciati:** descrittivi, mai causali.
6. **Classificazione massima consentita:** EVIDENZA per pattern ripetuti in ≥10/12 seed con CI95 che esclude 0; INDICATIVO per pattern minori; NON DIMOSTRATO per dipendenza causale.

---

## 8. Cosa E2.2 può concludere

- Se, in S06, il conteggio carnivoro segue quello erbivoro con lag positivo in ≥10/12 seed e la correlazione detrendizzata resta forte → **EVIDENZA di sequenzialità demografica aggregata**, non di predazione causale.
- Se S05 produce kills ≈0 → **coerente con A04** (mancanza di prede a carnivoria inferiore), non prova che i carnivori "non dipendano" dalle prede.
- Se la persistenza dei due tratti in S06 è breve → **collapse dell'etichetta di tratto**, non necessariamente estinzione dell'attacco.
- Se i risultati cambiano con durata/campionamento/seed → **sensibilità del disegno osservativo**, da riportare come limite.
