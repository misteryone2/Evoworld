# Changelog — Natural Motion & Animation

Il progetto parte da v1.10.1 e termina con v1.10.5. Regola di tutto il progetto: solo rendering.
La simulazione biologica (genetica, cervello, movimento reale, energia, collisioni, predazione, riproduzione,
speciazione, clima, vegetazione, persistenza) non si tocca; i dati di animazione sono temporanei e non finiscono nei salvataggi.

## v1.10.1 — Continuous Movement

Prima: il mondo avanza a scatti (a velocità 1, un tick ogni 100 ms) e le creature venivano disegnate ferme nelle
posizioni dell'ultimo frame, quindi si muovevano a 10 Hz. Ora il rendering interpola tra due frame del mondo.

- `lib/motionInterpolation.ts` (nuovo, puro): per ogni creatura tiene posizione di partenza e di arrivo e calcola dove
  disegnarla a ogni frame di rendering. Interpolazione toroidale (via più corta attraverso il bordo, su x e y),
  indipendente dal frame rate (dipende dal tempo, non dal numero di frame), senza estrapolare mai oltre l'arrivo.
- Continuità: se arriva un frame a metà interpolazione, il nuovo tratto parte da dove la creatura è disegnata.
- Casi particolari: nascita (compare nel suo punto), riposizionamento (salto più grande di un passo: scatta),
  molti tick in un frame (oltre 6: scatta), sospensione della scheda (oltre 1 s tra due frame: scatta, non scivola),
  tick più basso o pianeta di dimensioni diverse (mondo reimpostato o caricato: riparte da zero).
- `Planet3DView.tsx`: le creature, l'anello di selezione e la camera di inseguimento usano le posizioni interpolate;
  il disegno delle creature passa dall'effetto che reagiva ai frame del mondo al ciclo di rendering. Si ridisegna solo
  se c'è qualcosa da muovere (frame nuovo, interpolazione in corso, cambio di camera o selezione). Se un aggiornamento
  costa più di 8 ms (media), si ridisegna al massimo a 30 Hz.
- `lib/creatureHeading.ts`: `headingBlendForDt`. La rotazione verso la direzione di marcia non dipende più da quanto
  spesso si disegna (0,4 ogni 100 ms, come prima).
- Nessun file in `simulation/`, `workers/` o `types/` è stato modificato.

## v1.10.2 — Natural Acceleration & Turning

Prima: la direzione verso cui è girata una creatura si miscelava a ogni aggiornamento (0,4 per aggiornamento), quindi la
rotazione dipendeva da quanto spesso si disegnava; la velocità non aveva una rappresentazione visiva.

- `lib/naturalMotion.ts` (nuovo, puro): rotazione graduale verso la direzione di marcia (avvicinamento esponenziale,
  tetto di 5 rad/s per taglia 1, più lenta per chi è più grosso; angoli sempre per la via più corta, anche attraverso
  ±π), velocità visualizzata che segue quella reale con salita (150 ms) e discesa (110 ms) progressive, inclinazione
  laterale in curva (massimo circa 10°) e beccheggio in accelerazione/frenata (massimo circa 4,5°). Tutto dipende
  dal tempo trascorso, non dal numero di frame. Passi limitati a 250 ms dopo una sospensione.
- La posizione disegnata non ha inerzia (resta quella interpolata della v1.10.1): un'inerzia sulla posizione farebbe
  sovrapporre corpi che le collisioni tengono separati, e darebbe un effetto elastico.
- `Planet3DView.tsx`: `updateCreatureInstances` usa lo stato visivo (nel tracciato di ogni creatura, temporaneo) per
  orientare e inclinare il corpo; il parametro di rotazione passa da un peso fisso a `dtMs`. La camera di inseguimento
  guarda dove è girata la creatura (la sua rotazione visiva) invece di una direzione propria più veloce.
- Convenzione verificata con la proiezione reale: sulla griglia l'angolo atan2(dy, dx) che cresce è una svolta a
  sinistra nella vista 3D.
- Nessun file in `simulation/`, `workers/` o `types/` è stato modificato.

## v1.10.3 — Procedural Body Animation

Prima: le zampe oscillavano sempre alla stessa ampiezza (trotto fisso) quando la creatura si era mossa nell'ultimo
aggiornamento e si fermavano di colpo; corpo, testa e coda erano rigidi.

- `lib/bodyAnimation.ts` (nuovo, puro): posa del corpo calcolata dallo stato visivo (velocità visualizzata, velocità
  di rotazione), dalla fase del passo e dall'anatomia che esiste già (lunghezza di zampe, corpo e coda; nessun gene nuovo).
  - Zampe: tre andature — passo (sequenza laterale), trotto (diagonali insieme), galoppo (anteriori vicine, posteriori
    mezzo ciclo dopo) — mescolate con continuità in base alla velocità. Ampiezza del passo che sale con la velocità e
    va a zero da ferma: nessuna camminata sul posto. Angolo massimo coerente con la lunghezza del passo (corpo lungo)
    e della zampa.
  - Cadenza proporzionale alla velocità visualizzata (`advancePhase`: un ciclo ogni 3,2 lunghezze di scala, come prima);
    il passo è più lungo per le creature più grosse.
  - Corpo: due rimbalzi per ciclo, ondeggiamento laterale e leggero avanti-indietro, più marcati col trotto/galoppo.
  - Testa (con occhi, mandibola e orecchie): cenno al ritmo del passo, si volge verso la curva attorno al collo.
  - Coda: oscillazione col passo (meno ampia se è lunga) e contrappeso in curva; spine che seguono il corpo.
