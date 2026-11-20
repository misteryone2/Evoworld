/**
 * APPROXIMATION / CONTRACT / SNAPSHOT
 *
 * Immutable per-tick view of the physical environment. Biome memory is
 * engine-owned and shared between snapshots; returned samples and legacy cells
 * are frozen defensive copies. Coordinates are validated explicitly.
 */

import type {
  ClimateField,
  HydrologyField,
  PlanetPhysicalConfig,
  PlanetState,
  ReadonlyEnvironmentSample,
  ReadonlyLegacyCell,
  SurfaceField,
} from "../contracts";
import type { EnvironmentSample, EnvironmentSnapshot } from "../contracts";
import { orbitAt } from "../core/Orbit";
import { surfacePressureFromState } from "../core/EnergyBudget";
import { PlanetInvariantError } from "../core/invariants";
import { biomeScores } from "../biomes/classifier";
import { BiomeMemoryStore, updateBiome } from "../biomes/stability";
import { seasonalShapeK } from "../climate/TemperatureField";
import { slopeAt } from "../hydrology/Drainage";
import { legacyWaterAxis } from "../units";
import { environmentSampleToLegacyCell } from "./legacyAdapter";
import { ENVIRONMENT_SNAPSHOT_VERSION } from "./schema";

/** Structural provider so this module never needs to import the runtime. */
export interface EnvironmentProvider {
  getConfig(): PlanetPhysicalConfig;
  getState(): PlanetState;
  getSurfaceField(): SurfaceField;
  getClimateField(): ClimateField;
  getHydrologyField(deltaS: number): HydrologyField;
  getBiomeMemory(): BiomeMemoryStore;
}

export interface EnvironmentSnapshotOptions {
  engineVersion: string;
  deltaS: number;
}

function wrapped(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** Explicit contract: finite integers wrap on the torus; anything else fails. */
export function requireFiniteGridCoordinate(value: unknown, size: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new PlanetInvariantError(`${label} must be a finite integer`);
  }
  return wrapped(value, size);
}

function cloneClimateField(field: ClimateField): ClimateField {
  return {
    ...field,
    latitudeRad: new Float32Array(field.latitudeRad),
    longitudeRad: new Float32Array(field.longitudeRad),
    temperatureK: new Float32Array(field.temperatureK),
    irradianceWm2: new Float32Array(field.irradianceWm2),
    humidity: new Float32Array(field.humidity),
    windMS: new Float32Array(field.windMS),
  };
}

function cloneHydrologyField(field: HydrologyField): HydrologyField {
  return {
    ...field,
    soilMoisture: new Float32Array(field.soilMoisture),
    waterAvailability: new Float32Array(field.waterAvailability),
    precipitationMPerYear: new Float32Array(field.precipitationMPerYear),
    evaporationMPerYear: new Float32Array(field.evaporationMPerYear),
    runoffMPerYear: new Float32Array(field.runoffMPerYear),
    riverFlow: new Float32Array(field.riverFlow),
  };
}

function cloneSurfaceField(field: SurfaceField): SurfaceField {
  return {
    ...field,
    elevationM: new Float32Array(field.elevationM),
    cellAreasM2: new Float64Array(field.cellAreasM2),
    oceanMask: new Uint8Array(field.oceanMask),
    coastlineMask: new Uint8Array(field.coastlineMask),
  };
}

export class PlanetEnvironmentSnapshot implements EnvironmentSnapshot {
  readonly version = ENVIRONMENT_SNAPSHOT_VERSION;
  readonly engineVersion: string;
  readonly tick: number;
  readonly timeS: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly season: EnvironmentSnapshot["season"];

  private readonly config: PlanetPhysicalConfig;
  private readonly state: PlanetState;
  private readonly surface: SurfaceField;
  private readonly climate: ClimateField;
  private readonly hydrology: HydrologyField;
  private readonly declinationRad: number;
  private readonly memory: BiomeMemoryStore;
  private readonly samples = new Map<number, EnvironmentSample>();

