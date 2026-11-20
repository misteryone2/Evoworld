/**
 * APPROXIMATION / ISOLATED PROTOTYPE
 *
 * Float64 per-cell water stores for the spatial-hydrology Phase-A prototype.
 * This module is additive: it does not alter PlanetEngine state, the public
 * HydrologyField contract or persistence. All volumes are m³ and all cells use
 * the authoritative latitude-weighted areas from ElevationGrid.
 */

import type { ElevationGrid } from "../../contracts";
import { PlanetInvariantError } from "../../core/invariants";

export type SpatialIterationOrder = "forward" | "reverse";

export interface SpatialWaterOptions {
  /** Soil column depth [m]. */
  soilDepthM: number;
  /** Effective soil porosity [0..1]. */
  porosity: number;
  /** Saturated hydraulic conductivity [m/s]; 0 disables infiltration. */
  hydraulicConductivityMPerS: number;
  /** Kinematic routing conductance [m/s]. */
  routeConductanceMPerS: number;
  /** Target substep [s]; a daily step uses ceil(deltaS / targetSubstepS) substeps. */
  targetSubstepS: number;
  /** Maximum fraction of a cell's surface store that may leave in one substep. */
  maxDonorFraction: number;
  /** Planet radius used only for neighbour-distance geometry [m]. */
  planetRadiusM: number;
  /** Diagnostic-only traversal order; simultaneous fluxes must be order-invariant. */
  iterationOrder: SpatialIterationOrder;
}

export const DEFAULT_SPATIAL_WATER_OPTIONS: Readonly<SpatialWaterOptions> = Object.freeze({
  soilDepthM: 1,
  porosity: 0.35,
  hydraulicConductivityMPerS: 1e-5,
  routeConductanceMPerS: 0.5,
  targetSubstepS: 3600,
  maxDonorFraction: 0.25,
  planetRadiusM: 6.371e6,
  iterationOrder: "forward",
});

export interface SerializedSpatialWaterState {
  width: number;
  height: number;
  options: SpatialWaterOptions;
  cellAreasM2: number[];
  groundElevationM: number[];
  oceanMask: number[];
  soilM3: number[];
  channelM3: number[];
  lakeM3: number[];
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new PlanetInvariantError(`${label} must be finite`);
}

function requireNonNegative(value: number, label: string): void {
  requireFinite(value, label);
  if (value < 0) throw new PlanetInvariantError(`${label} must be non-negative`);
}

function validateOptions(options: SpatialWaterOptions): void {
  requireNonNegative(options.soilDepthM, "soilDepthM");
  requireFinite(options.porosity, "porosity");
  if (options.porosity < 0 || options.porosity > 1) {
    throw new PlanetInvariantError("porosity must be in [0, 1]");
  }
  requireNonNegative(options.hydraulicConductivityMPerS, "hydraulicConductivityMPerS");
  requireNonNegative(options.routeConductanceMPerS, "routeConductanceMPerS");
  requireFinite(options.targetSubstepS, "targetSubstepS");
  if (options.targetSubstepS <= 0) throw new PlanetInvariantError("targetSubstepS must be positive");
  requireFinite(options.maxDonorFraction, "maxDonorFraction");
  if (options.maxDonorFraction <= 0 || options.maxDonorFraction > 0.5) {
    throw new PlanetInvariantError("maxDonorFraction must be in (0, 0.5]");
  }
  requireFinite(options.planetRadiusM, "planetRadiusM");
  if (options.planetRadiusM <= 0) throw new PlanetInvariantError("planetRadiusM must be positive");
  if (options.iterationOrder !== "forward" && options.iterationOrder !== "reverse") {
    throw new PlanetInvariantError("iterationOrder must be forward or reverse");
  }
}

export class SpatialWaterState {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly options: Readonly<SpatialWaterOptions>;
  readonly cellAreasM2: Float64Array;
  readonly groundElevationM: Float64Array;
  readonly oceanMask: Uint8Array;
  readonly soilM3: Float64Array;
  readonly channelM3: Float64Array;
  readonly lakeM3: Float64Array;

