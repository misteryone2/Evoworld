import type { DataSource, SurfaceCovering } from "../phenotype/types";

/**
 * G2 — AnatomyDescriptor: contratto anatomico centrale. Deterministico, serializzabile, indipendente dal rendering.
 *
 * CONVENZIONI GEOMETRICHE (dettaglio in docs/graphics/G2_GEOMETRY_CONVENTIONS.md):
 *  - Mano destra: +Z avanti (muso), +Y su, +X lato SINISTRO della creatura. Unità = taglia unitaria; il renderer applica `sizeScale`.
 *  - Origine: x=0 sull'asse di simmetria; z centrato sull'estensione dei segmenti; y relativo all'asse del corpo (NON al terreno).
 *  - Segmento: `center` + `halfExtents` (semiassi lungo X, Y, Z). sphere/ellipsoid: ellissoide; capsule: cilindro con calotte;
 *    cone: asse lungo Z, base a +Z, apice a -Z.
 *  - Appendice: `position` = radice sul segmento ospite, `direction` = versore unitario, `length` lungo `direction`.
 *    La punta è stimata in linea retta (`position + direction*length`): gli angoli di piegatura delle sezioni non sono modellati.
 *  - Il terreno NON è y=0: `proportions.groundY` è la quota (in questo sistema) dei piedi d'appoggio, determinabile solo se
 *    esistono zampe d'appoggio (direction.y <= -0,5); altrimenti null.
 * Nessun import da React, Three.js o dal renderer.
 */
export const ANATOMY_SCHEMA_VERSION = 2 as const;
/** Appendici che possono muovere l'organismo. Usate per la coerenza della modalità locomotoria. */
export const LOCOMOTOR_KINDS: readonly AppendageKind[] = Object.freeze<AppendageKind[]>(["leg", "arm", "tentacle", "fin", "tail", "flagellum", "pseudopod"]);
/** Tetto di appendici per organismo (protezione di performance e di validità). */
export const MAX_APPENDAGES = 64;

export type BodyPlanFamily = "simple" | "multicellular" | "complex" | "specialized";
/** Come è stato scelto il body plan (nessun gene lo codifica). */
export type BodyPlanOrigin = "explicit" | "legacy-default" | "seeded-speculative";
export type SymmetryType = "spherical" | "bilateral" | "radial" | "none";
export type SegmentRole = "core" | "head" | "thorax" | "abdomen" | "trunk" | "tail" | "lobe";
export type SegmentShape = "sphere" | "ellipsoid" | "capsule" | "cone";
export type AppendageKind = "leg" | "arm" | "tentacle" | "fin" | "tail" | "flagellum" | "claw" | "jaw" | "spine" | "plate" | "sensory" | "pseudopod";
export type AppendageSide = "left" | "right" | "mid";
export type JointType = "fixed" | "hinge" | "ball" | "segmental" | "flexible";
export type JointKind = "axial" | "root" | "internal";
export type LocomotionMode =
  | "sessile" | "amorphous" | "undulatory" | "limbless" | "bipedal" | "quadrupedal" | "hexapodal" | "multipedal" | "radial" | "appendage-driven";
export type DetailTier = 0 | 1 | 2 | 3;

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

export interface Segment {
  readonly id: string;
  readonly role: SegmentRole;
  readonly shape: SegmentShape;
  /** null per l'unica radice. */
  readonly parentId: string | null;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
}

export interface Appendage {
  readonly id: string;
  readonly groupId: string;
  readonly kind: AppendageKind;
  /** Sottotipo descrittivo (es. "eye", "ear", "antenna", "protective"); null se assente. */
  readonly variant: string | null;
  readonly segmentId: string;
  readonly side: AppendageSide;
  readonly index: number;
  /** Angolo (rad) per le appendici radiali, altrimenti null. */
  readonly angle: number | null;
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly length: number;
  readonly radius: number;
  /** Numero di sezioni articolate (1..3). */
  readonly sectionCount: number;
}

