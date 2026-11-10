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
