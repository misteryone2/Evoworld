# G1 — Architettura renderer e modularizzazione (proposta)

**Stato:** design G1 (da applicare su checkout reale, in coordinamento con altri agenti).  
**Problema:** `components/simulation/Planet3DView.tsx` concentra responsabilità eterogenee (scene setup, terreno globale, oceano/cielo, creature/animazione, camera follow/free/orbit, local scene, picking, perf/adaptive), rendendo difficile evolvere verso realismo elevato senza regressioni e conflitti.

## 1. Obiettivi

- Separare sottosistemi grafici con interfacce chiare e dipendenze minimizzate.
- Preservare comportamento attuale (refactor non comportamentale nella prima fase).
- Abilitare lavoro parallelo (G2–G7) su moduli diversi.
- Mantenere budget prestazioni (instancing, LOD, quality tiers, riuso oggetti).

## 2. Struttura modulare proposta

```text
components/simulation/
  Planet3DView.tsx            # orchestratore sottile (mount/unmount, wiring, loop)
  planet/
    PlanetTerrainSystem.ts     # mesh sfera, displacement, LOD texture+geometry, materiali terreno
    OceanAtmosphereSystem.ts  # oceano, onde, cielo, nuvole, fog/exposure hooks
  creatures/
    CreatureVisualMapper.ts   # frame/state -> CreatureVisualDescriptor (usa spec G1)
    CreatureInstancePool.ts   # gestione InstancedMesh/parti, capacità, colori, matrici
    CreatureAnimator.ts       # integrazione motion/living/body pose/LOD anim
  camera/
    CameraController.ts       # orbit/follow/free, transizioni, input drag/tap routing
    LocalSceneController.ts   # viewport locali, patch, flora/terreno locale (wrap localScene)
  interaction/
    PickingSelection.ts       # raycast, mapping instance->organism, selection ring
  perf/
    FrameBudget.ts            # misure costo update, redraw policy, downgrade signals

lib/visual/                   # (nuovo, puro dove possibile)
  creatureVisualDescriptor.ts
  visualLod.ts
  colorAndMaterial.ts
```

> Nomi indicativi: adattare alla struttura reale del repo e alle convenzioni esistenti. Estrarre per passi piccoli (un sottosistema alla volta).

## 3. Confini e dipendenze

- **`simulation/*` → solo lettura dati esposti:** nessun import che modifichi stato sim. Il renderer dipende da `types` (`RenderFrame`, `ViewportFrame`, ecc.) e da lib pure.
- **`CreatureVisualMapper`**: unico consumatore diretto dei campi per-creatura del frame per produrre descriptor (G1). `CreatureInstancePool/Animator` consumano descriptor + stato temporale.
- **`PlanetTerrainSystem`**: possiede texture/heightmap/geometry del pianeta globale; espone API per query altezza/normale/superficie necessarie a posizionare creature/ring (riuso logica esistente).
- **`CameraController`**: emette stato camera (posizione, target, distanza, mode) usato da LOD, culling e richieste viewport.
- **`LocalSceneController`**: incapsula `localScene` e logica `requestViewport` locale/refresh/recenter, separata dal pianeta globale.
- **`FrameBudget`**: centralizza metriche (ms update creature, redraw interval, frame times) per tuning e quality adaptation.

## 4. Contratto di loop (alto livello)

1. Input: `frame`, `viewportFrame`, `selectedOrganismId`, `cameraMode`, `quality`, callback `onRequestViewport/onSelect/onSlow`.
2. `CameraController.update(now, dt)` → camera state.
3. Se serve: `PlanetTerrainSystem.applyViewport(frameOrPatch)`, `LocalSceneController.update(...)`.
4. `CreatureAnimator` + `CreatureVisualMapper` → pose/descriptor per creature visibili (budget/cap).
5. `CreatureInstancePool.commit(...)` → update istanze (solo dirty/necessario).
6. `PickingSelection` usa camera + pool mapping.
7. Render; `FrameBudget` registra e segnala.

## 5. Strategia di migrazione (a basso rischio)

- **Fase M1 (refactor meccanico):** estrarre funzioni/helper e tipi interni in file senza cambiare logica/ordine operazioni; `Planet3DView` resta l’entrypoint.
- **Fase M2:** introdurre moduli con stato incapsulato (terrain, ocean/sky) e testare parità visiva.
- **Fase M3:** introdurre `CreatureVisualDescriptor` path (feature flag) e migrare progressivamente parti/animazioni.
- **Fase M4:** ottimizzare e specializzare tier realistici (G2+), mantenendo fallback.

## 6. Hotspot e coordinamento

- **Lock soft consigliato:** un solo agente alla volta su refactor strutturale di `Planet3DView.tsx` e `qualityProfile.ts`; altri lavorano su moduli nuovi o aree disgiunte (UI, docs, asset/material libs) previa registrazione in `GRAPHICS_COORDINATION.md`.
- Evitare di mescolare refactor e cambiamenti visivi nello stesso commit.
- Ogni estrazione: build + test + smoke visivo manuale documentato.

## 7. Metriche di successo G1 (architettura)

- Riduzione dimensione/complessità di `Planet3DView.tsx` e chiara ownership dei moduli.
- Nessuna regressione funzionale (selezione, camere, viewport, qualità, 2D fallback invariato).
- Possibilità di implementare G2 creature in `creatures/*` senza toccare terrain/camera.
- Baseline prestazioni non peggiore (o migliorata) a parità di qualità.