  constructor(grid: ElevationGrid, options: SpatialWaterOptions = { ...DEFAULT_SPATIAL_WATER_OPTIONS }, oceanMask?: Uint8Array) {
    validateOptions(options);
    if (grid.elevationM.length !== grid.width * grid.height) {
      throw new PlanetInvariantError("spatial grid dimensions are inconsistent");
    }
    if (grid.cellAreasM2.length !== grid.elevationM.length) {
      throw new PlanetInvariantError("spatial cell areas must match elevation size");
    }
    if (oceanMask && oceanMask.length !== grid.elevationM.length) {
      throw new PlanetInvariantError("spatial ocean mask must match elevation size");
    }

    this.width = grid.width;
    this.height = grid.height;
    this.size = grid.elevationM.length;
    this.options = Object.freeze({ ...options });
    // The transport grid is authoritative when present; public Float32
    // elevations may hide sub-metre transport residuals.
    const ground = grid.transportElevationM ?? Float64Array.from(grid.elevationM);
    this.groundElevationM = Float64Array.from(ground);
    this.cellAreasM2 = Float64Array.from(grid.cellAreasM2);
    this.oceanMask = oceanMask ? Uint8Array.from(oceanMask) : new Uint8Array(this.size);
    this.soilM3 = new Float64Array(this.size);
    this.channelM3 = new Float64Array(this.size);
    this.lakeM3 = new Float64Array(this.size);
    this.assertHealthy();
  }

  /** Deterministic cell visitor used by every prototype phase. */
  forEachCell(fn: (index: number) => void): void {
    if (this.options.iterationOrder === "forward") {
      for (let i = 0; i < this.size; i += 1) fn(i);
    } else {
      for (let i = this.size - 1; i >= 0; i -= 1) fn(i);
    }
  }

  wrappedX(x: number): number {
    return ((x % this.width) + this.width) % this.width;
  }

  wrappedY(y: number): number {
    return ((y % this.height) + this.height) % this.height;
  }

  neighbourIndex(index: number, dx: number, dy: number): number {
    const x = this.wrappedX(index % this.width + dx);
    const y = this.wrappedY(Math.floor(index / this.width) + dy);
    return y * this.width + x;
  }

  soilCapacityM3(index: number): number {
    return this.cellAreasM2[index] * this.options.soilDepthM * this.options.porosity;
  }

  surfaceWaterM3(index: number): number {
    return this.channelM3[index] + this.lakeM3[index];
  }

  /** Ground plus stored water head, in metres, used by steepest descent. */
  headM(index: number): number {
    return this.groundElevationM[index] + this.surfaceWaterM3(index) / this.cellAreasM2[index];
  }

  totalSurfaceWaterM3(): number {
    let total = 0;
    for (let i = 0; i < this.size; i += 1) total += this.surfaceWaterM3(i);
    return total;
  }

  totalSoilWaterM3(): number {
    let total = 0;
    for (let i = 0; i < this.size; i += 1) total += this.soilM3[i];
    return total;
  }

  /** Frozen defensive snapshot; typed-array contents are copied. */
  view(): Readonly<{
    soilM3: Float64Array;
    channelM3: Float64Array;
    lakeM3: Float64Array;
  }> {
    return Object.freeze({
      soilM3: new Float64Array(this.soilM3),
      channelM3: new Float64Array(this.channelM3),
      lakeM3: new Float64Array(this.lakeM3),
    });
  }

  toJSON(): SerializedSpatialWaterState {
    return {
      width: this.width,
      height: this.height,
      options: { ...this.options },
      cellAreasM2: Array.from(this.cellAreasM2),
      groundElevationM: Array.from(this.groundElevationM),
      oceanMask: Array.from(this.oceanMask),
      soilM3: Array.from(this.soilM3),
      channelM3: Array.from(this.channelM3),
      lakeM3: Array.from(this.lakeM3),
    };
  }

  static fromJSON(data: SerializedSpatialWaterState): SpatialWaterState {
    const grid: ElevationGrid = {
      width: data.width,
      height: data.height,
      elevationM: Float32Array.from(data.groundElevationM),
      minM: Math.min(...data.groundElevationM),
      maxM: Math.max(...data.groundElevationM),
      cellAreasM2: Float64Array.from(data.cellAreasM2),
      cellAreaM2: data.cellAreasM2.reduce((a, b) => a + b, 0) / Math.max(1, data.cellAreasM2.length),
      transportElevationM: Float64Array.from(data.groundElevationM),
    };
    const state = new SpatialWaterState(grid, data.options, Uint8Array.from(data.oceanMask));
    state.soilM3.set(data.soilM3);
    state.channelM3.set(data.channelM3);
    state.lakeM3.set(data.lakeM3);
    state.assertHealthy();
    return state;
  }

  assertHealthy(): void {
    for (let i = 0; i < this.size; i += 1) {
      requireNonNegative(this.soilM3[i], `soilM3[${i}]`);
      requireNonNegative(this.channelM3[i], `channelM3[${i}]`);
      requireNonNegative(this.lakeM3[i], `lakeM3[${i}]`);
      requireFinite(this.headM(i), `headM[${i}]`);
    }
  }
}