- `Planet3DView.tsx`: `updateCreatureInstances` usa la posa; la fase del passo avanza con la velocità visualizzata
  (non più con il binario "si è mosso / non si è mosso"). Profili leggeri (senza zampe) animano comunque corpo e testa.
- Misura grezza (sandbox a una CPU, non rappresentativa di un telefono): un aggiornamento delle creature a dettaglio 3,
  in movimento, passa da 5,6-7,0 a 7,1-8,3 ms con 300-2500 creature.
- Nessun file in `simulation/`, `workers/` o `types/` è stato modificato.

## v1.10.4 — Living Behaviors

Prima: una creatura ferma era un oggetto fermo (da v1.10.3 le zampe stanno ferme, ma corpo, testa e coda no).

- **Da dove vengono gli stati.** La simulazione non ha stati "mangia" o "riposa" da mostrare e non se ne aggiungono.
  Gli stati visivi derivano da dati reali: cammina = velocità visualizzata; mangia = ferma e con l'energia che sale
  più di quanto consuma (guadagno per tick tra gli ultimi frame del mondo); riposa = ferma da più di 4 s di
  rendering (pieno a 8 s) e non sta mangiando; idle = ferma da poco. Limite: una creatura con l'energia già al massimo
  (150) che mangia non guadagna e quindi appare ferma/a riposo.
- **Unica modifica fuori dal rendering (sola lettura):** `RenderFrame` ha un campo in più, `organismsEnergy`
  (facoltativo; `types/index.ts` e `simulation/core/renderFrame.ts`), che copia l'energia che ogni organismo ha già.
  Non cambia nulla della simulazione (c'è un test: stesso seme, stesso mondo con e senza costruzione dei frame) e non
  entra nei salvataggi. `organismsEnergyGain` invece non viene dal mondo: la calcola il rendering
  (`lib/motionInterpolation.ts`).
- `lib/livingBehavior.ts` (nuovo, puro): pesi degli stati che seguono il bersaglio in modo esponenziale (nessuno
  scatto, anche passando da mangia a cammina), respiro (più lento e profondo a riposo; fase sfalsata per creatura dall'id,
  senza il generatore casuale della simulazione), sguardo che vaga a tratti e piccoli assestamenti (idle), testa giù con
  morsi ripetuti (mangia), corpo più basso con testa e coda abbandonate (riposa). Nessuna camminata da fermo.
- `lib/bodyAnimation.ts`: la posa ha il campo `breath`. `Planet3DView.tsx`: il torace respira (scala di corpo), lo stato
  vive nel tracciato visivo di ogni creatura (temporaneo, non persistente).
- Nessun file di biologia è stato modificato (genetica, cervello, movimento, energia, collisioni, predazione,
  riproduzione, speciazione, clima, vegetazione, persistenza).

## v1.10.5 — Animation Optimization & Final Release

- **LOD dell'animazione** (`lib/animationLod.ts`, nuovo): tre livelli con pesi continui che sommano 1 (smoothstep), in funzione
  della distanza dalla camera misurata in scale della creatura (una creatura grossa resta in dettaglio più lontano).
  ALTO fino a 30 scale (tutto), sfuma verso MEDIO tra 30 e 55 (zampe e corpo poco ridotti, testa e coda a metà), sfuma verso
  BASSO tra 110 e 170 (zampe e rimbalzo semplificati, respiro; niente cenni di testa, coda e sguardo, che a quella distanza non si
  vedono). Nessuna creatura è statica: posizione e rotazione continue valgono a ogni distanza. La geometria non cambia, quindi
  non ci sono comparse o scomparse di parti. Senza camera (o vicino) il risultato è identico a v1.10.4.
- **Allocazioni**: il ciclo per creatura chiamava `setPart` una quindicina di volte con sei numeri decimali; V8, non potendo
  espanderla in linea in una funzione così grande, creava un oggetto temporaneo per ogni numero. Ora posizione e scala locali si
  scrivono sui vettori di lavoro e si chiama `commitPart`; la scala si calcola una volta per creatura, i delta toroidali e le
  distanze (senza `Math.hypot`, che alloca) sono in linea. Misurato in un eseguibile autonomo (rolldown + node --expose-gc, non in
  vitest, che falserebbe le allocazioni): da 1818 a 791 byte per creatura per aggiornamento.
- Misure, v1.10.4 → v1.10.5 (2 esecuzioni alternate, stessa macchina a una CPU, 2500 creature, dettaglio 3, camera lontana e
  vicina; tempo di un aggiornamento delle istanze): medio 6,0-6,5 ms → 4,8-5,2 ms; 95° percentile 6,4-9,0 → 5,5-8,2 ms (rumoroso);
  eventi del garbage collector in 150 aggiornamenti: 51 → 28; memoria allocata per aggiornamento: 4,4 MB → 1,9 MB.
  Con 1500 creature: medio 3,3-4,2 ms → 2,6-3,7 ms. L'effetto del solo LOD sul tempo è piccolo (il costo è dominato dalle
  matrici delle parti, che non cambiano): il guadagno viene soprattutto dalle allocazioni.
- Non misurabili qui (nessuna GPU, nessun browser, nessun telefono): FPS reali, frame time al 95° percentile nel browser, memoria
  del browser, costo della GPU, stabilità su telefono e PC. Da provare a mano.
- Regressione: lo stato di animazione non entra nei salvataggi; un salvataggio caricato prosegue come il mondo originale;
  nessun file di biologia modificato in tutto il progetto (l'unica modifica a `simulation/` è la lettura dell'energia nel
  frame, v1.10.4).
