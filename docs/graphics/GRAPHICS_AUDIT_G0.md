# EvoWorld — Graphics Revolution: Audit tecnico indipendente (G0)

**Data:** 2026-11-16  
**Agente:** Big Pickle (OpenCode)  
**Ambito audit:** comparto grafico/rendering, UI di osservazione, prestazioni grafiche e integrazione sim↔render (solo lettura)  
**Fonti:** repository remoto `misteryone2/Evoworld` (branch `main`, stato analizzato via contenuti raw GitHub) — file principali: `app/page.tsx`, `components/simulation/Planet3DView.tsx`, `components/simulation/PlanetCanvas.tsx`, `lib/qualityProfile.ts`, `lib/bodyAnimation.ts`, `lib/animationLod.ts`, `lib/motionInterpolation.ts`, `lib/livingBehavior.ts`, `simulation/core/world.ts`, `types/index.ts` (riferimenti), `docs/GENOMA-v1.11.0.md`, `CHANGELOG.md`, `LEGGIMI.txt`, `package.json`.

> **Nota operativa (importante):** la working directory locale (`C:\Users\matti\Documents\Progetto predefinito`) era **vuota** durante l’audit: non è presente un checkout del repository. Di conseguenza **non ho eseguito** build, test, lint, benchmark o profiling runtime nel browser/dispositivo. Lo stato di build/test riportato sotto deriva dalle dichiarazioni del maintainer in `LEGGIMI.txt`/`CHANGELOG.md` e va trattato come **non verificato da questo agente**. Prima di qualsiasi modifica va rieseguita la baseline su checkout reale.

---

## 1. Sintesi esecutiva

EvoWorld dispone già di una base grafica 3D significativa (Next.js + React + Three.js, rendering procedurale a istanze, interpolazione/animazione del corpo e comportamenti “vivi”, LOD animazione, quality profiles, fallback 2D, modalità camera/follow/free, terreno sferico con displacement e viewport LOD, oceano/nuvole/cielo in follow). La pipeline è in buona parte separata dalla simulazione biologica.

Tuttavia, rispetto all’obiettivo **“realistico, dettaglio massimo, PC e mobile”**, il sistema attuale è ancora prevalentemente **procedurale-lowpoly/stilizzato**: creature composte da primitive semplici, materiali Standard/Lambert senza pipeline PBR avanzata/texture authorate per creatura, animazione procedurale senza scheletro/IK/skinning, vegetazione e ambiente locali semplificati, acqua/atmosfera non fotorealistiche, assenza visibile di post-processing/cinematic lighting pipeline completa e di un contratto formale `CreatureVisualDescriptor` read-only.

**Rischio principale della rivoluzione grafica:** aumentare drasticamente costo GPU/CPU/memoria (draw call indirette via istanze ma molti mesh/parti, geometria, ombre, texture, trasparenze, fog/overlay) e introdurre regressioni di leggibilità, stabilità mobile e disallineamento visivo↔simulazione se il mapping biologico non viene formalizzato.

**Opportunità principale:** evolvere in modo incrementale sfruttando l’infrastruttura esistente (instancing, LOD, quality profiles, local scene, animation layers) introducendo un livello di astrazione visiva (descriptor + asset/param pipeline) senza toccare `simulation/biology|ecology|evolution|planet|core` rules.

---

## 2. Architettura grafica esistente (mappa)

### 2.1 Entry/UI e orchestrazione vista
- **`app/page.tsx`**: orchestratore client-side. Gestisce `useMultiverse`/worker frames, qualità (`useQuality`), modalità vista (pianeta/confronto/salvataggi/storico), camera (`orbit|follow|free`), selezione organismo, pannelli (specie/stats/inspector), modalità immersiva, sheet mobile, throttling pannelli (`PANEL_REFRESH_MS`, `INSPECTOR_REFRESH_MS`), richiesta dettaglio organismo e viewport terreno.
- **Renderer scelto da profilo:** `quality.profile.renderer === "canvas2d"` → `PlanetCanvas`, altrimenti → `Planet3DView` (keyata per livello qualità).
- **Separazione UI/sim:** la UI consuma `RenderFrame`/`ViewportFrame` e invia comandi (`requestViewport`, `setPerformance`, controlli sim). Non emergono mutazioni della logica biologica dal codice UI analizzato.

