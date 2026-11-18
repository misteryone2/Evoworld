# E2.2.1 — Protocollo statistico di hardening inferenziale

## 1. Scopo e confini

Questo protocollo irrigidisce l'inferenza della fase E2.2 **senza rieseguire o modificare** le 120 simulazioni biologiche originali. L'unità statistica resta la corsa/seed, non il tick. Nessuna regola di simulazione, genetica, selezione, metabolismo, predazione, mortalità, comportamento, rendering, G1/G1-b, G2, `lib/anatomy/**`, `lib/phenotype/**`, `tools/e1/**`, `tests/e1/**`, dataset E2.2 originali o dati grezzi viene toccata.

Gli artefatti prodotti sono aggiuntivi:

- `docs/research/e2/E2_2_1_STATISTICAL_PROTOCOL.md` (questo file);
- `docs/research/e2/E2_2_1_INFERENTIAL_HARDENING_REPORT.md`;
- `docs/research/e2/datasets/e2.2-foodweb-inferential-hardening.json.gz`;
- `docs/research/e2/datasets/e2.2-foodweb-inferential-hardening.manifest.json`.

## 2. Metodo di base mantenuto

Il metodo P1 resta invariato nei suoi elementi essenziali:

1. detrendimento lineare di ciascuna serie;
2. IAAFT a **lunghezza esatta** con DFT Cooley–Tukey/Rader, senza padding né troncamento;
3. surrogati indipendenti per le due serie, fasi casuali indipendenti;
4. statistica `max|r|` sull'insieme dei lag accettati;
5. p-value empiricale a due code `p = (1 + #{nullMaxAbs >= observedMaxAbs}) / (B + 1)`;
6. combinazione di Fisher tra corse/seed valutabili;
7. overlap minimo efficace `max(30, ceil(0.25 * N_shorter))`, quindi `68` per `N=271`;
8. tolleranza di convergenza IAAFT `1e-3`, budget `12` per i report e `24` nella sensitivity.

Non vengono introdotti padding, troncamenti, ritagli di lag né cambi di statistica per rendere significativi i dati correnti.

### 2.1 Perché `max|r|`

La ricerca del picco su più lag richiede correzione della multiplicità implicita. Usare `r(lag=0)` o un singolo lag prescelto cambierebbe la domanda scientifica e non correggerebbe la data snooping. La statistica `max|r|` mantiene la famiglia dei lag dentro il nullo surrogato.

## 3. QA per singolo surrogato

Ogni surrogato genera un record `IAAFTSurrogateQaRecord` con:

- `n`, numero di iterazioni usate, convergenza bool;
- errore spettrale finale e migliore;
- finitezza, lunghezza esatta, conservazione esatta della distribuzione empirica (`max |sorted| <= 1e-9`);
- autocorrelazioni a lag `1,2,3,5,10,20` (dove disponibili), con valore osservato, valore surrogato ed errore assoluto;
- validità numerica e motivi espliciti di invalidazione.

La conservazione dell'autocorrelazione IAAFT è una **proprietà d'insieme**: il gate usa l'errore massimo tra lag della media ensemble dei surrogati accettati. L'autocorrelazione del singolo surrogato resta diagnostica e non viene usata per scartare repliche.

### 3.1 Soglie pre-registrate e sensitivity

Soglia spettrale: `0.05`.  
Errore ACF ensemble: `0.15`.  
Distribuzione empirica: `1e-9`.  
Serie degenere: `uniqueValues < 2` o deviazione standard zero.  
Serie quasi costante: `relativeStd <= 1e-9`.  
Molti ties: warning a `tieFraction > 0.5`.  
Surrogati validi minimi: `max(30, ceil(0.5 B))`; per `B=199` è `100`, per `B=49` è `30`.

La sensitivity (`E2_2_1` QA sweep) ha mostrato che:

- il lag aggiuntivo `floor(N/4)` era troppo rumoroso ed è stato rimosso, lasciando il lag fisso 20;
- non esiste una soglia spettrale che porti l'errore ACF ensemble sotto `0.15` in tutte le celle testate;
- con soglia `0.05`, i registri ad alta autocorrelazione (`phi >= 0.9`) possono presentare errore ACF ensemble molto oltre il limite.

Di conseguenza la regola è **degradare a `NON_VALUTABILE`**, non rilassare la soglia. La convergenza stretta (`error <= 1e-3`) è misurata e registrata ma non è richiesta per la validità se l'accuratezza limitata supera il QA: surrogati non convergenti accettati vengono conteggiati esplicitamente (`nonConvergedAccepted`).

### 3.2 Gestione esplicita dei casi patologici

| Caso | Azione |
|---|---|
| non convergente | conservato se supera il QA; conteggiato |
| errore spettrale > 0.05 | surrogato invalido, motivo registrato |
| ACF ensemble > 0.15 | test `NON_VALUTABILE` |
| non finito | surrogato/test invalido, mai convertito in p-value |
| degenere/quasi costante | test `NON_VALUTABILE` prima di generare surrogati |
| molti tie | warning esplicito; la cella resta valutabile se supera il QA |
| surrogati validi < minimo | test `NON_VALUTABILE` |
| correlazione osservata non stimabile | test `NON_VALUTABILE` |

