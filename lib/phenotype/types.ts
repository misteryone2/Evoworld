/**
 * G2 — Contratti del livello fenotipico. Puro: nessun import da React, Three.js o dal renderer.
 *
 * Distinzione rigorosa (brief G2 §6):
 *  - "gene-direct":  caratteristica letta direttamente da un gene (es. furDensity → copertura di pelo);
 *  - "gene-derived": caratteristica derivata da uno o più geni con una regola documentata;
 *  - "undetermined": non determinabile con i dati attuali (scelta dal body plan, dal seme o dal default);
 *  - "aesthetic":    variazione puramente estetica, mai biologica.
 */
export const PHENOTYPE_SCHEMA_VERSION = 1 as const;

export type ProvenanceKind = "gene-direct" | "gene-derived" | "undetermined" | "aesthetic";
export type Certainty = "exact" | "derived" | "speculative";

export interface DataSource {
  readonly kind: ProvenanceKind;
  /** Id dei geni (geneRegistry) da cui il dato proviene. Vuoto per "undetermined" e "aesthetic". */
  readonly genes: readonly string[];
  readonly certainty: Certainty;
  readonly note?: string;
}

export type TraitStatus = "present" | "missing" | "invalid" | "clamped";

export interface PhenotypeTrait {
  readonly key: string;
  readonly geneId: string;
  /** Valore grezzo letto dal genoma (null se assente o non valido). */
  readonly raw: number | null;
  /** Valore normalizzato 0..1 sull'intervallo del gene (null se assente o non valido). */
  readonly value: number | null;
  readonly status: TraitStatus;
  readonly source: DataSource;
}

export type SurfaceCovering = "unspecified" | "bare" | "fur" | "dermal-plates" | "mixed";

export interface DerivedNumber {
  /** Valore neutro quando i geni necessari mancano (il source lo dichiara "undetermined"). */
  readonly value: number;
  readonly source: DataSource;
}

export interface PhenotypeProfile {
  readonly schemaVersion: typeof PHENOTYPE_SCHEMA_VERSION;
  readonly traits: {
    readonly size: PhenotypeTrait;
    readonly bodyStature: PhenotypeTrait;
    readonly furDensity: PhenotypeTrait;
    readonly dermalArmor: PhenotypeTrait;
  };
  readonly derived: {
    /** Scala di rappresentazione dalla taglia (gene-derived da `size`). */
    readonly sizeScale: DerivedNumber;
    /** Fattore di spessore dalla corporatura: stessa regola del motore (bodyRadiusFactor). */
    readonly radiusFactor: DerivedNumber;
    readonly surfaceCovering: { readonly value: SurfaceCovering; readonly source: DataSource };
  };
  /** Problemi di lettura: "missing:<chiave>", "invalid:<chiave>", "clamped:<chiave>". */
  readonly issues: readonly string[];
  /** Caratteristiche anatomiche che i geni attuali NON permettono di determinare. */
  readonly undetermined: readonly string[];
}