### 2.2 Rendering 3D principale
- **`components/simulation/Planet3DView.tsx`** (file molto esteso, ~2180+ righe dal fetch parziale): cuore del rendering WebGL/Three.js.
  - **Scene:** `WebGLRenderer` (antialias/pixelRatio da profilo), `PerspectiveCamera`, `OrbitControls`, luci (hemisphere + directional sun, ombre solo profilo alto), fog/clear color differenti per orbit vs follow/free.
  - **Pianeta:** sfera con `DataTexture` terreno e displacement da `ViewportFrame`/heightmap (vertex base pristine + ricostruzione geometria per tier tessellation). LOD terreno per distanza camera (`TERRAIN_LOD_TIERS`, filtrati da `terrainMaxWidth`).
  - **Oceano:** mesh sferica trasparente separata (`MeshStandardMaterial`, normal map onde, animazione offset; visibilità diversa in locale/globale).
  - **Creature:** rendering **a istanze** per parti multiple (body, head, eyes, tail, jaw, spikes, legs, ears, shadow) con capacità legata a `maxCreatures + slack` e dettaglio parti `1|2|3` da profilo. Materiali Lambert (profili bassi) o Standard (altri), vertex colors per body/head/tail/spikes/legs/ears in alcuni casi.
  - **Anatomia/proporzioni:** da `lib/creatureAnatomy.ts` (non letto integralmente qui) + scala da `lib/worldScale`/`simulation/core/scale`.
  - **Animazione (solo visuale):** buffer interpolazione (`lib/motionInterpolation.ts`), moto/heading naturale (`lib/naturalMotion.ts`, `creatureHeading.ts`), posa corpo procedurale (`lib/bodyAnimation.ts`), comportamenti “vivi” (`lib/livingBehavior.ts`), scheduler redraw (`lib/animationScheduler.ts`), LOD animazione (`lib/animationLod.ts`), culling/contesto follow (`followCull`), camera follow/free/orbit e terreno locale/flora (`createLocalScene`, `localGround`, ecc.).
  - **Picking/selezione:** raycast su body mesh, mapping `instanceId -> organismId`; ring di selezione; logiche tap-vs-drag.
  - **Locale/follow:** richiesta viewport locale ad alta densità attorno al target, ricentro, patch radius, refresh vegetazione, flora 3D locale se supportata dal profilo.
  - **Ottimizzazioni presenti:** riuso oggetti scratch (vector/matrix/quaternion/color), `commitPart`/vettori locali (come da changelog), update istanze condizionale, costo medio per decidere intervallo minimo redraw, cap creature disegnate/stride (in ecosistema più ampio), tier texture/geometria.
- **`components/simulation/localScene.ts`** (importato, non letto): scena locale dettagliata (terreno vicino + flora/acqua locale?) — dipendenza chiave per follow realism.

### 2.3 Rendering 2D fallback
- **`components/simulation/PlanetCanvas.tsx`**: canvas 2D con texture terreno offscreen (`ImageData`) da `ViewportFrame`, redraw creature per frame, LOD semplice (dot sotto soglia raggio), stride campionamento su `maxCreatures`, picking nearest organism su click, ring selezione. Usa `terrainColor`/stagioni/acqua e `drawCreature`/`creatureShape` 2D.

### 2.4 Pipeline di qualità/prestazioni
- **`lib/qualityProfile.ts`**: livelli `2d|basso|medio|alto`, scelta auto/manuale, cap pixel ratio, antialias, max creature, parti, segmenti, max terrain width, refresh terrain, intervalli worker/species stats, portrait 3D, world size default, parametri scena locale (`localTerrainSegments`, `floraMax`). Include classificazione device e downgrade automatico su frame lenti (mediana).
- **`app/page.tsx` + `useQuality`** (hook non letto): applica profili e segnala lentezza (`onSlow`).
- **Budgeting implicito:** riduzione parti/geometria/texture/refresh e disegno subset; animazione LOD a distanza; redraw condizionale.

### 2.5 Dati e contratto sim→render (osservato)
- **Input rendering:** `RenderFrame` (posizioni/id/specie/attributi visualmente utili, energia/derivati per animazione dove previsto), `ViewportFrame` (terreno/vegetazione/elevazione/temperatura/acqua fluviale/lago/parametri area), richieste viewport globali/locali.
- **Derivazioni visuali:** heading, velocità visiva, posa, stati living, anatomia/colore specie calcolati lato render/lib da dati del frame/genoma esposto. **`organismsEnergyGain`** calcolato lato rendering in `motionInterpolation` (documentato in changelog come derivazione visuale, non modifica sim) — punto da mantenere esplicito nel contratto.
- **Nessun contratto unico tipizzato “visual descriptor”** trovato: il mapping è distribuito tra `Planet3DView`, `PlanetCanvas`, `creatureAnatomy`, `creatureShape`, `speciesColor`, anim libs.

