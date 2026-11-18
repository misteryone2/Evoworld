# G2 — Report di revisione e hardening (17 novembre 2026)

Revisione tecnica indipendente del codice G2 già presente. Nessuna riscrittura dell'architettura, nessuna nuova funzione biologica, nessun collegamento al renderer, motore biologico intatto. Branch `graphics/g2-anatomy-phenotype`, creato da `origin/main` (`db86444`, stato corrente).

## 1. Git e isolamento
**Perché i file G2 sono su `main`.** Non sono stati scritti da me su `main`: dal mio ambiente non posso fare push e il mio commit (`ed424e1`) esisteva solo in locale. I 19 file G2 sono arrivati su `main` con sette commit "Add files via upload" / "Create assemble.ts" / "Create derive.ts" dell'account `misteryone2` del 17/11, 12:42–12:46: l'upload manuale dal telefono, che di default scrive su `main`. I file su `main` sono byte per byte quelli del mio primo pacchetto. Concausa mia: il `LEGGIMI.txt` del pacchetto non spiegava come creare il branch prima del caricamento.

**Danno collaterale da sistemare (decisione tua).** Il commit `83abcc4` ha sovrascritto il `LEGGIMI.txt` alla radice: era il LEGGIMI v1.11.0 (specifica di Vibe, 85 righe) e ora contiene il testo del mio pacchetto G2. Il contenuto originale è nel commit `c35c287` ed è incluso come `LEGGIMI.txt.originale-main` nel pacchetto di consegna. Non l'ho ripristinato sul branch G2 per non toccare un file di Vibe dentro la PR G2: andrebbe ripristinato con un commit separato (o con "Revert" del solo commit `83abcc4`).

**Isolamento.** Nessun commit su `main`. Il branch G2 contiene solo file G2 (nuovi o modificati). Nessun file di Vibe, di G1 o del motore toccato (`git diff --stat origin/main` lo mostra). I due `LEGGIMI` e `package-lock.json` (generato dal mio `npm install`) sono esclusi.
**Nota sulla PR.** Poiché `main` contiene già la prima versione di G2, la PR `graphics/g2-anatomy-phenotype → main` mostra solo la revisione (il delta), non l'intero G2. Il vecchio branch locale basato su G1 è stato rinominato `backup/g2-first-impl-on-g1` e non viene usato.

## 2. Anomalie individuate (tutte dimostrate con una diagnostica su tutti i 13 body plan)
| # | Anomalia | Prova | Stato |
|---|---|---|---|
| A1 | Radici di appendici fuori dalla superficie del segmento ospite: zampe a r = 1,35–1,39 del semiasse (sospese fuori dal corpo), placche a r = 1,28 | quadruped, hexapod, armored-specialist, tutti con placche | corretta |
| A2 | Placche concentrate su un solo segmento (root): 8 placche sul 10 % della lunghezza in many-legged e limbless-serpentine | diagnostica D7 | corretta |
| A3 | Zampa o occhio dispari sulla linea mediana orientato all'indietro (`{0,0,-1}`), con il tipo "leg" non d'appoggio | quadruped, biped, hexapod, many-legged, armored-specialist | corretta |
| A4 | `computeExtents` ignorava le appendici: multi-braccio 1,2 contro 3,07 reali, radial-sessile 1,2 contro 2,8; larghezza = 2·max|x| (sbagliata per layout asimmetrici) | D10 | corretta |
| A5 | `groundClearance` = lunghezza massima di una zampa (0,9 dichiarata contro 0,883 reale; hexapod 1 contro 0,799; many-legged 0,6 contro 0,479) | D8 | corretta, con terreno `null` se non determinabile |
| A6 | Simmetria dichiarata contraddetta dalle appendici: sfera con 8 placche "sferica"; ordine radiale 5 con 8 placche; ordine 6 con 3 stalks | D6 | corretta (ordine = MCD; sfera con appendici = radiale) |
| A7 | Modalità `appendage-driven`/`radial` senza alcuna appendice locomotoria (fins = 0) | D5b | corretta (→ `limbless`) |
| A8 | Giunti interni sempre `hinge` anche per gruppi `flexible` (antenne, flagelli, braccia radiali, esapode) | D9 | corretta |
| A9 | Tetto di 64 appendici: il gruppo in coda veniva azzerato (legs 56, eyes 0 con 5 richiesti) | D11 | corretta (ripartizione proporzionale, coppie preservate) |
| A10 | Uno spec senza segmenti mandava in crash con `Cannot read properties of undefined` | D12 | corretta (Error descrittivo) |
| A11 | Rumore in virgola mobile rompeva la simmetria delle appendici terminali (4 elementi: `k/(n-1)−0,5` non dà valori esattamente opposti → arrotondamenti diversi a 1e-6) | trovato dai nuovi test, non dalla diagnostica | corretta (aritmetica intera) |
| A12 | Cache: chiave incompleta (ignorava valori derivati e `issues` di un profilo costruito a mano), seme/lod/conteggi non normalizzati, cache anche per spec modificabili (rischio risultato stantio) | analisi + test | corretta |
| A13 | Contratto: `locomotion.groundClearance` duplicava il valore di proporzione | analisi | rimosso (schema v2) |

