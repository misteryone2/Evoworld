# EvoWorld v1.11.0 — Advanced Fauna Genome

Documentazione del nuovo genoma animale. Tutto ciò che è scritto qui è nel codice (il catalogo è generato dal registro
`simulation/biology/geneRegistry.ts`).

## 1. Modello causale

Genotipo → Espressione genetica → Fenotipo → Ambiente e stato dell'organismo → Comportamento emergente → Selezione naturale.

- **Genotipo**: i 13 tratti di base (invariati) più i geni avanzati (`genome.genes`).
- **Espressione** (`simulation/biology/phenotype.ts`): funzione pura dal genoma ai fattori derivati (massa, riserva di
  energia, costo di mantenimento, resa dell'alimentazione, ecc.).
- **Fenotipo → simulazione**: la simulazione consulta il fenotipo in 10 punti (mantenimento e morte, alimentazione,
  caccia, movimento, percezione, memoria, collisioni, idoneità ambientale, riproduzione).
- **Comportamento**: resta deciso dal cervello evoluto (`brain.ts`, invariato: stessi 13 ingressi, stesse 2 uscite). I geni
  cambiano ciò che il corpo può fare e quanto costa, mai cosa "vuole" fare.

Regole che il codice fa rispettare (e un test verifica):
1. Nessun gene comportamentale diretto (niente aggressività, socialità, esplorazione…).
2. Ogni gene ha un effetto osservabile e un compromesso reale: nessun valore è gratis, nessun estremo è sempre migliore.
3. Valore predefinito **neutro**: tutti i geni al predefinito (o nessun gene) = comportamento identico alla v1.10.
4. Estensibile: nessun array a dimensione fissa e nessun numero massimo di geni.

## 2. Struttura dati e compatibilità

- `Genome = BaseGenome (13 tratti, campi diretti) + genes?: Record<string, number>`.
- `genes` è facoltativo: un genoma senza `genes` esprime il fenotipo neutro. Salvataggi, test e codice precedenti
  continuano a funzionare senza modifiche.
- Id dei geni stabili (sono nei salvataggi): non si rinominano né si riusano.
- Un gene mancante, non numerico o fuori intervallo vale/viene riportato al predefinito/intervallo (`geneValue`).

## 3. Catalogo dei geni effettivamente implementati (13)

I 13 tratti di base sono: size, speed, metabolism, vision, fertility, lifespan, carnivory, preferredTemperature,
temperatureTolerance, preferredWater, waterTolerance, evasion, huntingSkill (invariati, stessi intervalli).

### Morfologia e struttura corporea (peso nella distanza: 0.15)

**`bodyDensity`** — intervallo [0.7, 1.4], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Massa a parità di taglia: pesa di più nelle collisioni (spinge di più, è spinto di meno) e difende meglio dalla caccia (corazza, ossa pesanti).
- Compromesso: Mantenere tessuti densi costa energia: +25% di mantenimento per ogni +1 di densità.
- Interazioni: size (la massa base è taglia³), evasion e sprintBias (difesa dalla caccia).

**`bodyFatReserve`** — intervallo [0.7, 1.5], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Capacità massima di riserva di energia (150 × il valore).
- Compromesso: Portare grasso costa: +20% di mantenimento per ogni +1.
- Interazioni: metabolism, torporCapacity (il torpore scatta in proporzione alla riserva), digestiveEfficiency.

### Locomozione e movimento (peso nella distanza: 0.15)

**`limbLength`** — intervallo [0.7, 1.4], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Su terreno ripido o accidentato il passo si accorcia meno (l'eccesso di costo del terreno si divide per il valore).
- Compromesso: Arti lunghi costano: +15% di mantenimento per ogni +1.
- Interazioni: speed (il passo base), terreno e pendenze del pianeta.

**`sprintBias`** — intervallo [0.6, 1.6], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Potenza di scatto: moltiplica sia la forza del cacciatore sia la difesa della preda negli inseguimenti (fibre rapide).
- Compromesso: Le fibre rapide costano: +20% di mantenimento per ogni +1. Il vantaggio dipende dal ruolo (cacciatore o preda) e dalla popolazione intorno.
- Interazioni: size, speed, huntingSkill, evasion, carnivory.

### Percezione sensoriale (peso nella distanza: 0.1)

**`proximitySensing`** — intervallo [0.5, 2], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Raggio con cui percepisce gli altri animali (rivali, minacce, prede, branco) rispetto alla vista di base; non cambia la ricerca del cibo.
- Compromesso: Organi di senso estesi costano: +8% di mantenimento per ogni +1.
- Interazioni: vision, evasion, huntingSkill (la forza dei segnali di paura e di caccia).

### Fisiologia e metabolismo (peso nella distanza: 0.15)

**`torporCapacity`** — intervallo [0, 0.6], predefinito 0, mutazione σ = 4% dell'intervallo
- Effetto: Con l'energia sotto il 35% della propria riserva, il mantenimento cala della metà del valore.
- Compromesso: Nello stesso stato il passo si accorcia della metà del valore (si muove meno e meno lontano) e il gene costa +10% di mantenimento per ogni +1.
- Interazioni: bodyFatReserve, metabolism, memoryRetention.

**`digestiveEfficiency`** — intervallo [0.7, 1.4], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Energia ricavata dalla vegetazione, in proporzione.
- Compromesso: Un intestino efficiente costa: +20% di mantenimento per ogni +1.
- Interazioni: carnivory (solo la quota vegetale), environmentalFitness, bodyFatReserve.

### Adattamento ambientale (peso nella distanza: 0.15)

**`thermalBias`** — intervallo [-1, 1], predefinito 0, mutazione σ = 4% dell'intervallo
- Effetto: Asimmetria della tolleranza termica: valori positivi allargano la tolleranza verso il freddo (+35% per ogni +1) e la stringono verso il caldo; i negativi il contrario.
- Compromesso: Compromesso puro: quanto guadagna da una parte lo perde dall'altra.
- Interazioni: preferredTemperature, temperatureTolerance (larghezza e picco di idoneità).

**`droughtBias`** — intervallo [-1, 1], predefinito 0, mutazione σ = 4% dell'intervallo
- Effetto: Asimmetria della tolleranza all'acqua: valori positivi allargano la tolleranza verso i luoghi più secchi del preferito (+35% per ogni +1) e la stringono verso i più umidi; i negativi il contrario.
- Compromesso: Compromesso puro: quanto guadagna da una parte lo perde dall'altra.
- Interazioni: preferredWater, waterTolerance.

### Capacità ecologiche e alimentari (peso nella distanza: 0.08)

**`meatEfficiency`** — intervallo [0.7, 1.4], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Energia ricavata da una preda catturata, in proporzione.
- Compromesso: Un apparato digerente per la carne costa: +20% di mantenimento per ogni +1.
- Interazioni: carnivory, huntingSkill, sprintBias.

### Riproduzione e ciclo vitale (peso nella distanza: 0.14)

**`gestationInvestment`** — intervallo [0.7, 1.5], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Quanta energia mette in ogni figlio: il costo per il genitore e l'energia iniziale del nato crescono insieme (strategia K) o calano (strategia r).
- Compromesso: Figli più dotati sopravvivono meglio ma ne servono più risorse a ogni nascita.
- Interazioni: fertility, bodyFatReserve, metabolism.

**`maturationRate`** — intervallo [0.6, 1.6], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Velocità di maturazione: la fase giovanile (10% della vita) si accorcia o si allunga in proporzione inversa.
- Compromesso: Vita veloce, vita breve: la durata effettiva della vita cala del 20% per ogni +1.
- Interazioni: lifespan, fertility.

### Capacità cognitive (peso nella distanza: 0.08)

**`memoryRetention`** — intervallo [0.5, 2], predefinito 1, mutazione σ = 4% dell'intervallo
- Effetto: Per quanto tempo si ricorda un luogo di cibo o di pericolo prima di dimenticarlo (300 tick × il valore). Il cervello decide cosa farne.
- Compromesso: Il tessuto nervoso costa: +10% di mantenimento per ogni +1.
- Interazioni: brain (canale di memoria), territorio e luoghi di caccia.


### Geni valutati e scartati (motivazioni)
- **Aggressività, socialità, esplorazione, audacia**: sono comportamenti, non capacità: escluse per regola.
- **Resistenza al freddo / al caldo come due geni separati**: ridondanti con `temperatureTolerance`; sostituiti da un
  solo gene di asimmetria (`thermalBias`), che sposta il compromesso senza duplicare la larghezza della nicchia.
- **Selettività del compagno (soglia di compatibilità)**: è una preferenza di comportamento e interferirebbe con la
  speciazione, da ricalibrare nella v1.12.0.
- **Tasso di mutazione ereditabile**: rischio di deriva incontrollata; rinviato.
- **Capacità cognitive ulteriori** (apprendimento, pianificazione): il cervello non ha un meccanismo che le usi; l'unica
  capacità cognitiva con un meccanismo reale è la durata della memoria (`memoryRetention`).

## 4. Ereditarietà e mutazione

- Tratti di base: **invariati** (media dei genitori, mutazione 15% per tratto, σ = 4% dell'intervallo, stesso flusso
  casuale della v1.10).
- Geni avanzati (`inheritGenes`): media dei genitori (gene mancante = predefinito), poi per ogni gene mutazione con
  probabilità `MUTATION_RATE` (15%) e σ = `mutationStd` × intervallo, poi riportato nell'intervallo. Asessuata: stesso
  schema con un solo genitore (`cloneGenes`).
- **Fondatori** (`founderGenes`): attorno al valore neutro (±25% di mezzo intervallo), non estremi casuali: i nuovi
  caratteri partono come variazione, non come condanna.
- **Generatore separato**: i geni avanzati usano un generatore derivato dallo stato del mondo e dall'id dell'organismo
  (`deriveGeneRandom`) senza consumare numeri dal generatore del mondo. Quindi il flusso casuale della simulazione è
  quello della v1.10 e con `enableAdvancedGenome: false` il mondo è identico, bit per bit, alla v1.10 (verificato:
  3 semi × 600 tick, posizioni, energie, età, tratti e pesi dei cervelli).

## 5. Espressione: formule

Costo di mantenimento (moltiplica il mantenimento di base, minimo 0,5):
`1 + 0,25·(densità−1) + 0,20·(grasso−1) + 0,15·(arti−1) + 0,20·(scatto−1) + 0,08·(percezione−1) + 0,10·torpore + 0,20·(digestione−1) + 0,20·(carne−1) + 0,10·(memoria−1)`.
Costanti e altri effetti (difesa, riserva, scatto, torpore, asimmetrie, maturazione) in `phenotype.ts`, tutte nominate.

Dove agisce il fenotipo: `organism.ts` (mantenimento, torpore, durata della vita), `feeding.ts` (resa vegetale, tetto
di energia), `predation.ts` (forza, difesa, resa della carne, tetto), `movement.ts` (torpore, costo del terreno),
`behavior.ts` (raggio di percezione, durata della memoria), `collision.ts` (massa), `environment.ts` (asimmetrie),
`reproduction.ts` (maturità, costo e dotazione del figlio, eredità dei geni).

## 6. Distanza genetica

`d = sqrt( meanSq_base + λ · meanSq_avanzati )`, con λ = 0,25.

- `meanSq_base`: media dei quadrati delle differenze dei 13 tratti, normalizzate per l'intervallo — **esattamente** la
  formula della v1.10. Senza geni avanzati (da nessuna delle due parti) la distanza è bit per bit quella di prima.
- `meanSq_avanzati`: differenza normalizzata per l'intervallo di ciascun gene, al quadrato, media pesata dentro la
  categoria, poi media tra categorie con **pesi fissi** (somma 1) rinormalizzati sulle categorie presenti.
- Robustezza al numero di geni: è una media, quindi vale al massimo 1 qualunque sia il numero di geni; aggiungerne a una
  categoria ne affina la media, non ne cambia la scala. Un gene mancante vale il predefinito: genomi vecchi e nuovi
  restano confrontabili. Simmetrica, zero per genomi identici, numericamente stabile (solo somme e radice).
- Soglie **non modificate**: `MATE_COMPATIBILITY_THRESHOLD` 0,16 e `SPECIATION_DISTANCE_THRESHOLD` 0,26.
  Con fondatori a ±25% il contributo avanzato è dell'ordine di 0,25 × 0,01 = 0,0025 su una soglia di compatibilità di
  0,16² = 0,0256 (circa 10% del bilancio). **Da ricalibrare nella v1.12.0 Advanced Speciation.**

## 7. Migrazione dei vecchi salvataggi

- Snapshot nuovi: `genomeSchema: 2` e `advancedGenome: true|false`.
- Snapshot precedenti (senza `genomeSchema`): al caricamento ogni organismo passa da `migrateGenome`: 13 tratti
  **identici**, geni avanzati ai valori predefiniti, tutto il resto del salvataggio invariato. Da lì i geni evolvono.
- `migrateGenome` è idempotente (ricaricare un salvataggio già migrato non cambia nulla), non modifica l'originale,
  **conserva geni sconosciuti** (versioni future), ripara valori non validi o fuori intervallo. `validateGenome` elenca i problemi.
- Registro delle specie: i genomi di origine non si riscrivono (restano com'erano); la distanza tratta i geni mancanti come predefiniti.
- Salvataggi con `advancedGenome: false` restano senza geni dopo il caricamento.

## 8. Limiti noti del genoma
- `proximitySensing` può allargare il raggio di percezione solo entro la finestra dei secchi spaziali di `behavior.ts`
  (3×3 secchi da 4 celle): pesa soprattutto per animali con vista bassa; al ribasso agisce su tutti.
- Gli esperimenti evolutivi sono in `docs/REPORT-v1.11.0.md`: non sono prove di equilibrio in ogni mondo.
- Nessuna UI mostra ancora i geni avanzati (l'ispettore degli organismi mostra solo i 13 tratti); la forma 3D delle creature non li usa.