### 2.6 UI/HUD/osservazione
- **`app/page.tsx`**: `Controls`, `CameraModeBar`, `ImmersiveHud`, `SpeciesPanel`, `StatsPanel`, `OrganismInspector`, `PlanetSelector/Comparison`, `SaveLoadPanel`, `HistoryPanel/EventTimeline`, `StartScreen`, `QualitySelector`. Gestione mobile sheet e drawer immersivo.
- **Limite audit:** componenti UI specifici (HUD/pannelli/inspector) non letti nel dettaglio; valutazione basata su wiring e requisiti richiesti.

---

## 3. Stato build/test e modifiche concorrenti

### 3.1 Build/test (dichiarati, non verificati qui)
Da `LEGGIMI.txt` (v1.11.0):
- Comandi consigliati: `npm install --legacy-peer-deps`, `npx next build`, `npx tsc --noEmit`, `npx vitest run --testTimeout=60000`
- Risultato atteso: **680 passati, 5 falliti, 685 totali**
  - `tests/reproduction.test.ts` ×2: preesistenti
  - `tests/fauna180.test.ts` ×1: da confermare
  - `tests/vibeGenomeV1110.test.ts` ×2: incoerenze suite/specifica
- Verifiche non effettuate (dichiarate): FPS/fluidità reale mobile/PC, redraw in pausa a schermo, benchmark, run lunghi (10k tick limitati), salvataggi reali, selezione nuovi geni

**Classificazione per questo audit:** baseline funzionale **ambigua/non riprodotta localmente**; ogni futura modifica grafica deve riallineare baseline prima/dopo su ambiente di lavoro reale.

### 3.2 Stato repository e altri agenti
- **Workspace locale:** vuoto, nessun `.git`, nessun file di coordinamento, nessuna modifica rilevabile.
- **Repo remoto:** non ispezionati branch/PR/issues/commenti di coordinamento in questa sessione; non posso escludere lavoro parallelo in corso su altri branch/fork o commit successivi.
- **Azione richiesta agli altri agenti / step successivo:** prima di toccare codice, eseguire `git status`, `git branch -a`, revisione diff locali/remoti e cercare file `GRAPHICS_*`, `docs/graphics*`, issue/PR di coordinamento.

---

## 4. Problemi e gap rispetto all’obiettivo (“realistico, dettaglio massimo, PC+mobile”)

### 4.1 Creature e anatomia (gap alto)
- **Geometria procedurale a primitive:** sfere/coni/cilindri/dischi (body/head/eyes/tail/jaw/spikes/legs/ears/shadow). Silhouette riconoscibile ma non anatomia realistica (muscolatura, articolazioni vere, mani/piedi/zampe articolate, collo/spina, cranio/senso-organi dettagliati).
- **Segmentazione bassa:** `creatureSegments` 6x4–10x8; forme low-poly anche al massimo.
- **Nessuno scheletro/skinning/IK:** animazione per trasformazioni di parti rigide; rischio di interpenetrazioni/rigidità e locomozione poco credibile su terreni complessi.
- **Dettaglio volto/sensi limitato:** occhi semplici, mandibola/orecchie opzionali per LOD/dieta; mancano palpebre, pupille/iridi, narici, bocche articolate, micro-movimenti facciali.
- **Mappatura bio→visuale non formalizzata:** deriva da anatomia/shape/geni in più punti; difficile garantire coerenza e manutenibilità.

### 4.2 Materiali, texture e superfici (gap alto)
- **Materiali base:** `MeshStandardMaterial`/`MeshLambertMaterial` con roughness/metalness uniformi e vertex colors; niente texture map albedo/normal/roughness/ao dedicate a pelle/pelo/scaglie/corazza, né variazioni micro-superficiali.
- **Acqua:** shader/material custom minimo (normal map onde + trasparenza) ma non sistema acqua realistico completo (rifrazione, profondità, shore interaction, caustiche leggere opzionali, schiuma coerente).
- **Terreno:** colorazione/overlay procedurale da viewport; displacement presente ma qualità visiva dipende da risoluzione texture/tessellazione LOD e materiali del suolo poco stratificati.