export interface Joint {
  readonly id: string;
  /** axial: segmento↔segmento; root: segmento→appendice; internal: tra sezioni di una appendice. */
  readonly kind: JointKind;
  readonly type: JointType;
  readonly dof: 0 | 1 | 2 | 3;
  readonly parentSegmentId: string | null;
  readonly childSegmentId: string | null;
  readonly appendageId: string | null;
  /** root: 0; internal: 1..sectionCount-1; axial: null. */
  readonly section: number | null;
}

export interface AnatomyBounds { readonly min: Vec3; readonly max: Vec3 }

export interface AnatomyProportions {
  readonly sizeScale: number;
  /** 0..1, 0,5 neutro. */
  readonly robustness: number;
  /** Estensione dei soli segmenti (AABB). */
  readonly bodyLength: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  /** Estensione complessiva: segmenti + appendici (punta stimata in linea retta, raggio incluso). */
  readonly extentLength: number;
  readonly extentWidth: number;
  readonly extentHeight: number;
  readonly bounds: AnatomyBounds;
  /** Quota dei piedi d'appoggio nel sistema del descriptor; null se non determinabile (nessuna zampa d'appoggio). */
  readonly groundY: number | null;
  /** Distanza tra il punto più basso dei segmenti e il terreno (>= 0); null se non determinabile. */
  readonly groundClearance: number | null;
  /** Distanza tra il punto più alto dell'organismo e il terreno; null se non determinabile. */
  readonly heightAboveGround: number | null;
}

export interface AnatomySurface {
  readonly covering: SurfaceCovering;
  /** 0..1 da MOR-01; null se il gene manca. */
  readonly furCoverage: number | null;
  /** 0..1 da MOR-02 (normalizzato sul suo massimo); null se il gene manca. */
  readonly armorCoverage: number | null;
}

export interface AnatomyLocomotion {
  readonly mode: LocomotionMode;
  readonly supportingLimbs: number;
}

export interface AnatomyComplexity {
  readonly segmentCount: number;
  readonly appendageCount: number;
  readonly jointCount: number;
  readonly internalJointCount: number;
  readonly score: number;
  readonly level: 0 | 1 | 2 | 3;
}

/** Variazione puramente estetica, separata da ogni caratteristica biologica. */
export interface AnatomyAesthetic {
  readonly seed: number | null;
  readonly jitter: number;
}

export interface AnatomyDescriptor {
  readonly schemaVersion: typeof ANATOMY_SCHEMA_VERSION;
  /** Hash deterministico (FNV-1a) del contenuto canonico, esclusa questa chiave. */
  readonly fingerprint: string;
  readonly lod: DetailTier;
  readonly bodyPlan: { readonly id: string; readonly family: BodyPlanFamily; readonly origin: BodyPlanOrigin };
  readonly symmetry: { readonly type: SymmetryType; readonly order: number };
  readonly segments: readonly Segment[];
  readonly appendages: readonly Appendage[];
  readonly joints: readonly Joint[];
  readonly proportions: AnatomyProportions;
  readonly surface: AnatomySurface;
  readonly locomotion: AnatomyLocomotion;
  readonly complexity: AnatomyComplexity;
  readonly aesthetic: AnatomyAesthetic;
  /** Provenienza per caratteristica (chiavi in REQUIRED_PROVENANCE_KEYS). */
  readonly provenance: Readonly<Record<string, DataSource>>;
  readonly phenotypeIssues: readonly string[];
}

export const REQUIRED_PROVENANCE_KEYS: readonly string[] = Object.freeze([
  "bodyPlan", "symmetry", "segmentation", "appendages", "armorPlates",
  "proportions.sizeScale", "proportions.robustness", "proportions.extents",
  "surface.covering", "surface.furCoverage", "surface.armorCoverage",
  "locomotion", "complexity", "aesthetic",
]);