## 4. Calibrazione Monte Carlo del FPR

### 4.1 Disegno

- almeno **1000 dataset indipendenti per cella**;
- `B=49` surrogati per test, `iterations=12`; scelta di runtime dichiarata come compromesso: `B=49` non è equivalente a `B=199`;
- `alpha=0.05`;
- griglia principale: AR(1) Gaussiano indipendente con `phi = 0, 0.25, 0.65, 0.90, 0.95` e `N = 100, 160, 271, 512`;
- casi aggiuntivi: `N=1024` nella sensitivity QA, autocorrelazioni X/Y diverse, Gaussiane/non Gaussiane (esponenziale e discreta), tie massicci, serie costanti/quasi costanti/tied/binary;
- 9 chunk deterministici, ciascuno con seed fissi;
- unità di inference: dataset sintetico indipendente, mai tick.

### 4.2 Limiti di accettazione fissati prima della calibrazione

| Metrica | Limite |
|---|---|
| FPR puntuale | `<= 0.065` |
| limite superiore Wilson CI95 | `<= 0.075` |
| media dei p-value | `0.45 – 0.55` |
| distanza KS | `<= 0.045` |
| tasso `NON_VALUTABILE` | `<= 0.05` |

La distanza KS è calcolata rispetto alla **griglia discreta esatta** `(1+h)/(B+1)`, non a una `U(0,1)` continua: con `B=49` i p-value non possono assumere valori continui. Il limite resta invariato; solo il nullo di riferimento è stato corretto dopo aver diagnosticato il falso allarme nella prima esecuzione `main-0`.

Le celle con alta autocorrelazione che non soddisfano il QA vengono classificate `DEGRADED_NON_VALUTABILE` e separate dalla calibrazione applicabile. Non vengono fatte passare rilassando le soglie.

## 5. Confronti multipli

### 5.1 Famiglia primaria (pre-dichiarata)

- coppie: `herbivore_carnivore`, `herbivore_kills`;
- scenario: S06;
- blocchi: main, seed, duration, sampling;
- metodo: **Holm FWER**, `alpha=0.05`;
- motivazione: le due ipotesi sono le domande confermate dell'analisi P1 e i quattro blocchi riutilizzano le stesse 120 corse, quindi non sono repliche indipendenti.

### 5.2 Famiglia esplorativa

- coppie: `carnivore_kills`, `vegetation_herbivore`, `vegetation_carnivore`;
- scenari e blocchi come sopra;
- metodo: **BH FDR**, `alpha=0.05`;
- sensibilità: **Benjamini–Yekutieli** riportata per ogni voce.

Vengono registrati p grezzo, p aggiustato, p BY, alpha, verdict prima e dopo la correzione e le significatività perse. La direzione descrittiva resta separata dalla significatività.

## 6. Validazione sintetica

La validazione usa processi con ground truth noto, mai dati biologici:

- **null**: indipendenza cross-serie con diversa autocorrelazione;
- **alternativa**: `b[t] = a[t-lag]` con lag 3 e 7 e segno positivo/negativo;
- **stress**: trend comune, rumore comune simultaneo, regime shift, molti tie, serie costante e quasi costante.

Per ogni scenario vengono riportati FPR o potenza, CI binomiale di Wilson, distribuzione dei p-value, accuratezza del lag, accuratezza della direzione, tasso `NON_VALUTABILE` e robustezza split-half. I risultati sintetici sono una validazione del metodo e **non entrano** nelle conclusioni biologiche.

## 7. Verdict e inferenza causale

Le seguenti dimensioni restano distinte:

1. **descrizione** (`CONSISTENTE`, `PARZIALE`, `INCONSISTENTE`): concordanza empirica tra seed;
2. **significatività statistica** (`SIGNIFICATIVO`, `NON_SIGNIFICATIVO`, `NON_VALUTABILE`): p aggiustato e QA;
3. **direzione della sequenzialità** (`POSITIVA`, `NEGATIVA`, `MISTA`, `ASSENTE`): segno del picco detrended e segno del lag;
4. **verdict finale**: evidenza positiva/negativa, indicativo positivo/negativo/misto, non dimostrato, non valutabile;
5. **causalità**: sempre `NON_IDENTIFICABILE` nei dati osservazionali E2.2.

Un verdetto di evidenza richiede significatività aggiustata **e** concordanza descrittiva `CONSISTENTE` **e** direzione non mista/assente. La significatività da sola non basta.

## 8. Riproducibilità

Tutti i timestamp degli script sono fissati tramite variabili d'ambiente. I manifest usano `stableStringify`, SHA-256 del payload non compresso e SHA-256 dell'archivio gzip. Le versioni Node/V8 sono registrate. Gli archivi e i manifest precedenti vengono verificati per hash prima di scrivere il nuovo dataset.

Gli hash dei dati grezzi e dei dataset preesistenti sono fissati negli script e controllati a runtime; qualsiasi modifica fa fallire la generazione invece di sovrascrivere l'originale.