### 4.3 Animazioni e locomozione (gap medio-alto)
- **Punti di forza:** interpolazione toroidale continua, smoothing heading/velocità visiva, posa procedurale (walk/trot/gallop blend), comportamenti idle/eat/rest/breath, LOD animazione graduale.
- **Limiti per realismo:** niente foot planting/IK, contatto suolo non vincolato al relief fine, transizioni comportamentali limitate agli stati derivati (no attacco/fuga/corteggiamento visualizzati come set ricchi), possibile slittamento percepito su pendenze/velocità variabili; sincronizzazione animazione-terreno locale da verificare.

### 4.4 Terreno, vegetazione, biodiversità (gap alto)
- **Terreno globale:** sfera + texture/displacement; dettaglio alto concentrato nel “local scene” (follow/free) con limiti di patch/raggio/refresh.
- **Vegetazione:** `floraMax` e scena locale suggeriscono istanze procedurali; non emerge pipeline di biomi vegetazionali realistici diversificati (specie vegetali/forme/età/densità coerenti per bioma/stagione) né wind animation/variazione materiale ricca.
- **Biodiversità visiva:** differenziazione individui/specie probabilmente insufficiente per obiettivo “massimo dettaglio”.

### 4.5 Acqua, illuminazione, atmosfera (gap medio-alto)
- **Cielo/atmosfera:** gradiente cielo in follow, fog, sun/hemisphere; ombre solo su `alto` e limitate (shadow map singola direzionale). Mancano scattering atmosferico avanzato, nuvole volumetriche/stratificate evolute, ciclo luce meteo/ora (se pertinente), riflessi ambientali avanzati.
- **Coerenza PC/mobile:** tradeoff forte ma necessario; serve degradazione progressiva più formalizzata per effetti costosi.

### 4.6 Interazioni visive ecosistema (gap medio)
- **Presente:** picking, follow, indicatori/posa, stati living derivati da energia/movimento.
- **Mancante (da progettare senza simulazione fittizia):** segnali visivi chiari e verificabili per caccia/fuga/alimentazione/riposo/socialità derivati esclusivamente da eventi/stati reali esposti dal frame/snapshot; rischio di “decorazioni” se non vincolati ai dati.

### 4.7 UI/HUD/strumenti osservazione (gap medio, da audit UI dettagliato)
- UI già ricca (pannelli, inspector, timeline, confronto, salvataggi, qualità, camera, immersivo/mobile sheet). Obiettivo richiede revisione qualitativa forte: leggibilità, gerarchie visive, schede creatura/genetica/grafici evolutivi, adattività desktop/mobile, accessibilità/touch ergonomics. **Audit visivo runtime necessario.**

### 4.8 Prestazioni e scalabilità (rischio alto nella trasformazione)
- **Basi buone:** instancing, cap draw subset, LOD terreno/animazione, quality profiles, redraw condizionale, scratch reuse.
- **Punti critici potenziali:**
  - Molti `InstancedMesh`/parti per creatura × capacità buffer (memoria + update CPU matrici/colori) — costo cresce con dettaglio realistico.
  - `Planet3DView.tsx` monolitico: complessità manutentiva e rischio regressioni in ottimizzazioni.
  - Ombre, trasparenze (acqua), scene locali/flora e future texture/PBR possono saturare fill-rate su mobile.
  - Refresh/ricostruzione geometria terreno e richieste viewport locali/globali: possibili spike.
  - 2D fallback e 3D devono mantenere corrispondenza informativa minima ma con budget diversi.
- **Carichi richiesti (100/500/1500/3000):** non misurati in questo audit; servono benchmark ripetibili per livello qualità e piattaforma.

### 4.9 Correttezza rappresentativa e vincoli biologici
- `RenderFrame`/viewport sono payload render-oriented: va preservata la regola che **render non altera sim** e che **ogni individuo visualizzato corrisponda a un organismo reale** (o a campionamento esplicito/dichiarato, già presente).
- `organismsEnergyGain`/stati living: derivazioni visuali ammesse solo se marcate read-only e non retro-azionanti.

---

## 5. Opportunità tecniche (leveraging dell’esistente)

