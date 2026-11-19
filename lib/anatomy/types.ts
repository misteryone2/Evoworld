import type { DataSource, SurfaceCovering } from "../phenotype/types";

/**
 * G2 — AnatomyDescriptor: contratto anatomico centrale. Deterministico, serializzabile, indipendente dal rendering.
 * Sistema di coordinate (come l'anatomia legacy): +Z avanti, +Y su, +X lato sinistro; creatura di taglia unitaria,
 * il renderer applica `proportions.sizeScale`. Nessun import da React, Three.js o dal renderer.
 */
export const ANATOMY_SCHEMA_VERSION = 1 as const;
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

/** Stato di un controllo anatomico: solo INVALID rende il descriptor inaccettabile. */
export type AnatomyStatus = "VALID" | "WARNING" | "INVALID";
export type GroundClearanceStatus = "determined" | "undetermined";

/** Anomalia diagnostica: codice stabile, motivazione e (quando noto) elemento coinvolto. */
export interface AnatomyDiagnostic {
  readonly code: string;
  readonly status: Exclude<AnatomyStatus, "VALID">;
  readonly message: string;
  readonly target?: string;
}

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

/**
 * AABB della geometria G2. `size`/`min`/`max`/`center` sono in spazio unitario; `scaledSize`
 * applica `proportions.sizeScale` (il renderer resta libero di applicare la scala come preferisce).
 */
export interface AnatomyExtents {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly center: Vec3;
  readonly size: Vec3;
  readonly scaledSize: Vec3;
}

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

export interface AnatomyProportions {
  readonly sizeScale: number;
  /** 0..1, 0,5 neutro. */
  readonly robustness: number;
  /** AABB dei soli segmenti (corpo). */
  readonly bodyExtents: AnatomyExtents;
  /** AABB di segmenti + appendici (organismo completo). */
  readonly anatomicalExtents: AnatomyExtents;
  /** Legacy: bodyExtents.size.z */
  readonly bodyLength: number;
  /** Legacy: bodyExtents.size.x */
  readonly bodyWidth: number;
  /** Legacy: bodyExtents.size.y */
  readonly bodyHeight: number;
  /** Altezza totale della geometria generata (appendici incluse). */
  readonly totalHeight: number;
  /**
   * Distanza corpo↔terreno dedotta da un piano d'appoggio di zampe coplanari.
   * `null` = non determinabile dalla sola anatomia: nessun valore viene inventato.
   */
  readonly groundClearance: number | null;
  readonly groundClearanceStatus: GroundClearanceStatus;
  readonly groundClearanceReason: string;
  /** Lunghezza massima di una zampa: misura distinta, mai sinonimo di ground clearance. */
  readonly maxLimbLength: number;
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
  /** Copia di `proportions.groundClearance`; `null` se non determinabile. */
  readonly groundClearance: number | null;
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
  /** Anomalie strutturali dichiarate dal generatore (es. appendici dispari): non vengono nascoste. */
  readonly declaredAnomalies: readonly AnatomyDiagnostic[];
}

export const REQUIRED_PROVENANCE_KEYS: readonly string[] = Object.freeze([
  "bodyPlan", "symmetry", "segmentation", "appendages", "armorPlates",
  "proportions.sizeScale", "proportions.robustness", "proportions.extents",
  "surface.covering", "surface.furCoverage", "surface.armorCoverage",
  "locomotion", "complexity", "aesthetic",
]);
