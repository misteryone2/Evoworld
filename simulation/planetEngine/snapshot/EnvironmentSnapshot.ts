/**
 * CONTRACT / SNAPSHOT
 *
 * Immutable per-tick view of the physical environment. Biome memory is kept
 * per cell so results do not depend on the order in which cells are sampled.
 */

import type {
  ClimateField,
  EnvironmentSample,
  EnvironmentSnapshot,
  HydrologyField,
  PlanetPhysicalConfig,
  PlanetState,
  SurfaceField,
} from "../contracts";
import { orbitAt } from "../core/Orbit";
import { surfacePressureFromState } from "../core/EnergyBudget";
import { biomeScores } from "../biomes/classifier";
import { updateBiome, type BiomeMemory } from "../biomes/stability";
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
}

export interface EnvironmentSnapshotOptions {
  engineVersion: string;
  deltaS: number;
}

function wrapped(value: number, size: number): number {
  return ((value % size) + size) % size;
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
  private readonly memories = new Map<number, BiomeMemory>();
  private readonly samples = new Map<number, EnvironmentSample>();

  constructor(
    provider: EnvironmentProvider,
    options: EnvironmentSnapshotOptions,
  ) {
    this.config = provider.getConfig();
    const state = provider.getState();
    this.state = state;
    this.engineVersion = options.engineVersion;
    this.tick = state.tick;
    this.timeS = state.timeS;
    this.surface = provider.getSurfaceField();
    this.climate = provider.getClimateField();
    this.hydrology = provider.getHydrologyField(options.deltaS);
    this.gridWidth = this.surface.width;
    this.gridHeight = this.surface.height;
    this.season = this.climate.season;
    this.declinationRad = orbitAt(this.config, this.timeS).declinationRad;
  }

  sample(x: number, y: number): EnvironmentSample {
    const gridX = wrapped(Math.trunc(x), this.gridWidth);
    const gridY = wrapped(Math.trunc(y), this.gridHeight);
    const index = gridY * this.gridWidth + gridX;
    const cached = this.samples.get(index);
    if (cached) return cached;

    const latitudeRad = this.climate.latitudeRad[index];
    const longitudeRad = this.climate.longitudeRad[index];
    const elevationM = this.surface.elevationM[index];
    const seaLevelM = this.surface.seaLevelM;
    const humidity = this.climate.humidity[index];
    const memory = this.memories.get(index);
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
    this.memories.set(index, { biome: decision.biome, tick: this.tick, stability: decision.stability });

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
      biome: decision.biome,
      climateStability: decision.stability,
      season: this.season,
      seasonalOffsetK: seasonalShapeK(
        latitudeRad,
        this.declinationRad,
        this.config.axialTiltRad,
      ),
    };

    this.samples.set(index, sampled);
    return sampled;
  }

  toLegacyCell(x: number, y: number): ReturnType<typeof environmentSampleToLegacyCell> {
    return environmentSampleToLegacyCell(this.sample(x, y), this.config);
  }
}

export function createEnvironmentSnapshot(
  provider: EnvironmentProvider,
  options: EnvironmentSnapshotOptions,
): EnvironmentSnapshot {
  return new PlanetEnvironmentSnapshot(provider, options);
}
