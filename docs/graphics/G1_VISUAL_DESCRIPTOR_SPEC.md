# G1 — Specifica `CreatureVisualDescriptor` (bozza implementabile)

**Stato:** design G1 (nessuna implementazione nel codice del repo in questa sessione)  
**Obiettivo:** introdurre un boundary unico, puro e **read-only** tra dati di simulazione/render frame e rappresentazione grafica delle creature, senza duplicare logica biologica.

## 1. Principi

- **Read-only verso la simulazione:** il descriptor e le funzioni che lo producono leggono solo dati esposti (`RenderFrame`, `Organism` da detail fetch read-only, `SpeciesGenomeStats`, metadati UI come selezione) e non mutano mai stato in `simulation/*`.
- **Nessuna logica biologica duplicata:** non ricalcolare fitness, riproduzione, metabolismo, decisioni, predazione, ecc. Se un segnale non esiste nel frame/snapshot, il renderer usa un fallback visivo neutro o espone un campo “sconosciuto” (mai inventare eventi).
- **Deterministico dove possibile:** stesso input (id, tick/versione, tratti/genoma/attributi disponibili, stato qualità) → stesso descriptor/variazione stabile (hash di `organismId/speciesId` per dettagli estetici).
- **Scalabile per LOD/qualità:** il descriptor include suggerimenti per tier di geometria/materiale/animazione, risolti dal renderer in base a distanza, profilo qualità e budget.
- **Additivo e compatibile:** prima adozione può affiancare il mapping attuale (`creatureAnatomy`, `creatureShape`, logiche in `Planet3DView`/`PlanetCanvas`) dietro feature flag o percorso parallelo.

## 2. Sorgenti dati disponibili (attuali)

### 2.1 Per-creatura nel `RenderFrame` (`types/index.ts`, `simulation/core/renderFrame.ts`)
Array indicizzati in parallelo (stesso ordine, lunghezza `n`):
- Identità/posizione: `organismsId[i]`, `organismsX[i]`, `organismsY[i]`
- Specie: `organismsSpecies[i]` (`speciesId % 65535`, per disegno/colore)
- Tratti/attributi visuali: `organismsSize[i]`, `organismsSpeed[i]`, `organismsCarnivory[i]`, `organismsVision[i]`, `organismsEvasion[i]`, `organismsHuntingSkill[i]`
- Stato energetico (animazione): `organismsEnergy[i]` (dal mondo, read-only)
- Derivato client: `organismsEnergyGain?` (calcolato in `lib/motionInterpolation.ts`, **non** dal mondo)

**Nota:** `RenderFrame` non include `age`, `genome.ext` completo, `brain`, `home/memory` per ogni individuo; questi richiedono `requestOrganismDetail` (read-only) o aggregati (`speciesGenomeStats`).

### 2.2 Aggregati/specie nel `RenderFrame`
- `speciesTree: SpeciesRecord[]`
- `speciesGenomeStats: SpeciesGenomeStats[]` (media/min/max/stdDev per tratto base, distanze, `habitat` opzionale)

### 2.3 Dettaglio organismo (on-demand, read-only)
- `Organism`: `id`, `speciesId`, `position`, `energy`, `age`, `genome` (`BaseGenome` + `ext?`), `alive`, `home`, `memory`, `brain` (Float32Array) — utile per inspector e, in futuro, per rappresentazioni ad alto dettaglio/ritratto, **mai** per alterare sim.

### 2.4 Contesto renderer/UI
- `tick`, `year`, `planetWidth/Height`, stato camera/modo (`orbit|follow|free`), distanza camera, `selectedOrganismId`, `QualityProfile`, viewport locale/globale.

## 3. Tipi proposti (additivi, suggeriti in `lib/visual/` o `types/visual.ts`)

```ts
export type VisualGait = "idle" | "walk" | "trot" | "run";
export type VisualDietClass = "herbivore" | "omnivore" | "carnivore";
export type SurfaceMaterialClass = "skin" | "hide" | "fur" | "scales" | "carapace";

export interface CreatureMorphology {
  /** Scala complessiva mondo/render (derivata da size + scale sistema). */
  scale: number;
  /** Proporzioni principali (unità normalizzate locali, coerenti con anatomia attuale). */
  bodyLength: number;
  bodyHeight: number;
  bodyWidth: number;
  headScale: number;
  neckLength: number;
  limbLength: number;
  limbThickness: number;
  tailLength: number;
  tailThickness: number;
  /** 0..1: ornamentazione difensiva/visiva (spine, creste) derivata da tratti es. evasion. */
  ornamentation: number;
  /** 0..1: robustezza apparente (può mappare a size/morfologia estesa, senza inventare dati). */
  bulk: number;
}

export interface CreatureSurface {
  /** Colore base specie/individuo (HSL/hex); derivato stabile da speciesId (+ variazione id opzionale). */
  baseColorHsl: { h: number; s: number; l: number };
  secondaryColorHsl: { h: number; s: number; l: number };
  pattern: "none" | "mottled" | "spots" | "stripes" | "countershade";
  materialClass: SurfaceMaterialClass;
  roughness: number; // 0..1, tier materiale
  sheen: number;     // 0..1
}

export interface CreatureMotionState {
  /** Normalizzata 0..1 rispetto a range velocità/scala render. */
  speedNorm: number;
  /** rad/s o normalizzato, segno/valore coerente con convenzione render. */
  turnRate: number;
  /** Direzione visuale corrente (heading/yaw) nel sistema usato dal renderer. */
  heading: number;
  gait: VisualGait;
}

export interface CreatureBehaviorCues {
  /** 0..1: segnali derivati SOLO da dati reali disponibili. */
  feeding: number;   // es. da energy gain positivo + quasi fermo (con limiti documentati)
  resting: number;   // es. fermo da tempo + non feeding (derivato render, read-only)
  alert: number;     // opzionale: solo se esponibile da frame/eventi; default 0
  locomotion: number;// intensità movimento
}

export interface CreatureLodHints {
  geometryTier: 0 | 1 | 2 | 3;  // 0 minimo, 3 massimo
  materialTier: 0 | 1 | 2;
  animationTier: 0 | 1 | 2;
  renderParts: { head: boolean; limbs: boolean; tail: boolean; eyes: boolean; ornaments: boolean; shadow: boolean };
}

export interface CreatureVisualDescriptor {
  organismId: number;
  speciesId: number;
  /** true se l'istanza è selezionata in UI. */
  selected: boolean;
  /** Posizione griglia (source of truth per sim); il renderer interpola per display. */
  gridPosition: { x: number; y: number };
  /** Classe dietetica indicativa da carnivory (visuale). */
  dietClass: VisualDietClass;
  morphology: CreatureMorphology;
  surface: CreatureSurface;
  motion: CreatureMotionState;
  cues: CreatureBehaviorCues;
  lod: CreatureLodHints;
  /** Metadati per stabilità visiva/caching. */
  variationSeed: number; // es. hash stabile organismId
}
```

