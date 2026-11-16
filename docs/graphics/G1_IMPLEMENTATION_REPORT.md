# G1 — Implementation report (creature visuals)

**Data:** 2026-11-16  
**Autore:** Big Pickle  
**Stato verifica:** ✅ build + typecheck OK; ✅ 12/12 test del nuovo modulo; ⚠️ suite completa con **fallimenti preesistenti** (dettaglio §6). Nessun test di rendering/GPU o misura FPS è stato eseguito (ambiente senza browser/GPU).

## 1. Vincoli rispettati

- Nessuna modifica a `simulation/**`: genetica, mutazioni, selezione naturale, riproduzione, metabolismo, energia, comportamento, predazione/ecologia restano invariati.
- Il rendering legge i dati esistenti (`RenderFrame`) e non scrive nulla sulle strutture della simulazione.
- Nessuna nuova dipendenza, nessun asset esterno, nessuna modifica a formati snapshot/salvataggio.
- Modifiche additive e localizzate; nessuna riscrittura distruttiva.

## 2. File aggiunti

### `lib/visual/creatureVisualDescriptor.ts`
Contratto read-only + mapper puro:

- Tipi: `CreatureVisualDescriptor`, `CreatureMorphology`, `CreatureSurface`, `CreatureMotionState`, `CreatureBehaviorCues`, `CreatureLodHints`, `VisualGait`, `VisualDietClass`, `SurfaceMaterialClass`.
- `buildCreatureVisualDescriptor(input)`: legge un indice del `RenderFrame` (id, specie, posizione, size/speed/carnivory/vision/evasion/huntingSkill) e opzionale stato visivo già calcolato dal renderer (posizione interpolata, velocità, heading, distanza camera, energy gain, tempo fermo).
- `stableVariation01(id)` / `organismHueShift(id)`: hash deterministico per individuo (stesso id → stesso look, nessun random a runtime). **Unica fonte** usata sia dal descriptor sia dal renderer 3D, così 2D/3D non divergono.
- `dietClassFromCarnivory(...)`, `gaitFromSpeedNorm(...)`: mapping visuale puro.
- LOD: `geometryTier`/`materialTier`/`animationTier` e `renderParts` derivati da distanza camera in scale + `QualityProfile` (`alto`/`medio`/`basso`/`2d`), con boost per l'organismo selezionato.

**Cue di comportamento:** `feeding` deriva solo da energia guadagnata + quasi fermo; `resting` solo da fermo prolungato; **`alert` è sempre 0** perché nel frame non esiste un segnale reale dedicato (vietato inventarlo).

### `lib/visual/index.ts`
Re-export del modulo.

### `tests/creatureVisualDescriptor.test.ts`
Test puri (Vitest) che coprono: determinismo, **non mutazione del frame**, classificazione dieta, scala delle andature, range dei valori (0..1), `alert === 0`, `resting` vs `feeding`, LOD (vicino/lontano, selezionato, profilo leggero), uso della posizione interpolata.
> Eseguiti: **12/12 passati** (vedi §6).

## 3. File modificati

### `components/simulation/drawCreature.ts` (2D)
Stessa firma pubblica (`drawCreature(ctx, cx, cy, radius, shape, color)`), rendering più ricco:

- corpo con gradiente radiale (volume), ventre più chiaro, coda, accenno di arti;
- spine triangolari, mascella con contorno, occhio con pupilla e riflesso, testa/accento frontale, ombra a terra;
- **guardie di costo:** coda/ventre/arti/ombra solo sopra soglie di raggio; gradiente solo `radius >= 4`, pupilla/riflesso solo `radius >= 3`. Sotto soglia la creatura resta un punto colorato → nessun `createRadialGradient` per migliaia di punti minuscoli.

### `components/simulation/Planet3DView.tsx` (3D)
- Import degli helper deterministici da `lib/visual/creatureVisualDescriptor` (adozione parziale del boundary G1).
- `makeMaterial` accetta `metalness` opzionale; materiali creature differenziati:
  - corpo `roughness 0.52 / metalness 0.04`, testa `0.48 / 0.04`, occhi `0.16 / 0.0` (lucidi),
  - coda `0.56`, mascella `0.45`, spine `0.42`, zampe `0.62`, orecchie `0.55` (metalness basso: superficie organica, non metallo).
- Luce di riempimento direzionale debole (`0x9fc4ff`, 0.22) dal lato opposto al sole, senza ombre: stacca i volumi dal fondo scuro.
- Colore per individuo: tinta di specie (`speciesHue`) + `organismHueShift(id)` (±7°), saturazione/luminosità modulate da aggressività e variazione stabile. Il tint predatorio esistente (`AGGRO_TINT`) è mantenuto.

Tutti i materiali precedenti non toccati mantengono il valore storico (`metalness` default 0.1).

## 4. Cosa **non** è stato fatto

- Refactor modulare di `Planet3DView` (terrain/ocean/camera/creature/picking/perf): richiede build/test iterativi e parità visiva verificata.
- Materiali PBR reali, normal/AO map, texture procedurali per pelle/scaglie/pelo; il descriptor espone `materialClass`/`pattern` ma il renderer non li consuma ancora.
- Adozione completa del descriptor nel loop creature (evitata di proposito: allocherebbe oggetti per creatura/frame; serve una variante zero-alloc o buffer riusabili).
- Animazioni/scheletro/IK, ambiente/vegetazione/acqua/atmosfera oltre a quanto già presente, UI/HUD.
- Qualsiasi misura di FPS, p95, memoria o confronto PC/mobile.

