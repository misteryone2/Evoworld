# EvoWorld v1.11.0 — Advanced Fauna Genome (implementazione della specifica di Vibe)

Questo documento descrive ciò che è **effettivamente nel codice**. La specifica di partenza è quella di Vibe
("Specifica architetturale", "Catalogo dei geni", "Validazione evolutiva"). Dove l'implementazione si discosta dalla
specifica, è elencato in §7 con la motivazione. (Una prima versione a 13 geni, progettata prima di ricevere la specifica,
è conservata sul branch `backup/v1.11.0-13geni` e non fa parte di questa consegna.)

## 1. Modello e moduli
Genotipo → Espressione → Fenotipo → Ambiente/stato → Comportamento emergente (cervello evoluto) → Selezione.

| Modulo | Ruolo |
|---|---|
| `simulation/biology/traitRanges.ts` (NUOVO) | `TRAIT_RANGES` (valori invariati), `MUTATION_RATE`, frazione di mutazione. Spostati da `genome.ts`, che li riesporta |
| `simulation/biology/geneRegistry.ts` (NUOVO) | `GENE_REGISTRY` (13 storici + 20 estesi), `GENE_BY_KEY`, `GENOME_VERSION_CURRENT = 2` |
| `simulation/biology/genomeExt.ts` (NUOVO) | `getGene`, `validateGenome`, `mutateGeneValue`, `inheritGenomeV2`, `cloneGenomeWithMutationV2`, `founderExt`, `inheritExt`, `cloneExt`, `deriveGeneRandom` |
| `simulation/biology/geneExpression.ts` (NUOVO) | `Phenotype`, `expressGenome`, `phenotypeOf` (in cache sul genoma), `DEFAULT_PHENOTYPE`, tutte le costanti dei coefficienti |
| `simulation/biology/genomeMigration.ts` (NUOVO) | `migrateGenome`, `migrateSnapshot` |
| `simulation/biology/energy.ts` (NUOVO) | `MAX_ENERGY`, ora unico (era triplicato in `behavior`, `predation`, `feeding`) |
| `simulation/biology/genome.ts` | `geneticDistanceV2`, `areGeneticallyCompatibleV2`, `geneticDistance` (smista), media dei geni estesi |

Tipi: `Genome` = 13 tratti di primo livello + `ext?: Record<string, number>`; `WorldSnapshot.genomeVersion` (assente = 1);
`Cell.seasonalOffset?` (scostamento stagionale già incluso in `temperature`, per ADA-01).

