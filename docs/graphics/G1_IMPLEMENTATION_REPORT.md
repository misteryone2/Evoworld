# G1 — Implementation report (creature visuals)

**Data:** 2026-11-16  
**Autore:** Big Pickle  
**Stato verifica:** ✅ build + typecheck OK; ✅ 12/12 test del nuovo modulo; ✅ smoke test browser desktop (3D "Completa" + mappa 2D, nessun errore console, §7); ⚠️ suite completa con **fallimenti preesistenti** (dettaglio §6). Non eseguiti: test su mobile reale, misura FPS a frame sbloccato, controllo a popolazione forzata.

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

## 7. Smoke test browser (eseguito, dev server)

Ambiente: Chromium dell'app desktop, `next dev` sulla porta 3100, profilo **Completa** (3D) e poi **Mappa 2D**. GPU riportata da WebGL: `ANGLE (Intel, Intel(R) UHD Graphics (0x0000A721) Direct3D11 vs_5_0 ps_5_0)`; `devicePixelRatio` 1.25. Build di **sviluppo**, non di produzione: i tempi includono l'overhead di React/Next in dev e sono quindi un limite superiore pessimistico.

| Verifica | Esito |
|---|---|
| Console errori, 3D "Completa" | ✅ nessun errore, nessun `webglcontextlost` |
| Console errori, "Mappa 2D" | ✅ nessun errore |
| Canvas 3D | 1140×837 px (912×670 CSS, DPR 1.25) |
| Canvas 2D | 640×640 px, `PlanetCanvas` attivo |
| rAF 3D (180 frame) | 33.28 ms medi, p95 33.5 ms, worst 33.6 ms → **30.0 fps stabili**: è il cap del loop, non saturazione (p95 ≈ media) |
| CPU main-thread 3D (9.05 s) | idle 7495 ms → **~17% occupato**; `updateCreatureInstances` 53 ms totali (~5.9 ms/s), `bufferSubData` 127 ms |
| CPU main-thread 2D (30.07 s) | idle 28 733 ms → **~4.3% occupato**; `drawCreature` 14.6 ms totali, `fill` 13.8 ms, `drawImage` 5.3 ms |

