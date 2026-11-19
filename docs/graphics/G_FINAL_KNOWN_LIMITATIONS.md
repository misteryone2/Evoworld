# G Final — Limitazioni note

## 1. Limitazioni bloccatrici per il QA

### 1.1 `npm run lint` non eseguibile

- Exit code: 2.
- Causa: ESLint 9.39.5 richiede `eslint.config.(js|mjs|cjs)`, assente nel repository.
- Script: `"lint": "eslint"` in `package.json`; dipendenza `eslint@^9`.
- Non corretto: aggiungere una configurazione ESLint 9 sarebbe una modifica non grafica e andrebbe oltre il perimetro di questa branca.
- Stato: pre-esistente alla base `14c6f1f`, non introdotto dal consolidamento finale.

## 2. Fallimenti pre-esistenti della suite completa

La suite completa termina con `11 failed | 889 passed | 1 skipped (901)`, invariata nel conteggio dei fallimenti rispetto alla baseline (`11 failed`, 849 passati, 1 skipped su 861).

### 2.1 Fallimenti semantici noti

- `tests/fauna180.test.ts`: belly shade `1.0800000429153442` vs atteso `1`.
- `tests/reproduction.test.ts`: 2 fallimenti.
- `tests/vibeGenomeV1110.test.ts`: 3 fallimenti al timeout predefinito; 2 restano anche con `--testTimeout=30000`.

Questi test non toccano i file grafici modificati e non sono stati corretti.

### 2.2 Fallimenti di timeout al timeout predefinito

Con `--testTimeout=30000` su `hydrology`, `livingBehavior`, `planet`, `settlementDefaults` e `vibeGenomeV1110`, i fallimenti di timeout scompaiono (2 fallimenti semantici restanti su 99 test). Il timeout predefinito è quindi troppo stretto per questi test sull'ambiente corrente, indipendentemente dal consolidamento grafico.

## 3. Limitazioni funzionali G-REV-02

1. **Opt-in lato renderer** — senza `anatomyRenderSource`, il renderer usa esclusivamente la geometria legacy. Non esiste ancora un'integrazione automatica che popoli la sorgente dalla simulazione; l'hanno volutamente evitata per non toccare `RenderFrame`, worker, salvataggi e biologia.
2. **Repertorio di parti limitato** — i pool generici coprono solo `segment` (6 slot), `appendage` (12) e `eye` (2). I piani che richiedono altre parti o più slot sono unsupported e ricadono al legacy con `fallbackReason`.
3. **Nessuna geometria inventata** — un piano unsupported o non finito non produce surrogati: viene usata la geometria legacy e il motivo è esposto in `CreatureRendererStats`.
4. **Picking invariato** — `bodyMesh` resta il proxy di selezione. Le parti generiche non sono selezionabili singolarmente.
5. **Cache legacy disattivata sul percorso G2** — la traccia anatomica legacy resta `null` quando il piano G2 è attivo; il fallback legacy la ricostruisce quando serve.
6. **Piani da precalcolare** — generare descriptor e proiezioni nel loop caldo costa ~1041 ms a 3000 creature (benchmark). Le integrazioni devono costruire e cachare i piani fuori dal loop.
7. **Costo G2 superiore** — il loop G2 misura 2.160/8.163/29.373/60.133 ms a 100/500/1500/3000 creature contro 1.114/2.475/7.191/12.083 ms del legacy. Non è un miglioramento prestazionale.

## 4. Limitazioni di validazione

1. `checkAnatomyEnvelope()` è un gate **strutturale minimo**: blocca solo accessi che altrimenti lancerebbero. Duplicati, enum non validi e incoerenze semantiche restano di competenza di `validateAnatomy()`.
2. La simmetria radiale verifica geometria, direzioni, spaziatura angolare e raggio host; non valuta proprietà estetiche o biomechaniche che non siano rappresentate nel descriptor.
3. Per i gruppi dispari, la regola `staggered` esclude l'ultimo elemento indicizzato. Gruppi con semantica diversa devono dichiarare `center-line` o `omit`; non sono supportati altri schemi di pairing.
4. `ANATOMY_SCHEMA_VERSION` resta `1`: non è stata introdotta una migrazione di schema versione 2.

## 5. Limitazioni delle evidenze

- `npm run lint` non produce un report di stile: solo l'errore di configurazione.
- Il benchmark misura CPU e non GPU: non si può affermare nulla su FPS reali, draw call, upload o fill-rate.
- Lo smoke browser conferma avvio del mondo, canvas WebGL2 e assenza di errori contesto/console, ma non effettua un confronto visivo pixel-perfect né un profiling GPU esteso.
- Il warning `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.` è noto e pre-esistente; non corretto in questa branca.
- `gh` CLI non è disponibile: lo stato delle PR è stato letto dalle API GitHub, non da `gh pr view`.

## 6. Limiti di perimetro

- `simulation/**`, biologia, salvataggio/caricamento e persistence restano invariati.
- Le modifiche a `components/simulation/**` sono limitate a `Planet3DView.tsx`, `planet3d/creatureInstancing.ts` e `planet3d/types.ts`.
- `main` non è stato modificato o unito.
- Nessun branch o commit condiviso è stato eliminato, riscritto o force-pushato.
- PR #1 resta aperta/dirty; PR #2 resta chiusa/mergeata.
- Non sono state pubblicate release.

## 7. Cosa serve prima di un'integrazione in `main`

1. Risolvere la configurazione ESLint 9 in una branca dedicata, non grafica.
2. Decidere se accettare o correggere i 5 fallimenti semantici pre-esistenti (fauna180, reproduction ×2, vibeGenomeV1110 ×2 stabili) e l'aumento dei timeout.
3. Fornire una sorgente G2 reale con piani precalcolati, oppure mantenere il renderer legacy di default.
4. Rieseguire benchmark e smoke browser sull'hardware target prima di abilitare G2 in produzione.
