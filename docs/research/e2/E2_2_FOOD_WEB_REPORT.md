# E2.2 — Food Web Dynamics Report

**Repository:** `misteryone2/Evoworld`  
**Branch:** `research/e2-ecosystem-dynamics`  
**Base:** `main` @ `d330c12f345ab26ab7405b908c729e2e2f6bcc22` — nessun merge in `main`, nessuna PR aperta  
**Commit metodo review:** `26983e352b39611137cc00268496cbb7be0f666f`  
**Dataset corretto:** [e2.2-foodweb-review.json.gz](datasets/e2.2-foodweb-review.json.gz) · [manifest](datasets/e2.2-foodweb-review.manifest.json)  
**Hash dataset corretto:** `payloadSha256=14798d7a2188e3cf5aafdac9e82d75584ef07961791e8fb64ab93b68cd05475f`, `archiveSha256=47298821e188c53f6e677a69d336006193d48e5955b282ef4674d7aa39b8ef84`  
**Dataset originale (immutato):** [e2.2-foodweb.json.gz](datasets/e2.2-foodweb.json.gz) · [manifest](datasets/e2.2-foodweb.manifest.json)  
**Hash dataset originale:** `payloadSha256=755d2a4f778ba8c90243daee3dd01e63530380567ac36875d8ecc281dc5e772d`, `archiveSha256=d407c8d3a906ff1d0909681f95a9f441173f502eb61a3b39970a82ef17f7cb79`  
**Provenance review:** `codeCommit=26983e352b39611137cc00268496cbb7be0f666f`, `workingTreeDirty=false`, `executedAt=2026-11-18T13:30:00.000Z` (timestamp fissato), `sourceSha256=2360a0d61b9127df36d67a379e3b723d4d4c6f9954608183d8c6d5b6800a111a`, `e1SourceSha256=24dec478620f48fa26633227e9652067653277dd652dbbeca9d110894c2851fe`  
**Runtime:** Node `v22.14.0`, V8 `12.4.254.21-node.22`  
**Audit:** [E2_2_FOOD_WEB_AUDIT.md](E2_2_FOOD_WEB_AUDIT.md) · **Matrice:** [E2_2_EXPERIMENTAL_MATRIX.md](E2_2_EXPERIMENTAL_MATRIX.md) · **Correzioni:** [E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md](E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md)

---

## 1. Sintesi della review

Le 120 corse originali non sono state rieseguite e i quattro blocchi grezzi sono byte-identici a quelli usati nel report iniziale. Sono state invece rigenerate tutte le analisi con un protocollo che separa descrizione, inferenza statistica, sequenzialità e causalità.

Il risultato principale cambia **statuto statistico**, non direzione descrittiva:

