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
