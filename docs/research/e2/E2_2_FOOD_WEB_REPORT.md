# E2.2 — Food Web Dynamics Report

**Repository:** `misteryone2/Evoworld`  
**Branch:** `research/e2-ecosystem-dynamics`  
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22` — nessun merge in `main`, nessuna PR aperta  
**Commit codice finale (P1):** `23778c4e8a29f0bf2e2d968a9322b50b5907f2c8` — succede a `26983e352b39611137cc00268496cbb7be0f666f`, ora superato  
**Dataset corretto:** [e2.2-foodweb-iaaft-review.json.gz](datasets/e2.2-foodweb-iaaft-review.json.gz) · [manifest](datasets/e2.2-foodweb-iaaft-review.manifest.json)  
**Hash dataset corretto:** `payloadSha256=d65c1dc8fe33025b991d1b577ccba13adfd9c77d492336410a0903ad1f538f03`, `archiveSha256=828189b5d9a033ae342f1e534e758ad768292fb0b3fb5d5e81f20c27225c60c4`, `manifestSha256=df1f8f9c1b2895ea15643eba9d9489a50e4e7532107f0b6ec618376b83a1eb8e`  
**Dataset originale (immutato):** [e2.2-foodweb.json.gz](datasets/e2.2-foodweb.json.gz) · [manifest](datasets/e2.2-foodweb.manifest.json)  
**Hash dataset originale:** `payloadSha256=755d2a4f778ba8c90243daee3dd01e63530380567ac36875d8ecc281dc5e772d`, `archiveSha256=d407c8d3a906ff1d0909681f95a9f441173f502eb61a3b39970a82ef17f7cb79`  
**Provenance review:** `codeCommit=23778c4e8a29f0bf2e2d968a9322b50b5907f2c8`, `workingTreeDirty=false`, `executedAt=2026-11-18T14:40:00.000Z` (timestamp fissato), `sourceSha256=f1473528df31677d242cfc374300b2380f090ff08e3eafb4841d96079a645c6c`, `e1SourceSha256=24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe`  
**Runtime:** Node `v22.14.0`, V8 `12.4.254.21-node.22`  
**Audit:** [E2_2_FOOD_WEB_AUDIT.md](E2_2_FOOD_WEB_AUDIT.md) · **Matrice:** [E2_2_EXPERIMENTAL_MATRIX.md](E2_2_EXPERIMENTAL_MATRIX.md) · **Correzioni:** [E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md](E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md)

---

## 1. Sintesi della review

Le 120 corse originali non sono state rieseguite e i quattro blocchi grezzi sono byte-identici a quelli usati nel report iniziale. Sono state rigenerate tutte le analisi con un protocollo che separa descrizione, inferenza statistica, sequenzialità e causalità. La correzione P1 ha inoltre sostituito la FFT con padding/troncamento usata dalla IAAFT con una trasformata alla lunghezza esatta; il confronto prima/dopo mostra **gli stessi verdetti**, con p-value surrogati aggiornati.

Il risultato principale cambia **statuto statistico**, non direzione descrittiva:

| Coppia in S06 | Prima della review | Dopo la review P1 |
|---|---|---|
| tratto erbivoro → tratto carnivoro | `NON_DIMOSTRATO` per soglia `|r|` e concordanza seed | **`NON_DIMOSTRATO`**: il test IAAFT è significante, ma la direzione del lag è instabile (−20,83…+2,50 tick; 1–3/12 seed con lag positivo) |
| tratto erbivoro → kills registrate | “EVIDENZA” da 12/12 seed e `|r|≈0,82` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** con IAAFT Fisher `p` nell’intervallo `2,3e−40…8,1e−40`, direzione positiva in 12/12 seed in tutti i blocchi; **non causalità** |
| tratto carnivoro → kills | `INDICATIVO` | **`INDICATIVO_POSITIVO`** nei blocchi con direzione consistente; il blocco C durata resta `NON_DIMOSTRATO` |
| vegetazione → tratti | `NON_DIMOSTRATO` | **`NON_DIMOSTRATO`**: alcune `p` sono <0,05, ma `|r|` al picco ≈0,03 e la direzione non è consistente; la significatività da sola non basta |

La corretta interpretazione è: **le uccisioni registrate seguono l’abbondanza del tratto erbivoro con un ritardo breve e statisticamente distinguibile da surrogati temporali**, mentre **non è possibile affermare che il tratto carnivoro segua il tratto erbivoro**. Nessun risultato identifica un ruolo trofico individuale o una relazione causale.

Conseguenze del review:

- **Confermati:** integrità delle 120 corse, kills nulle in S04/S05, coesistenza in S06, determinismo del troncamento A→900, identità strutturale delle frazioni, direzione descrittiva positiva erbivori→kills.
- **Degradati/riformulati:** qualunque significatività derivata da `|r| >= 0,5`, conteggio di seed o tick trattati come repliche indipendenti; la sequenzialità erbivori→kills ora richiede il test surrogato con correzione del massimo su tutti i lag.
- **Respinti:** lettura causale dei lag, equiparazione di correlazione negativa forte e sequenzialità positiva, uso dei tratti come ruoli trofici.

Nessuna modifica ha interessato `simulation/**`, geni, mutazioni, ereditarietà, selezione, riproduzione, metabolismo, predazione, renderer, G1/G1-b/G2, `lib/anatomy/**`, `lib/phenotype/**`, `tools/e1/**`, `tests/e1/**` o formati di salvataggio.

---

## 2. Protocollo statistico corretto

### 2.1 Quattro livelli separati

1. **Descrittivo:** segno di `r`, segno del lag, conteggio di seed. Non produce significatività.
2. **Statistico:** test surrogato IAAFT per corsa, con statistica test `max|r|` su tutti i lag accettati; p-value `p=(1+#{nullMaxAbs≥observedMaxAbs})/(B+1)`; combinazione Fisher cross-seed.
3. **Sequenzialità:** verdetto esplicito per segno (`POSITIVA`, `NEGATIVA`, `MISTA`, `ASSENTE`). Una correlazione negativa forte non può diventare evidenza positiva.
4. **Causalità:** sempre `NON_IDENTIFICABILE`: mancano manipolazione delle popolazioni e ID predatore/preda.

`crossCorrelation(a,b,lag)` accoppia `a[t]` con `b[t+lag]`: `lag>0` significa che `b` è osservato dopo `a`.

### 2.2 Modello nullo

- Detrendimento lineare di entrambe le serie; IAAFT applicata ai residui.
- Fasi casuali indipendenti per le due serie: distrugge la dipendenza cross-serie.
- DFT/anti-DFT **alla lunghezza esatta** `N`: nessun padding a potenze di due e nessun troncamento. Radix-2 per potenze di due, matrice diretta cache per `N<=600`, Rader per primi maggiori, Cooley–Tukey per composti maggiori.
- Rank-remapping di esattamente `N` valori ⇒ distribuzione empirica preservata esattamente.
- Convergenza misurata sull’errore spettrale normalizzato completo dopo il rank-remapping: `E=sqrt(Σ(|Xs|−|X|)²/Σ|X|²)`, tolleranza `1e-3`, budget `12` nelle analisi. Iterazioni usate ed errori finali sono registrati in `SurrogateNullTest.convergence`; la tolleranza non è raggiunta nei casi non degenerati entro il budget.
- La preservazione approssimativa dello spettro non viene dedotta dall’autocorrelazione lag-1: la validazione misura l’errore sull’intero spettro e le autocorrelazioni ai lag 1, 2, 3, 5.
- Limitazioni: stazionarietà dei residui, struttura lineare di second’ordine, nullo “sharp”, nessuna inferenza causale.

### 2.3 Diagnostica della ricerca sui lag

| Quantità | Valore |
|---|---:|
| Lag nominali provati (`2·200+1`) | 401 |
| Lag sulla griglia con `sampleEvery=10` | 41 |
| Lag senza alcuna coppia | 360 |
| Lag accettati | 41 |
| Soglia minima di sovrapposizione richiesta | `max(30, ceil(0,25·271)) = 68` osservazioni |
| Coppie minime sulla griglia | 251 |
| Coppie ai lag estremi (±200 tick) | 251 per estremo |
| Perdita di coppie agli estremi | `1−251/271 = 0,073801` (≈7,38%) |

La statistica surrogata usa il massimo su tutti i 41 lag accettati, quindi corregge la selezione del picco osservato.

---

## 3. Risultati corretti

### 3.1 S06, per blocco

`p` è il p-value Fisher combinato dei test IAAFT per seed. `r` e lag sono medie cross-seed del picco detrendizzato.

| Blocco | Coppia | Lag medio (tick) | `r` medio | Seed `r>0,lag>0` | Fisher p | Verdetto |
|---|---|---:|---:|---:|---:|---|
| A primario | erbivoro → carnivoro | −1,67 | 0,808 | 1/12 | `2,4291e−31` | `NON_DIMOSTRATO` |
| A primario | **erbivoro → kills** | **+10,00** | 0,819 | **12/12** | `2,29569e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |
| B seed | erbivoro → carnivoro | −20,83 | 0,776 | 1/12 | `2,60115e−35` | `NON_DIMOSTRATO` |
| B seed | **erbivoro → kills** | **+11,67** | 0,783 | **12/12** | `2,29569e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |
| C durata | erbivoro → carnivoro | +2,50 | 0,977 | 3/12 | `2,29569e−40` | `NON_DIMOSTRATO` |
| C durata | **erbivoro → kills** | **+10,00** | 0,836 | **12/12** | `8,14798e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |
| D campionamento | erbivoro → carnivoro | −2,50 | 0,805 | 1/12 | `7,06857e−31` | `NON_DIMOSTRATO` |
| D campionamento | **erbivoro → kills** | **+5,83** | 0,740 | **12/12** | `2,29569e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |

Il test IAAFT dichiara dipendenza cross-serie significante anche per la coppia erbivoro→carnivoro, ma la direzione descrittiva non è ripetibile: il lag medio cambi segno tra blocchi. Per questo il verdetto resta `NON_DIMOSTRATO`. La significatività statistica non implica sequenzialità stabile né causalità.

### 3.2 Altre coppie nel blocco A

| Coppia | Lag medio | `r` medio | Fisher p | Verdetto |
|---|---:|---:|---:|---|
| carnivoro → kills | 0,00 | 0,694 | `1,08592e−36` | `INDICATIVO_POSITIVO` |
| vegetazione → erbivoro | −38,33 | 0,027 | `0,0769745` | `NON_DIMOSTRATO` |
| vegetazione → carnivoro | +35,83 | −0,036 | `5,62291e−05` | `NON_DIMOSTRATO` |

Questi casi mostrano perché la direzione è valutata separatamente dalla significatività: `p<0,05` con `|r|≈0,03` e lag erratico non costituisce sequenzialità.

### 3.3 Dati descrittivi invariati

| Scenario | Kills cumulativi medi | Tasso kills/tick | Conteggio erbivoro | Conteggio carnivoro | Coesistenza media |
|---|---:|---:|---:|---:|---:|
| S04 erbivoro | 0 ± 0 | 0 | 73,55 | 0 | 0 |
| S05 carnivoro | 0 ± 0 | 0 | 0 | 49,71 | 0 |
| S06 misto | 54,67 ± 8,35 | 0,0202 | 15,46 | 51,90 | 0,9963 |

S04 e S05 hanno 0 kills in 36/36 corse ciascuno; S06 ne produce 49–70 in media. La coesistenza media in S06 resta 0,9686–1,000 con 12/12 seed oltre il 50%. L’identità `herbivoreFraction = 1 − carnivoreFraction` rende la correlazione delle frazioni esattamente −1 per costruzione: non è evidenza trofica.

---

## 4. Validazione

La validazione estesa usa schema `evoworld.e2.foodweb-review-validation.v2`; l'output è `e2.2-iaaft-validation.json` con SHA-256 `f4678ffa0649708296d3e15407694b1025bf2cd6534da5371d35767ce41f35a6`.

| Controllo | Esito |
|---|---|
| Quattro blocchi grezzi | SHA-256 invarianti; `review.sourceBlockSha256` e hash stabili dei `results` corrispondono |
| Archivio originale | `payloadSha256` e `archiveSha256` invarianti e verificati |
| Sequenzialità positiva sintetica | `EVIDENZA_SEQUENZIALITA_POSITIVA`, Fisher `p=8,35464e−34`, 12/12 seed |
| Correlazione negativa forte sintetica | `EVIDENZA_SEQUENZIALITA_NEGATIVA`, 0 seed con `r>0,lag>0`, 12/12 con `r<0,lag>0`; mai classificata positiva |
| Serie sincrone | `NON_DIMOSTRATO`, statistica `NON_VALUTABILE`, 12/12 lag nulli |
| Lunghezze obbligatorie | `N=100/160/271/256/512`: errore spettrale max `0,046203/0,026085/0,023075/0,019145/0,009406`; distribuzione esatta; tutti finiti e deterministici; 24 iterazioni |
| Serie degenerati | costante, quasi costante e con valori ripetuti: finiti, distribuzione esatta, errore spettrale `0 / 2,66e−16 / 0,192280` |
| Calibrazione nullo | AR(1) indipendenti, `phi=0/0,25/0,65/0,9`, `N=100/160/271`, 32 test × 49 surrogati per cella: FPR medio `0,033854`; `p` medio `0,506667` |
| Potenza a lag noto | 4 configurazioni, 8/8 lag positivi ciascuna; Fisher `p=5,4987e−19` |
| Iterazioni | errore spettrale medio `0,136833` a 1 → `0,020112` a 24; i p-value nulli restano `0,48–0,50` |
| Surrogati | `B=19/49/99/199` → p `0,45/0,50/0,46/0,44` |
| Report reali | H→C `NON_DIMOSTRATO` 4/4; H→kills `EVIDENZA_SEQUENZIALITA_POSITIVA` 4/4; tutti i 50 verdict across scenarios invarianti rispetto al report precedente |
| Coerenza report | ogni verdetto `EVIDENZA_*` ha statistica `SIGNIFICATIVO` e direzione `POSITIVA`/`NEGATIVA`; causalità sempre `NON_IDENTIFICABILE` |

La preservazione spettrale è una misura quantitativa sull'intero spettro, non un'asserzione basata sul solo lag-1. Nelle analisi il budget è 12 iterazioni e la tolleranza `1e-3` non viene raggiunta nei casi non degenerati: i metadata di convergenza vanno riportati insieme ai p-value, non interpretati come prova di convergenza numerica.

---

## 5. Sensibilità

| Asse | Esito corretto |
|---|---|
| Seed A vs B | `classificationMatches=true` per S04, S05, S06; magnitudini di kills/tratti cambiano sensibilmente |
| Durata A vs C | `classificationMatches=true` per S04, S05, S06; la sequenzialità erbivori→kills resta positiva e il lag erbivoro→carnivoro cambia segno (−1,67 → +2,50) |
| Troncamento A→900 | `truncatedPrimaryMatchesGenuineDuration=true`: riproduce esattamente C su tutte le metriche e classificazioni |
| Cadenza 10/5/20 | Il lag erbivoro→carnivoro sulla griglia comune è `−1,6667 / −2,5000 / −3,3333` tick; il lag erbivori→kills passa da 10,00 a 5,83 tick. Il segno resta positivo per H→kills; le stime sono limitate dalla risoluzione della griglia |

Il confronto S06−S04/S05 resta descrittivo e confuso: S06 usa geometria 160×160/180 contro 128×128/150.

---

## 6. Classificazione delle ipotesi

| Ipotesi | Classe review | Base |
|---|---|---|
| H1 — lag positivo erbivori→carnivori | **`NON_DIMOSTRATO`** | Direzione del lag instabile in tutti i blocchi, nonostante dipendenza IAAFT significante |
| H1b — lag positivo erbivori→kills | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** | 12/12 seed in tutti i blocchi + Fisher p < 1e−35 + correzione del massimo sui lag |
| H2 — collasso prede seguito da predatori | **NON DIMOSTRATO / non testabile** | 0 casi di perdita carnivora successiva a perdita erbivora |
| H3 — kills ≈0 in S05 | **EVIDENZA descrittiva** | 0/36 corse; A04 coerente ma non manipolato |
| H4 — persistenza/coesistenza in S06 | **EVIDENZA descrittiva** | 0,9686–1,000; 12/12 seed >50% |
| H5 — robustezza | **PARZIALE** | Direzione H1b stabile; magnitudini e lag H1 non stabili |

---

## 7. Limiti espliciti

1. Tratti ≠ ruoli: le frazioni sono etichette complementari, non osservazioni di chi attacca chi.
2. `predationKills` non è tutta la mortalità; non ci sono ID predatore/preda, tentativi falliti o flusso energetico individuale.
3. `occupiedVegetation` è un proxy su celle occupate, non uno stock globale.
4. I tick non sono repliche indipendenti: l’unità statistica è la corsa/seed.
5. La significatività IAAFT non dimostra causalità; il nullo è sharp e conserva solo struttura lineare di second’ordine.
6. La risoluzione del lag è almeno 5–10 tick; il valore numerico del ritardo non è preciso oltre la cadenza di campionamento.
7. S06 differisce da S04/S05 per geometria e densità: i confronti non isolano la dieta.
8. 2700 tick non escludono cicli più lenti o collassi tardivi.
9. Le anomalie engine note (A04, A05, A08, A10, A12) restano fuori dallo scope E2.2.

---

## 8. Gate e stato

**Gate E2.2 → E2.3:** non inferire assenza di dipendenza trofica dal mancato lag tratto→tratto. Prima di affermazioni ecologiche verificare A04 (immunità apicale) e A01 (bucket non toroidali). E2.3 può procedere sullo studio della competizione, ma non deve usare correlazioni tra tratti come evidenza trofica.

Consegna completata su `research/e2-ecosystem-dynamics`: audit, matrice, correzioni, correzione P1, strumenti, test, 120 corse originali invariate, quattro analisi rigenerate, sensibilità, validazione v2, dataset `e2.2-foodweb-iaaft-review`, manifest e report. **Nessun merge in `main`, nessuna PR aperta. E2.2 non è approvato: il lavoro si ferma in attesa di nuova review indipendente prima di E2.3.**

---

## 9. Riproduzione

Vedere [E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md](E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md) per env, comandi, stdout essenziale ed exit code di ogni passaggio. I blocchi grezzi originali restano disponibili in `C:\Users\matti\AppData\Local\Temp\opencode\e2.2-results\`; il commit `23778c4e8a29f0bf2e2d968a9322b50b5907f2c8` contiene il codice usato per rigenerare le analisi. Il dataset con hash sopraindicati è rigenerato bit-identicamente con `workingTreeDirty=false` e `executedAt=2026-11-18T14:40:00.000Z`.