1. **Formalizzare `CreatureVisualDescriptor` (read-only):** layer puro che mappa `Organism/Genome/Species + RenderFrame state` → parametri visivi (morfologia, palette/material tags, scala, ornamentazione, LOD hints, anim state inputs) senza logica biologica duplicata.
2. **Modularizzare il renderer:** estrarre da `Planet3DView.tsx` sottosistemi (terrain/ocean/sky, creature instancing, animation, camera/local scene, picking, performance monitor) dietro interfacce stabili.
3. **Evoluzione graduale delle creature:** mantenere instancing ma passare a geometrie/anatomie più ricche per livelli alti (parti articolate aggiuntive o kit procedurale più denso) con LOD aggressivo e fallback attuali.
4. **Material system scalabile:** palette/material presets per biomi/specie + supporto texture/normal su tier alti, Lambert/unlit semplificati su tier bassi.
5. **Animazione a layer:** conservare locomozione/idle procedurale esistente e aggiungere layer contestuali (head/look-at, feed/attack/rest cues) guidati da segnali reali del frame.
6. **Ambiente locale come banco prova realismo:** usare follow/free/local scene per qualità massima vicino alla camera, con impostor/billboard/istanze semplici lontano.
7. **Strumentazione prestazioni:** metriche per frame CPU/GPU-time proxy, count istanze visibili, update creature ms, terrain rebuild/upload, memoria texture/buffer, per scenari 100/500/1500/3000.

---

## 6. Priorità consigliate (allineate a G1→G9)

| Priorità | Intervento | Valore | Rischio | Dipendenze |
|---|---|---:|---:|---|
| P0 | **Baseline verificata + coordinamento** (build/test/profiling, inventario file toccati, doc condiviso) | Critico | Basso | Checkout repo, ambiente |
| P1 | **`CreatureVisualDescriptor` + boundary audit sim/render** | Molto alto | Medio-basso | Tipi/frame esistenti |
| P1 | **Decomposizione `Planet3DView` + hook/moduli render** | Alto | Medio | Nessuna modifica sim |
| P2 | **Creature G2/G3:** anatomia/proporzioni/dettagli/materiali scalabili con LOD | Molto alto | Alto | P1 descriptor/modularità |
| P2 | **Animazioni G4:** transizioni/contatti/variazione naturale, sempre derivate da stato reale | Alto | Alto | P2 creature rig/pose |
| P3 | **Ambiente/vegetazione/acqua/atmosfera G5** (soprattutto locale, poi globale) | Alto | Alto | Profiling, asset/material budget |
| P3 | **Interazioni visive G6** mappate a eventi/stati reali | Medio-alto | Medio | Dati frame/stats affidabili |
| P3 | **UI/HUD G7** desktop+mobile + inspector/genetica/grafici | Alto | Medio | Componenti UI esistenti |
| P4 | **Ottimizzazione e validazione G8/G9** su PC/mobile e carichi 100–3000 | Critico | Medio | Tutte le precedenti |

---

## 7. Rischi principali e mitigazioni

- **Rischio: regressioni biologiche/accoppiamento render↔sim.**  
  *Mitigazione:* vietare import/uso mutativo di `simulation/biology|ecology|evolution` state; descriptor read-only; test di snapshot/hash mondo invariato a parità di seed/tick (dove disponibili).
- **Rischio: crollo FPS/memoria su mobile.**  
  *Mitigazione:* budget per livello qualità, feature flags grafiche, target frame-time, LOD aggressivo, texture atlasing/riuso, no effetti costosi su tier bassi.
- **Rischio: conflitti multiagente su file caldi (`Planet3DView.tsx`, `app/page.tsx`, `qualityProfile.ts`, shader/material libs).**  
  *Mitigazione:* ownership per fase, PR/patch piccole, doc di coordinamento, evitare refactor massivi concorrenti.
- **Rischio: regressioni salvataggi/formati.**  
  *Mitigazione:* non toccare formato snapshot/salvataggio; eventuali metadati visivi separati e opzionali solo dopo approvazione.
- **Rischio: “realismo” visivo che mente sulla simulazione.**  
  *Mitigazione:* ogni animazione/interazione visiva tracciata a dato reale; fallback neutri quando il dato manca.
- **Rischio: baseline test già rossa.**  
  *Mitigazione:* registrare fallimenti preesistenti, non introdurne di nuovi, distinguere grafica vs sim nei report.

---

## 8. File interessati (probabili) e dipendenze

### Hotspot grafici
- `components/simulation/Planet3DView.tsx` (centrale)
- `components/simulation/PlanetCanvas.tsx`, `components/simulation/drawCreature.ts` (se presente), `localScene.ts`
- `lib/qualityProfile.ts`, `lib/quality.ts`/`useQuality.ts`, `lib/animation*.ts`, `lib/bodyAnimation.ts`, `lib/livingBehavior.ts`, `lib/motionInterpolation.ts`, `lib/naturalMotion.ts`, `lib/creatureAnatomy.ts`, `lib/creatureShape.ts`, `lib/creatureHeading.ts`, `lib/terrainColor.ts`, `lib/sphereProjection.ts`, `lib/worldScale.ts`, `lib/*Cull*`, `lib/follow*`
- `app/page.tsx` (wiring UI/camera/quality/viewport)
- `components/ui/*`, `components/species/*`, `components/organism/*` (HUD/inspector/panels)