| Coppia in S06 | Prima della review | Dopo la review |
|---|---|---|
| tratto erbivoro → tratto carnivoro | `NON_DIMOSTRATO` per soglia `|r|` e concordanza seed | **`NON_DIMOSTRATO`**: il test IAAFT è significante, ma la direzione del lag è instabile (−20,83…+2,50 tick; 1–3/12 seed con lag positivo) |
| tratto erbivoro → kills registrate | “EVIDENZA” da 12/12 seed e `|r|≈0,82` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** con IAAFT Fisher `p` dall’ordine di `1e-40` a `1e-36`, direzione positiva in 12/12 seed in tutti i blocchi; **non causalità** |
| tratto carnivoro → kills | `INDICATIVO` | **`INDICATIVO_POSITIVO`**: dipendenza cross-serie significante, ma lag non consistente (6/12 positivi, 5/12 negativi, 1/12 nullo) |
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
- Spettro di ampiezza preservato approssimativamente ⇒ autocorrelazione approssimativamente preservata.
- Rank-remapping ⇒ distribuzione empirica preservata esattamente.
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
| A primario | erbivoro → carnivoro | −1,67 | 0,808 | 1/12 | `4,36722e−36` | `NON_DIMOSTRATO` |
| A primario | **erbivoro → kills** | **+10,00** | 0,819 | **12/12** | `2,29569e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |
| B seed | erbivoro → carnivoro | −20,83 | 0,776 | 1/12 | `6,54386e−36` | `NON_DIMOSTRATO` |
| B seed | **erbivoro → kills** | **+11,67** | 0,783 | **12/12** | `2,29569e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |
| C durata | erbivoro → carnivoro | +2,50 | 0,977 | 3/12 | `2,29569e−40` | `NON_DIMOSTRATO` |
| C durata | **erbivoro → kills** | **+10,00** | 0,836 | **12/12** | `8,14798e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |
| D campionamento | erbivoro → carnivoro | −2,50 | 0,805 | 1/12 | `1,29417e−35` | `NON_DIMOSTRATO` |
| D campionamento | **erbivoro → kills** | **+5,83** | 0,740 | **12/12** | `2,29569e−40` | **`EVIDENZA_SEQUENZIALITA_POSITIVA`** |

Il test IAAFT dichiara dipendenza cross-serie significante anche per la coppia erbivoro→carnivoro, ma la direzione descrittiva non è ripetibile: il lag medio cambi segno tra blocchi. Per questo il verdetto resta `NON_DIMOSTRATO`. La significatività statistica non implica sequenzialità stabile né causalità.

### 3.2 Altre coppie nel blocco A

| Coppia | Lag medio | `r` medio | Fisher p | Verdetto |
|---|---:|---:|---:|---|
| carnivoro → kills | 0,00 | 0,694 | `1,13447e−37` | `INDICATIVO_POSITIVO` |
| vegetazione → erbivoro | −38,33 | 0,027 | `0,0301601` | `NON_DIMOSTRATO` |
| vegetazione → carnivoro | +35,83 | −0,036 | `1,87177e−08` | `NON_DIMOSTRATO` |

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

| Controllo | Esito |
|---|---|
| Quattro blocchi grezzi | SHA-256 invarianti; `review.sourceBlockSha256` e hash stabili dei `results` corrispondono |
| Archivio originale | `payloadSha256` e `archiveSha256` invarianti e verificati |
| Sequenzialità positiva sintetica | `EVIDENZA_SEQUENZIALITA_POSITIVA`, Fisher `p=8,35464e−34`, 12/12 seed |
| Correlazione negativa forte sintetica | `EVIDENZA_SEQUENZIALITA_NEGATIVA`, 0 seed con `r>0,lag>0`, 12/12 con `r<0,lag>0`; mai classificata positiva |
| Serie sincrone | `NON_DIMOSTRATO`, statistica `NON_VALUTABILE`, 12/12 lag nulli |
| Calibrazione nullo | 120 test su AR(1) indipendenti, 99 surrogati ciascuno: tasso falsi positivi 0,0583; `p` medio 0,524 |
| IAAFT su serie sintetica | errore distribuzione 0; errore autocorrelazione lag-1 0,0084; `R²` trend residuo max 0,0093 |
| IAAFT su serie reali | distribuzione preservata esattamente; errore autocorrelazione lag-1 fino a 0,139; `R²` trend residuo medio 0,0212, max 0,1165 |
| Coerenza report | ogni verdetto `EVIDENZA_*` ha statistica `SIGNIFICATIVO` e direzione `POSITIVA`/`NEGATIVA`; causalità sempre `NON_IDENTIFICABILE` |

L’errore di autocorrelazione sulle serie reali è una limitazione dichiarata: IAAFT preserva lo spettro solo approssimativamente dopo 12 iterazioni. L’interpretazione resta valida come test contro surrogati con distribuzione identica e struttura temporale approssimativamente conservata, non come modello perfetto della dinamica.

---

## 5. Sensibilità

| Asse | Esito corretto |
|---|---|
| Seed A vs B | Classi e direzione dell’ipotesi primaria invariate; magnitudini di kills/tratti cambiano sensibilmente |
| Durata A vs C | La sequenzialità erbivori→kills resta positiva; il lag erbivoro→carnivoro cambia segno (−1,67 → +2,50) |
| Troncamento A→900 | Riproduce esattamente C su tutte le metriche e classificazioni (`true`) |
| Cadenza 10/5/20 | Il lag erbivori→kills passa da 10,00 a 5,83 tick; il segno resta positivo. Le stime numeriche sono limitate dalla risoluzione della griglia |

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

Consegna completata su `research/e2-ecosystem-dynamics`: audit, matrice, correzioni, strumenti, test, 120 corse originali, analisi rigenerate, sensibilità, validazione, dataset `e2.2-foodweb-review`, manifest e report. **Nessun merge in `main`, nessuna PR aperta. Il lavoro si ferma qui in attesa di nuova review indipendente prima di E2.3.**

---

## 9. Riproduzione

Vedere [E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md](E2_2_FOOD_WEB_REVIEW_CORRECTIONS.md) per env, comandi, stdout essenziale ed exit code di ogni passaggio. I blocchi grezzi originali restano disponibili in `C:\Users\matti\AppData\Local\Temp\opencode\e2.2-results\`; il commit `26983e352b39611137cc00268496cbb7be0f666f` contiene il codice usato per rigenerare le analisi.