## 2. Catalogo dei 20 geni estesi
| ID | Chiave | Range | Predefinito | Peso | Effetto | Aggancio (hook) |
|---|---|---|---|---|---|---|
| MOR-01 | `furDensity` | 0–1 | 0 | 0.6 | Foltezza del pelo: isolamento dal freddo, a scapito del caldo. Costo di mantenimento. | environment.ts: scala la deviazione termica z (lato freddo ×(1−0,30·pelo), lato caldo ×(1+0,20·pelo)); organism.ts: upkeep |
| MOR-02 | `dermalArmor` | 0–0.6 | 0 | 0.7 | Corazza dermica: si somma alla difesa dalla caccia; rallenta e costa mantenimento. | predation.ts: defensivePower (1,15 + evasion + corazza, con tetto totale); movement.ts: passo ×(1−0,15·corazza); organism.ts: upkeep |
| MOR-03 | `bodyStature` | 0–1 | 0.5 | 0.5 | Corporatura da esile (0) a robusta (1): robusto = corpo più grande e più difeso ma più lento; esile viceversa. Compromesso interno, senza costo diretto. | collision.ts: raggio ×(1+0,15·s); predation.ts: difesa ×(1+0,10·s); movement.ts: passo ×(1−0,10·s), con s = 2·(valore−0,5) |
| LOC-01 | `endurance` | 0–1 | 0 | 0.6 | Resistenza: riduce il costo energetico del movimento (non quello del riposo). | organism.ts upkeepCost: termine di velocità ×(1−0,40·resistenza); upkeep |
| LOC-02 | `burstPower` | 0–1 | 0 | 0.6 | Potenza di scatto: bonus momentaneo nei tentativi di caccia e fuga, pagato con energia a ogni tentativo. | predation.ts: huntingPower e defensivePower ×(1+0,25·scatto); costo 6·scatto per tentativo (cacciatore e preda) |
| PER-01 | `peripheralAcuity` | 0–1 | 0 | 0.5 | Acuità periferica: il segnale di pericolo è più forte e la minaccia è rilevata un po' più lontano. La decisione resta alla rete. | behavior.ts: canale paura ×(1+0,5·a), raggio di rilevazione delle minacce ×(1+0,25·a); upkeep |
| PER-02 | `olfactorySensitivity` | 0–1 | 0 | 0.4 | Olfatto: il canale della memoria è più intenso. | behavior.ts: canale memoria ×(1+0,6·o); upkeep |
| PER-03 | `socialTolerance` | 0–1 | 0.5 | 0.4 | Tolleranza alla vicinanza di altri: chi tollera poco sente più forte il segnale del gruppo. È fisiologia sensoriale, non una decisione. | behavior.ts: canale del gruppo ×(1,4−0,8·t) |
| FIS-01 | `energyReserve` | 0–1 | 0 | 0.6 | Riserve di grasso: tetto di energia più alto, mantenimento più alto. | energy.ts/feeding.ts/predation.ts/behavior.ts: tetto = MAX_ENERGY×(1+0,6·r); organism.ts: upkeep |
| FIS-02 | `digestiveEfficiency` | 0–1 | 0.5 | 0.7 | Efficienza digestiva: moltiplica l'energia ricavata da ogni fonte. | feeding.ts e predation.ts: guadagno ×(0,75+0,5·d); organism.ts: upkeep |
| FIS-03 | `thermoregulation` | 0–1 | 0 | 0.5 | Termoregolazione: rende meno svantaggiosa una tolleranza termica larga (recupera parte dell'altezza del picco). | environment.ts: picco termico = maxPeak − tolFrac·(maxPeak−minPeak)·(1−0,4·t); organism.ts: upkeep |
| FIS-04 | `hydrationEfficiency` | 0–1 | 0 | 0.4 | Idratazione efficiente: come FIS-03 sull'asse dell'acqua. | environment.ts: picco idrico recuperato ×(0,4·h); organism.ts: upkeep |
| ADA-01 | `seasonalRobustness` | 0–1 | 0 | 0.4 | Robustezza stagionale: ammortizza lo scostamento stagionale della temperatura. | environment.ts: offset stagionale (cell.seasonalOffset) ×(1−0,35·s); organism.ts: upkeep |
| ADA-02 | `altitudeAdaptation` | 0–1 | 0 | 0.4 | Adattamento altitudinale: più idoneo in quota, a pagamento. PROVVISORIO (decisione aperta di Mattia sulla vegetazione di quota). | environment.ts: fitness ×(1+0,3·a·quota/0,85), cioè la formula (0,85+0,3·a·quota) rinormalizzata a 1 per a=0; organism.ts: upkeep |
| ECO-01 | `grazingEfficiency` | 0–1 | 0 | 0.6 | Pascolo efficiente: pesa meno nella domanda sul budget regionale a parità di guadagno. PROVVISORIO (decisione aperta di Mattia: quota o consumo). | feeding.ts: peso di domanda (regione e cella) ×(1−0,3·g); guadagno invariato; organism.ts: upkeep |
| ECO-02 | `dietFlexibility` | 0–1 | 0 | 0.5 | Flessibilità dietetica: attenua il costo convesso della carnivoria (non lo azzera). | organism.ts: costo della carnivoria ×(1−0,40·f); upkeep |
| REP-01 | `parentalInvestment` | 0–1 | 0.4444 | 0.6 | Investimento parentale: più energia al nato e più costo per il genitore. | reproduction.ts: energia del nato = 50×(0,6+0,9·p); costo del genitore = 55 + 1,1·(energia del nato − 50) |
| REP-02 | `maturityRate` | 0–1 | 0.6 | 0.5 | Velocità di maturazione: abbassa o alza la soglia di età riproduttiva (6%–16% della vita). | reproduction.ts: soglia = vita×0,1×(1,6−velocità) |
| COG-01 | `memorySpan` | 0–1 | 0.3333 | 0.5 | Durata della memoria di cibo e pericolo (150–600 tick). | behavior.ts: decadimento = 300×(0,5+1,5·s); organism.ts: upkeep |
| COG-02 | `neuralStability` | 0–1 | 0.5 | 0.5 | Fedeltà neurale: quanto fedelmente si trasmettono i pesi del cervello (std di mutazione 0,18–0,42 secondo la formula del catalogo (il testo diceva 0,12–0,42: incoerente)). | brain.ts: std di mutazione = 0,3×(1,4−0,8·s) nella nascita; organism.ts: upkeep |

I 13 tratti storici sono nel registro con gli intervalli identici a `TRAIT_RANGES` e peso 1.

## 3. Ereditarietà, mutazione, fondatori
- Tratti storici: invariati (`inheritGenome`, `cloneWithMutation`, stesso flusso casuale della v1.10).
- Geni estesi (`inheritExt`): media dei valori effettivi dei genitori (mancante = predefinito), poi mutazione per gene con
  probabilità 15% e σ = 4% dell'intervallo, riportata nell'intervallo (`mutateGeneValue`).
- Fondatori (`founderExt`): predefinito ± 40% di mezzo intervallo, dentro l'intervallo.
- **Generatore separato** (`deriveGeneRandom`): i geni estesi non consumano numeri dal generatore del mondo.
  Con `enableAdvancedGenome: false` il mondo è **identico bit per bit** alla v1.10 (test con impronte di riferimento).
- Il cervello eredita con la deviazione standard del gene COG-02 (media dei genitori); il suo flusso casuale è quello di prima.

## 4. Espressione (formule, dal catalogo)
`phenotypeOf(genoma)` (puro, in cache): fattori derivati usati dai punti di aggancio. Senza `ext` vale `DEFAULT_PHENOTYPE`
(identico alla v1.10). Costi: `upkeepExtra = Σ coefficiente × (valore − predefinito)` in energia per tick, sommato al
mantenimento (minimo metà del mantenimento base). Dove agisce: `organism.ts` (mantenimento, costo di movimento LOC-01,
costo della carnivoria ECO-02), `feeding.ts` (digestione FIS-02, tetto FIS-01, peso di domanda ECO-01), `predation.ts`
(corazza, corporatura, scatto con costo energetico, digestione della carne, tetto), `movement.ts` (penalità di velocità),
`collision.ts` (raggio), `behavior.ts` (paura, minaccia, memoria, gruppo, energia relativa al tetto, durata memoria),
`environment.ts` (pelo, termoregolazione, idratazione, robustezza stagionale, quota), `reproduction.ts` (investimento,
maturità, fedeltà neurale), `brain.ts` (deviazione di mutazione come parametro).

## 5. Distanza genetica
`d(a,b) = sqrt( Σ w_i·Δn_i² / Σ w_i )` su tutto il registro (formula di Vibe), Δn normalizzato sull'intervallo, gene mancante =
predefinito. Sta in [0,1], simmetrica, zero per genomi uguali. `geneticDistance` usa questa formula se almeno uno dei due
genomi ha `ext`, altrimenti **la formula esatta della v1.10** (indispensabile perché i mondi senza geni estesi restino identici).
Soglie **non modificate**: compatibilità 0,16, speciazione 0,26.

**Effetto misurato (importante).** A geni estesi uguali, la distanza dei 13 tratti si riduce di `sqrt(13/ΣW)` = 0,744 (ΣW = 23,5).
Le soglie valgono quindi come ≈0,215 e ≈0,35 in termini della v1.10: accoppiamento tra popolazioni divergenti più facile,
speciazione più rara. Lo mostra anche l'esperimento (distanza media iniziale a parità di fondatori: 0,397 baseline contro 0,306 v1.11;
specie esistite a 4.000 tick: 3,4 in media in baseline contro 2,0 v1.11 e 1,4 nel controllo a geni inerti). **Da ricalibrare nella v1.12.0.**