## 5. Prossimi passi verificabili (in ordine)

1. Installare Node LTS, eseguire `npm ci`, `npx tsc --noEmit`, `npm run test`, `npm run build`. Registrare esiti reali in `GRAPHICS_COORDINATION.md` §Baseline. ✅ Fatto (§6; `npm ci` sostituito da `npm install --legacy-peer-deps` per il bug npm 10.9.2).
2. Se il typecheck segnala problemi nel nuovo modulo/test, correggerli prima di procedere.
3. Smoke visivo: mappa 2D a 100/600 creature, 3D a 100/500/1500/3000, profili `basso`/`medio`/`alto`, desktop + mobile; screenshot prima/dopo.
4. Profilare `updateCreatureInstances` e il loop di disegno 2D (ms/frame, p95) per confermare che le guardie di costo bastino.
5. Solo dopo: refactor modulare (G1-b) e materiali/pattern dal descriptor (G3).

## 6. Verifica eseguita (risultati reali)

Ambiente: Windows, Node **v22.14.0** (portable, non installato a sistema), npm **10.9.2**, vitest **4.1.12**, Next **16.3.0**.

| Comando | Esito |
|---|---|
| `npm install --legacy-peer-deps` | OK, 391 pacchetti (~2 min). Con npm 10.9.2 il comando senza flag fallisce con `Cannot read properties of null (reading 'edgesOut')` (bug npm/arborist, non del progetto). `package-lock.json` generato è stato rimosso per non introdurre un lockfile non presente a monte. |
| `npx next build` | ✅ `Compiled successfully in 25.0s`; TypeScript 57s; 3/3 pagine statiche generate. |
| `npx tsc --noEmit` | ✅ exit 0 (dopo che `next build` ha generato `next-env.d.ts`; prima del build l'unico errore era `LayoutProps` in `app/layout.tsx`, tipo globale generato da Next). |
| `npx vitest run tests/creatureVisualDescriptor.test.ts` | ✅ **12/12 test passati**. |
| Test mirati aree grafiche (`creatureVisualDescriptor`, `creatureInstances`, `creatureShape`, `creatureAnatomy`, `bodyAnimation`, `qualityProfile`) | ✅ **72/72 test passati** (6 file). |
| `npx vitest run` (suite completa) | ⚠️ 61 file: 54 pass, 6 fail, 1 skip. 698 test: **687 pass, 10 fail, 1 skip**. |

### Fallimenti della suite completa (tutti in aree non toccate)

- `tests/fauna180.test.ts` → "la sfumatura ventre-dorso": asserisce ventre ≈ 1, ma `addBellyGradient` (funzione **non modificata** in questa sessione) usa da sempre 1.08 al ventre. Incoerenza test/codice preesistente.
- `tests/vibeGenomeV1110.test.ts` (2) → registry/validazione e interazione PER-03.
- `tests/planet.test.ts` (2, a volte 1), `tests/hydrology.test.ts` (a volte), `tests/reproduction.test.ts` (2, a volte), `tests/settlementDefaults.test.ts` (1–2, a volte): test di generazione mondo/simulazione, **flaky** tra run (osservati 8, 10 e 11 fallimenti in tre esecuzioni).

Nessun test di `creatureInstances`, `creatureAnatomy`, `creatureShape`, `creatureModel`, `creatureHeading` o del nuovo descriptor è fallito.

### Micro-misura CPU (indicativa, nessuna GPU)

Test temporaneo (poi rimosso) su `updateCreatureInstances` e `buildCreatureVisualDescriptor`, Node su questa macchina:

| Carico | detail | `updateCreatureInstances` |
|---|---|---|
| 100 creature | 3 | ~1.0 ms/update |
| 500 creature | 3 | ~1.9 ms/update |
| 1500 creature | 2 | ~2.1 ms/update |
| 3000 creature | 3 | ~6.4 ms/update |

`buildCreatureVisualDescriptor` su 3000 creature: **~4.2 ms/batch** (alloca un oggetto per creatura). Per questo **non** è stato inserito nel loop caldo: conferma che serve una variante zero-alloc prima dell'adozione completa (G1-b).

> Questi numeri misurano solo il calcolo CPU nel runtime Node: non includono upload GPU, draw call, fill-rate né il loop canvas 2D. Non sono FPS e non sostituiscono il profiling su PC/mobile.

## 7. Passi successivi aggiornati

1. Riprodurre la baseline su un checkout con git e CI, registrando commit e comandi. ✅ Fatto: clone `Evoworld-git`, commit `c35c287` (main), Node v22.14.0 portable; esiti identici al progetto caricato.
2. Smoke visivo browser: 2D (100/600) e 3D (100/500/1500/3000) per `basso`/`medio`/`alto`, desktop + mobile, con screenshot prima/dopo.
3. Profiling browser (Performance panel): ms/frame, p95, draw call, memoria.
4. Refactor modulare G1-b e adozione descriptor con buffer riusabili (zero-alloc).
5. Materiali/pattern reali (G3) e ambiente (G5) con verifica visiva.