  constructor(provider: EnvironmentProvider, options: EnvironmentSnapshotOptions) {
    this.config = provider.getConfig();
    this.state = provider.getState();
    this.engineVersion = options.engineVersion;
    this.tick = this.state.tick;
    this.timeS = this.state.timeS;
    this.surface = cloneSurfaceField(provider.getSurfaceField());
    this.climate = cloneClimateField(provider.getClimateField());
    this.hydrology = cloneHydrologyField(provider.getHydrologyField(options.deltaS));
    this.memory = provider.getBiomeMemory();
    this.gridWidth = this.surface.width;
    this.gridHeight = this.surface.height;
    this.season = this.climate.season;
    this.declinationRad = orbitAt(this.config, this.timeS).declinationRad;
  }

  sample(x: number, y: number): ReadonlyEnvironmentSample {
    const gridX = requireFiniteGridCoordinate(x, this.gridWidth, "x");
    const gridY = requireFiniteGridCoordinate(y, this.gridHeight, "y");
    const index = gridY * this.gridWidth + gridX;
    const cached = this.samples.get(index);
    if (cached) return Object.freeze({ ...cached });

    const latitudeRad = this.climate.latitudeRad[index];
    const longitudeRad = this.climate.longitudeRad[index];
    const elevationM = this.surface.elevationM[index];
    const seaLevelM = this.surface.seaLevelM;
    const humidity = this.climate.humidity[index];
    const memory = this.memory.get(index);
    const scores = biomeScores({
      temperatureK: this.climate.temperatureK[index],
      precipitationMPerYear: this.hydrology.precipitationMPerYear[index],
      humidity,
      elevationM,
      seaLevelM,
      slope: slopeAt(this.surface, gridX, gridY),
      soilMoisture: this.hydrology.soilMoisture[index],
      climateStability: memory?.stability ?? 1,
      iceFraction: this.config.hydrosphere.iceFraction,
    });
    const decision = updateBiome(scores, this.tick, memory);
    const persisted = this.memory.commit(index, decision, this.tick);

    const waterAxis = legacyWaterAxis(humidity, elevationM, seaLevelM, this.config.surface.roughnessM);
    const sampled: EnvironmentSample = {
      x: gridX,
      y: gridY,
      latRad: latitudeRad,
      lonRad: longitudeRad,
      elevationM,
      seaLevelM,
      slope: slopeAt(this.surface, gridX, gridY),
      temperatureK: this.climate.temperatureK[index],
      pressurePa: surfacePressureFromState(this.config, this.state),
      humidity,
      precipitationMPerYear: this.hydrology.precipitationMPerYear[index],
      soilMoisture: this.hydrology.soilMoisture[index],
      waterAvailability: this.hydrology.waterAvailability[index],
      legacyWaterAxis: waterAxis,
      irradianceWm2: this.climate.irradianceWm2[index],
      windMS: this.climate.windMS[index],
      iceFraction: this.config.hydrosphere.iceFraction,
      riverFlow: this.hydrology.riverFlow[index],
      isLake: waterAxis > 0.85 && this.surface.oceanMask[index] === 0,
      biome: persisted.biome,
      climateStability: persisted.stability,
      season: this.season,
      seasonalOffsetK: seasonalShapeK(
        latitudeRad,
        this.declinationRad,
        this.config.axialTiltRad,
      ),
    };

    this.samples.set(index, Object.freeze(sampled));
    return Object.freeze({ ...sampled });
  }

  toLegacyCell(x: number, y: number): ReadonlyLegacyCell {
    return Object.freeze(environmentSampleToLegacyCell(this.sample(x, y), this.config));
  }

  /** Eagerly materialize samples in deterministic row-major scan order. */
  materialize(): void {
    for (let y = 0; y < this.gridHeight; y += 1) {
      for (let x = 0; x < this.gridWidth; x += 1) this.sample(x, y);
    }
  }
}

export function createEnvironmentSnapshot(
  provider: EnvironmentProvider,
  options: EnvironmentSnapshotOptions,
): EnvironmentSnapshot {
  return new PlanetEnvironmentSnapshot(provider, options);
}