## 6. Migrazione e salvataggi
`migrateGenome(raw, fromVersion)` / `migrateSnapshot(snapshot)`: v1 → v2, geni estesi mancanti = predefinito, tratti storici
intatti (clamp difensivo), NaN/Infinity/fuori range → predefinito/clamp con una issue, chiavi sconosciute (anche tratti storici
messi per errore in `ext`) conservate e ignorate, `null`/vuoto = tutto predefinito, mai eccezioni, idempotente, senza
generatore casuale. Il caricamento di un salvataggio senza `genomeVersion` migra tutti i genomi; con `advancedGenome: false`
i genomi non si toccano. Verificato: salvataggio v1.10 sintetico caricabile e prosecuzione, roundtrip stabile, ripresa
identica all'originale.

## 7. Deviazioni dalla specifica (tutte motivate, tutte in costanti nominate)
1. **Valori predefiniti spostati** (dati, non formule), perché il fenotipo di default equivalga alla v1.10 (specifica §7.1: "i
   default sono scelti perché il Phenotype di default sia ~equivalente al comportamento attuale"). Con i predefiniti del
   catalogo e le sue formule solo 3 geni su 14 verificabili erano neutri (per esempio `energyCapFactor` 1,24, `fearGain` 1,175,
   `memoryDecayTicks` 330), e il test `DEFAULT_PHENOTYPE` della suite di Vibe sarebbe fallito. Cambiati: MOR-01 0,3→0; MOR-02 0,1→0;
   LOC-01 0,4→0; LOC-02 0,3→0; PER-01 0,35→0; PER-02 0,35→0; FIS-01 0,4→0; FIS-03 0,4→0; FIS-04 0,4→0; ADA-01 0,3→0; ADA-02 0,3→0;
   ECO-01 0,5→0; ECO-02 0,4→0; REP-01 0,4→4/9; REP-02 0,5→0,6; COG-01 0,4→1/3. Invariati: MOR-03, PER-03, FIS-02, COG-02 (0,5).
   Conseguenza: per i geni a predefinito 0 i fondatori partono solo da valori ≥ 0 (effetto di limite: la media può salire senza selezione; il controllo a geni inerti lo misura).
2. **Costi di mantenimento** misurati rispetto al predefinito (`coefficiente × (valore − predefinito)`), in energia per tick: la specifica non dice se il costo sia assoluto o relativo; "aggiunta a upkeepCost" è stato letto come addizione assoluta.
3. **MOR-02**: la formula del catalogo è troncata ("`… evasion^0 no — additivo puro ma cap totale`") e il cap non è definito. Implementato: corazza additiva alla parentesi (1,15 + evasion + corazza) con **tetto 2,2** (`DEFENSE_BRACKET_CAP`). PROVVISORIO.
4. **ADA-02**: la formula (0,85 + 0,3·a·quota) non è neutra a a = 0. Implementata rinormalizzata: `1 + 0,3·a·quota/0,85`. PROVVISORIO (decisione aperta (a) di Mattia sulla vegetazione di quota).
5. **ECO-01**: riduce il **peso di domanda** (cella e regione) ×(1 − 0,3·g), a guadagno invariato. PROVVISORIO (decisione aperta (b): quota o consumo).
6. **Ordine dei modulatori di nicchia**: robustezza stagionale → pelo → termoregolazione → quota. PROVVISORIO (decisione aperta (c)). Coefficienti del pelo (z ×(1−0,30·pelo) al freddo, ×(1+0,20·pelo) al caldo), ampiezza del raggio di MOR-03 (±15%) e del risparmio di LOC-01 (−40%) scelti qui: il catalogo non li fissa.
7. **LOC-02**: lo scatto costa 6·scatto energia a ogni tentativo sia al cacciatore sia alla preda (il catalogo dice "caccia/fuga").
8. **LOC-01**: riduce il termine di velocità del mantenimento (nel codice non esiste un costo di movimento separato; il catalogo chiedeva di verificarlo).
9. **FIS-01**: l'energia in ingresso al cervello è relativa al proprio tetto; `MAX_ENERGY` unificato.
10. **COG-02**: il catalogo dice "0,12–0,42" ma la sua formula `0,3×(1,4−0,8·s)` dà **0,18–0,42**. Implementata la formula.
11. **`inheritGenome` non delega a `inheritGenomeV2`** (la specifica lo chiedeva): resta una funzione a sé, con risultati identici (testato); la V2 la chiama e aggiunge `ext`. Motivo: tenere i flussi casuali separati.
12. **`validateGenome`** restituisce anche `genome` (copia corretta), oltre a `ok` e `issues`.
13. **Opzioni nuove**: `enableAdvancedGenome` (predefinita: attiva) e `enableGeneEffects` (solo esperimenti: geni che ereditano e mutano ma senza effetto, per separare selezione e deriva).

## 8. Incoerenze della specifica e della suite di Vibe da risolvere con Vibe
- `socialTolerance` (chiave del catalogo) contiene "social": il test "nessun gene comportamentale diretto" cerca `/social/` e fallisce sul catalogo stesso. La guardia della specifica §2 (`aggression|sociality|exploration|curiosity`) non lo colpisce.
- `movementCostFactor` (campo del fenotipo nella specifica §4) contiene "move": il test PER-03 cerca `/move/` nei campi e fallisce sulla specifica stessa.
- Tre test finiscono con `expect(true).toBe(true)` (ereditarietà identica alla v1.10, costo della carnivoria, soglie) e uno controlla solo una costante: passano a prescindere. Il primo ciclo del test di mutazione non fa nulla. Test che mettono tratti storici (`evasion`, `carnivory`) dentro `ext`.
- "Invariante per diluizione" (specifica §5): una formula normalizzata sulla somma dei pesi non è invariante all'aggiunta di geni identici (la distanza scende); il test passa perché verifica un'altra cosa.
- Catalogo: i predefiniti proposti non rendono neutre le sue formule (§7.1 di questo documento).
