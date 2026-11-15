# Limite noto — campionamento della popolazione disegnata

**Stato:** documentato, NON corretto (decisione di Mattia: non cambiare l'algoritmo in questa fase).
Presente da prima della v1.10; la v1.10 lo rende più visibile perché ogni creatura ha uno stato animato.

## Cosa succede
Quando la popolazione supera `maxCreatures` del profilo di qualità (basso 600, medio 1.500; alto 2.500), le creature
disegnate sono quelle agli indici `0, s, 2s, …` dell'array degli organismi, con `s = ceil(popolazione / maxCreatures)`
(`lib/renderSampling.ts`, usato in `updateCreatureInstances`).

L'array cambia a ogni morte (rimozione) e a ogni nascita (aggiunta in coda): una **sola morte** sposta di una posizione
tutte le creature che la seguono, e quindi cambia la parità/il resto di ciascuna.

**Misura** (audit della v1.10.5, 3.000 creature, `maxCreatures` 1.500, una morte all'indice 10):
1.495 delle 1.500 creature disegnate escono dal disegno e 1.495 altre entrano.

## Conseguenze
- Scambio massiccio di creature a ogni morte: comparsa/scomparsa visibile.
- La traccia animata (`creatureTrack`: direzione, velocità, fase del passo, respiro, stati da ferma) di chi esce viene
  cancellata e ricreata: l'animazione di chi rientra riparte da zero (nascita nel punto, orientamento a nord).
- Non tocca la simulazione né i dati: è solo rendering. A profilo alto con meno di 2.500 creature non si presenta.

## Proposta tecnica per una correzione futura (non implementata)
1. **Campionamento stabile per id.** Si disegna la creatura se `u(id) < f`, con `u(id)` un hash stabile in [0, 1)
   (stesso hash di `seedFromId` in `lib/livingBehavior.ts`) e `f = maxCreatures × 0,97 / popolazione` (limitato a 1).
   L'appartenenza dipende solo dalla creatura e da `f`: una morte non cambia nulla per le altre, e `f` varia poco da un
   frame all'altro, quindi cambiano solo le creature con `u` tra il vecchio e il nuovo `f`.
2. **Isteresi su `f`**: lo si aggiorna solo se la popolazione cambia di più del 3-5%, per evitare ricambi continui.
3. **Tetto rigido**: se per caso il campione supera la capacità, si scartano quelle con `u` più alto (ordine stabile).
4. **Animale obbligato** (terza persona, selezione): resta sempre incluso, come oggi.
5. **Traccia animata**: non cancellare subito chi esce; tenerla per un breve tempo (per esempio 2 s) per evitare
   riavvii dell'animazione se rientra.

**Test da scrivere:** (a) con una morte, il numero di creature che cambiano stato di disegno deve essere ≤ 2 (non 1.495);
(b) il numero disegnato non supera mai `capacity`; (c) distribuzione spaziale ancora uniforme (nessuna zona privilegiata);
(d) stesso risultato per lo stesso insieme di id (indipendenza dall'ordine dell'array); (e) l'animale obbligato è sempre incluso.

**Rischio:** tocca `Planet3DView.tsx` (e `PlanetCanvas.tsx`, che usa lo stesso `computeRenderStride`): per questo non
è stato fatto senza autorizzazione.