**Controllato e senza anomalie:** sovrapposizione tra segmenti (adiacenti entro il 15 % previsto, nessuna sovrapposizione tra non adiacenti), giunti assiali e radice (uno per segmento/appendice, riferimenti coerenti), dof coerente con il tipo, coppie bilaterali nei body plan del catalogo, serializzazione, LOD.

## 3. Correzioni effettuate (file)
- `lib/anatomy/types.ts`: schema **v2** (le versioni 1 vengono rifiutate; nessun descriptor v1 è mai stato salvato), nuove proporzioni (`extent*`, `bounds`, `groundY`, `groundClearance`, `heightAboveGround`), `LOCOMOTOR_KINDS`, convenzioni nel commento.
- `lib/anatomy/assemble.ts`: `computeExtents` riscritta (corpo, appendici, bounds, terreno dalle punte delle zampe d'appoggio).
- `lib/anatomy/geometry.ts` (nuovo): profilo e superficie dei segmenti.
- `lib/anatomy/generate.ts`: posizionamento sulla superficie, appendice dispari, placche sul corpo, giunti interni, simmetria effettiva, locomozione, ripartizione del tetto, aritmetica intera, validazione dello spec, cache e chiave.
- `lib/anatomy/validate.ts`: direzione unitaria, appendice sull'ospite, simmetria radiale/sferica, locomozione, proporzioni ricalcolate, terreno.
- `lib/anatomy/bodyPlan.ts`: `validateBodyPlanSpec` più severa (cicli, compatibilità simmetria/posizionamento, numeri finiti).
- `tests/anatomyG2.test.ts`: tre aspettative aggiornate ai nuovi comportamenti. Nessun test indebolito.
- Documenti: `G2_GEOMETRY_CONVENTIONS.md` (nuovo), `G2_MISSING_GENETIC_DATA.md` (limiti evolutivi), `G2_ARCHITECTURE.md` aggiornato. `G2_AUDIT_REPORT.md` e `G2_FINAL_REPORT.md` restano come documenti storici della prima fase (i loro numeri sono superati da questo report).

## 4. Suite di test
Nuovo `tests/anatomyG2Review.test.ts`: **88 test**: tutti i 13 body plan in 6 scenari e per ogni conteggio min/default/dispari/max; posizione delle radici; direzioni; placche; estensioni e terreno; simmetria; articolazioni; locomozione; tetto; spec personalizzati; cache (chiavi, collisioni, valori mancanti, spec modificabili/congelati); determinismo, fingerprint di riferimento e immutabilità; LOD 0–3; serializzazione; adattatore legacy (80 combinazioni di tratti); dati genetici mancanti; indipendenza dal renderer e dal motore.
Totale G2: 29 originali + 88 = **117 test, tutti passati**.
Verifica di efficacia: il test di simmetria ha fallito sul difetto A11 prima della correzione (4 elementi terminali), e le asserzioni sul terreno falliscono con la vecchia definizione.

## 5. Risultati reali (esecuzione del 17/11, sandbox Node)
| Comando | Baseline (`main` con G2 caricato) | Dopo la revisione |
|---|---|---|
| `npx tsc --noEmit` | 1 errore: `app/layout.tsx` `LayoutProps` non trovato (tipi Next non ancora generati) | **0 errori** (dopo la build, che genera i tipi) |
| `npm test` | 709 passati, **5 falliti**, 1 saltato (715) | **797 passati**, **5 falliti**, 1 saltato (803) |
| `npm run build` | riuscita | **riuscita** (compilazione e TypeScript ok; 2 route statiche) |
Differenza: +88 test passati, 0 nuovi fallimenti.

**5 fallimenti preesistenti, indipendenti da G2** (identici con e senza i file G2): `fauna180` (sfumatura ventre-dorso), `reproduction` (2: costo energetico e genomi dei figli), `vibeGenomeV1110` (2: nessun gene comportamentale diretto; PER-03). Non li ho toccati: appartengono a Vibe o a sistemi non G2.
**Limite della build:** i moduli G2 non sono importati dall'app, quindi la build li controlla solo come tipi TypeScript; la loro verifica funzionale è nei test. ESLint non eseguito (nessun `eslint.config.*` nel repo).
**Prestazioni** (CPU Node, dopo riscaldamento): 3000 organismi in 1090 ms a freddo (~363 µs/organismo; era ~291 prima della revisione, per la geometria in più), 27 ms con cache calda (~9 µs, dominati dalla chiave). Misura non profilata, non su dispositivi.

## 6. Limiti residui
- Punta delle appendici stimata in linea retta; profili di capsula e cono semplificati; nessuna collisione tra appendici.
- Il descriptor legacy è estetico (non deriva da geni); il confronto con i nuovi body plan segnala differenze di proporzione, non le elimina.
- Il body plan non evolve (tabella completa in `G2_MISSING_GENETIC_DATA.md`).
- Le placche sulla stessa linea dorsale possono toccarsi con 8 placche su segmenti corti.
- Un `BodyPlanSpec` non congelato non usa la cache (scelta per correttezza).
- Nessuna verifica su browser o telefono: G2 non è collegato al renderer.

## 7. Priorità 6 — evoluzione del body plan
Non implementata. Cosa non evolve e quali dati servirebbero: `G2_MISSING_GENETIC_DATA.md`, sezione "Limiti evolutivi".