### Contratti/dati condivisi (da toccare con cautela, preferibilmente additive)
- `types/index.ts` (RenderFrame/ViewportFrame/Organism types) — **solo estensioni compatibili e approvate se servono**
- `simulation/core/renderFrame.ts`, `viewportFrame.ts` (se serve esporre segnali visuali già calcolati, senza cambiare semantica sim)

### Documentazione/coordinamento (consigliati, non distruttivi)
- `docs/graphics/*` o `GRAPHICS_*.md` (audit, architettura, descriptor, benchmark, log decisioni)

### Dipendenze esterne attuali
- `three` (core + examples OrbitControls) — valutare aggiunte solo se necessarie e approvate (postprocessing, loaders, ecc.) con attenzione a bundle/mobile.

---

## 9. Interventi consigliati immediati (compatibili, senza conflitti)

1. **G0 completamento operativo (su checkout reale):** eseguire e registrare `build/tsc/vitest/benchmark`, screenshot PC/mobile, FPS e tempi update creature per 100/500/1500/3000.
2. **Creare documenti di coordinamento:** `GRAPHICS_COORDINATION.md` (stato fasi, ownership, lock soft su file), `GRAPHICS_BASELINE.md` (risultati reali), `GRAPHICS_ARCHITECTURE.md`.
3. **Definire e adottare `CreatureVisualDescriptor` (design prima, implementazione incrementale):** spec di campi, sorgenti dati read-only, unità/normalizzazioni, mapping LOD.
4. **Spike tecnico a rischio controllato:** prototipo di creatura più realistica su singolo LOD/feature flag + benchmark comparativo, senza rimuovere path esistente.
5. **Refactor sicuro:** estrazione moduli puri da `Planet3DView` (nessun cambio comportamento) per abilitare lavoro parallelo.

**Contributo più utile proponibile da questo agente ora (nessun conflitto sul repo):** consegna di audit G0, proposta di contratto `CreatureVisualDescriptor`, piano incrementale G1–G9 e template di coordinamento/benchmark — utilizzabili come base condivisa dagli altri agenti.

---

## 10. Proposta iniziale — `CreatureVisualDescriptor` (read-only, bozza)

Scopo: unico punto di traduzione **dati biologici/simulati → parametri visivi**, senza duplicare regole biologiche.

```ts
// bozza concettuale (da collocare in lib/visual o types/visual; additive)
export interface CreatureVisualDescriptor {
  id: number;
  speciesId: number;
  // morfologia/scala
  bodyScale: number;
  anatomy: {
    bodyLength: number; bodyRadius: number; neckLength: number; headScale: number;
    limbLength: number; limbThickness: number; tailLength: number; ornamentation: number;
  };
  // superficie/materiale
  surface: {
    baseColor: string; secondaryColor: string; pattern: "plain"|"spots"|"stripes"|"mottled";
    materialClass: "skin"|"fur"|"scales"|"carapace"; roughness: number; sheen: number;
  };
  // stato animazione derivato (read-only)
  motion: { speedNorm: number; turnRate: number; heading: number; gaitHint: "idle"|"walk"|"trot"|"run" };
  behaviorCue: { feeding: number; resting: number; alert: number; interaction: number }; // [0..1], da segnali reali
  // qualità/rappresentazione
  lod: { geometryTier: 0|1|2|3; materialTier: 0|1|2; animationTier: 0|1|2 };
  flags: { visible: boolean; selected: boolean; inLocalScene: boolean };
}
```

**Regole:** input solo da frame/snapshot/stats read-only; funzioni pure/deterministiche dove possibile; nessun import da moduli che mutano stato sim; cache per `id+tick/generation` lato render.

---

## 11. Prossimi passi (G1 pronti a partire)

- Validare questo audit contro checkout reale e stato altri agenti.
- Approvare/confutare il boundary `CreatureVisualDescriptor`.
- Definire baseline prestazionale misurata.
- Avviare G1: architettura grafica modulare + contratto dati + convenzioni LOD/material/asset.

*Fine audit G0 (indipendente, basato su evidenza disponibile in questa sessione).* 