Screenshot: `screenshot.jpeg` (3D vista dall'alto) e `screenshot.jpeg` (mappa 2D), acquisiti dal browser in-app e mostrati all'utente nel pannello Review.

**Limiti di questa verifica (da non sopravvalutare):**

- Popolazione non forzata: la simulazione parte da poche specie, quindi i carichi 1500/3000 creature **non** sono stati riprodotti nel browser.
- Il cap a 30 fps maschera l'headroom reale: servirebbe un test a frame sbloccato o una build di produzione per misurare il margine.
- GPU integrata Intel UHD: un riferimento "basso", non rappresentativo di PC con GPU dedicata né di smartphone.
- Nessun test su dispositivo mobile reale, nessun confronto prima/dopo a parità di seed.
- In questa sessione l'agente **non** ha capacità di visione sulle immagini: la qualità estetica degli screenshot non è stata valutata automaticamente e richiede un giudizio umano.

## 8. Passi successivi aggiornati

1. Riprodurre la baseline su un checkout con git e CI, registrando commit e comandi. ✅ Fatto: clone `Evoworld-git`, commit `c35c287` (main), Node v22.14.0 portable; esiti identici al progetto caricato.
2. Smoke visivo browser: 2D (100/600) e 3D (100/500/1500/3000) per `basso`/`medio`/`alto`, desktop + mobile, con screenshot prima/dopo. ⚠️ Parziale: fatto 3D "Completa" e 2D su desktop, senza controllo popolazione né mobile (§7).
3. Profiling browser (Performance panel): ms/frame, p95, draw call, memoria. ⚠️ Parziale: tempi main-thread e rAF raccolti, mancano draw call e memoria.
4. Refactor modulare G1-b e adozione descriptor con buffer riusabili (zero-alloc). ✅ Refactor completato (§9); adozione descriptor nel loop caldo resta rinviata a G3.
5. Materiali/pattern reali (G3) e ambiente (G5) con verifica visiva.

## 9. G1-b — Refactor modulare di `Planet3DView` (senza cambi di comportamento)

**Data:** 2026-11-17  
**Obiettivo:** scomporre il renderer monolitico in sottosistemi riutilizzabili mantenendo **parità di API e di comportamento**. Nessuna modifica alla simulazione biologica.

### 9.1 Struttura

`components/simulation/Planet3DView.tsx`: **2199 → 1072 righe** (orchestratore React + effetti di setup/aggiornamento scena).

Nuovi moduli in `components/simulation/planet3d/`:

| Modulo | Contenuto |
|---|---|
| `constants.ts` | costanti condivise (`PLANET_RADIUS`, `CREATURE_BUFFER_SLACK`, `LEGS_PER_CREATURE`, `AGGRESSION_VISIBLE_THRESHOLD`, `CONE_BASE_RADIUS`) |
| `types.ts` | `SceneRefs`, `CreatureTrack`, `HeightmapSample` |
| `terrainTiers.ts` | tier LOD del terreno e selection per profilo qualità |
| `sky.ts` | colori cielo, gradiente zenit/orizzonte, nuvole procedurali |
| `sun.ts` | sole orbitante, posizione follow e extent ombre |
| `terrainSampling.ts` | `restingRadius` (surface locale o heightmap viewport) |
| `cameraRig.ts` | follow/free camera, drag, pan, stato follow e scratch dedicato |
| `selectionRing.ts` | posizionamento anello di selezione |
| `creatureInstancing.ts` | `configureInstancedMesh`, `addBellyGradient`, `updateCreatureInstances` e tutto lo scratch del loop creature |

### 9.2 Decisioni

- **API storica preservata**: `Planet3DView`, `CameraMode`, `SceneRefs`, `CreatureTrack`, `updateCreatureInstances`, `configureInstancedMesh`, `addBellyGradient`, `placeFollowSun`, `setSunShadowExtent`, `createCloudTexture`, `createSkyDome`, `createFollowState`, `resetFollowState`, `applyFollowDrag`, `updateFollowCamera`, `updateFreeCamera`, `panFreeCamera`, `FollowState` restano esportati da `Planet3DView.tsx` tramite re-export. Nessun chiamante (`app/page.tsx`, `CameraModeBar`, test) modificato.
- **Nessuno stato mutabile condiviso tra moduli**: ogni modulo ha propri scratch (`THREE.Vector3`, `Matrix4`, quaternioni). In particolare `creatureInstancing.ts` ha una copia privata di `UP`, separata da quella del componente: nessun rischio di interferenza tra camera e creature.
- **Pure code move**: nessun algoritmo, costante o soglia cambiata; `SPACE_COLOR` (vista dall'alto) resta nel componente, distinto da `SKY_COLOR` (terza persona).
- **Nessuna dipendenza nuova**, nessun file `simulation/**` toccato, nessun formato dati cambiato.

### 9.3 Verifica reale (2026-11-17, Node v22.14.0 portable)

| Comando | Esito |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx next build` | ✅ `Compiled successfully`; TypeScript OK; 3/3 pagine statiche generate |
| Test mirati grafica (12 file, creature/descriptor/follow/animazione/LOD) | ⚠️ **184 pass, 2 fail preesistenti** su 186 (`fauna180` belly 1.08 vs 1.0, `livingBehavior` ampieze fallito anche su baseline stash) |
| `npx vitest run` (suite completa) | ⚠️ **684 pass, 13 fail, 1 skip** su 698; baseline con stash delle modifiche G1-b: **682 pass, 15 fail, 1 skip** → differenza dentro il range flaky noto |
| Smoke browser desktop (dev server `127.0.0.1:3101`, profilo **Completa**) | ✅ pagina caricata, canvas WebGL 1250×875 (DPR 1.25), **nessun errore console**, nessun `webglcontextlost`; tutte e tre le modalità camera (dall'alto/libera/terza persona) attivabili senza errori |
| Smoke browser, passaggio a **Mappa 2D** | ✅ canvas `planet-canvas` 640×640 attivo, nessun errore console |

**Nota sull'ambiente browser:** il primo avvio su porta 3100 ha legato solo IPv6 (`::`) e il browser ha ricevuto 502; il server è stato riavviato con `-H 127.0.0.1 -p 3101`. Durante questo smoke la finestra desktop non era visibile, quindi Chromium ha limitato `requestAnimationFrame` a ~1 fps (1016 ms/frame): **la misura non è confrontabile** con i 30 fps del §7 e non va interpretata come regressione. Per lo stesso motivo non è stato possibile acquisire nuovi screenshot.

### 9.4 Stato

G1-b è pronto per la review in PR #1 sul branch `graphics/g1-creature-visuals`. Restano da verificare (come in §7): carichi forzati 1500/3000 creature, build di produzione, GPU/FPS reali, mobile e confronto visivo prima/dopo a parità di seed a giudizio umano.