> **Nota:** i nomi/campi sono una bozza; l’implementazione deve allinearsi ai tipi reali (`QualityProfile`, convenzioni heading, unità scala) e restare minimale nel primo passo.

## 4. Regole di mapping (da dati attuali)

- **Identità/specie:** `organismId = organismsId[i]`, `speciesId` logico da id reale quando disponibile; per colore usare mapping coerente con `lib/speciesColor.ts` (hue deterministica per specie). `variationSeed = hash(organismId)`.
- **Morfologia (G1, compatibile):**
  - Base da `organismsSize/Speed/Carnivory/Vision/Evasion/HuntingSkill` normalizzati con gli stessi range di `TRAIT_RANGES` usati da `computeCreatureAnatomy` (`lib/creatureAnatomy.ts`), per non cambiare il significato visivo iniziale.
  - `scale` coerente con `worldScale/creatureScale`.
  - `ornamentation` da `evasion` (spine) come oggi; `dietClass` da soglie carnivory.
- **Superficie:** `baseColorHsl` da `speciesHue/speciesColor`; variazione secondaria/pattern opzionale ma **deterministica** per `variationSeed/speciesId` (no random runtime). `materialClass` inizialmente derivabile da tratti/bioma noto (fallback `skin/hide`).
- **Motion:** `speedNorm` da velocità visuale interpolata (`motionInterpolation`/`naturalMotion`), `heading` da track, `gait` da soglie normalizzate (`bodyAnimation.normalizedSpeed`).
- **Cues:**
  - `feeding`: derivabile da `organismsEnergyGain > soglia` (EAT_GAIN_PER_TICK) e bassa velocità; documentare limite “energia al massimo”.
  - `resting/idle`: derivabili come in `lib/livingBehavior.ts` (tempo fermo render-only).
  - `alert`: **0** finché non esiste segnale reale nel frame/evento; vietato inferire da heuristics non fondate sui dati.
- **LOD hints:** funzione pura di `distanceToCameraInScales`, `QualityProfile` (`creatureParts`, `maxCreatures`), visibilità in local scene e stato selezione (selezionato può ricevere boost entro budget).

## 5. API suggerite (pure)

```ts
// Esempio di shape API (da raffinare in implementazione)
export function buildCreatureVisualDescriptor(input: {
  index: number;
  frame: RenderFrame;
  visualState?: { interpolatedX: number; interpolatedY: number; energyGain: number; heading: number; visSpeed: number; turnRate: number; cameraDistance: number };
  selected: boolean;
  quality: QualityProfile;
}): CreatureVisualDescriptor;

export function buildCreatureVisualDescriptorsBatch(...): CreatureVisualDescriptor[]; // o iteratore zero-alloc dove possibile
```

**Performance:** evitare allocazioni per frame/creatura (riuso oggetti/typed buffers dove serve), coerente con le ottimizzazioni esistenti di `Planet3DView`.

## 6. Piano di adozione (incrementale, sicuro)

1. **G1-a:** introdurre tipi + funzioni pure in modulo nuovo, senza cambiare output del renderer.
2. **G1-b:** far consumare al renderer il descriptor per un sottoinsieme di campi (es. morph/surface/motion) mantenendo parità visiva.
3. **G2+:** estendere descriptor (anatomia/materiali/anim cues) e renderer per qualità realistica a tier alti, con fallback legacy per tier bassi.
4. **Test:** unit test puri su mapping (normalizzazione, determinismo, limiti range, coerenza con `computeCreatureAnatomy`), snapshot visivi/manuali.

## 7. Non-obiettivi (G1)

- Nessuna modifica a `simulation/*` logica, a formati snapshot/salvataggio, né a semantica di `WorkerCommand/WorkerEvent` esistenti (eventuali estensioni solo additive e approvate).
- Nessun asset esterno o dipendenza nuova richiesta in questa fase di design.
- Nessuna “intelligenza visiva” che inventi comportamenti non presenti nei dati.
