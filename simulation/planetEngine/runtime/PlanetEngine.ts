/**
 * CONTRACT / RUNTIME
 *
 * Deterministic orchestration facade. The engine depends only on time and its
 * immutable configuration; it never reads Date.now, Math.random, DOM globals,
 * Three.js, World or any biology/GENOME module.
 */

import type {
  ClimateField,
  ElevationGrid,
  EnvironmentSnapshot,
  GasKey,
  HydrologyField,
  OrbitPosition,
  PlanetEngineSnapshot,
  PlanetPhysicalConfig,
  PlanetState,
  SurfaceField,
} from "../contracts";
import {
  cloneState,
  createEarthLikeConfig,
  createInitialState,
  PLANET_ENGINE_VERSION,
  rotationPhaseAt,
  rotationRateRadPerS,
} from "../core/PlanetCore";
import { orbitAt } from "../core/Orbit";
import { stellarFluxWm2 } from "../core/Stellar";
import { computeEnergyBudget, estimateBondAlbedo, surfacePressureFromState } from "../core/EnergyBudget";
import { PlanetInvariantError, validateConfig, validateState } from "../core/invariants";
import { gravityMS2 } from "../core/PlanetCore";
import { stepInterior } from "../geology/Interior";
import { tectonicElevationDeltaM } from "../geology/Tectonics";
import { volcanicEventAt } from "../geology/Volcanism";
import { applyElevationDeltaM, erodeAndDeposit } from "../geology/SurfaceEvolution";
import { buildElevationGrid, solveSeaLevelM } from "../surface/Hypsometry";
import { buildSurfaceField } from "../surface/Continents";
import { buildCoastlineMask } from "../surface/Coastlines";
import { dailyMeanIrradianceWm2, latitudeAtY, longitudeAtX } from "../climate/Insolation";
import { localTemperatureK } from "../climate/TemperatureField";
import { relativeHumidityFromPressure } from "../climate/Humidity";
import { zonalWindMS } from "../atmosphere/Circulation";
import { seasonAt } from "../climate/ClimateZones";
import { applyWaterFluxes, totalWaterInventoryKg } from "../hydrology/Inventory";
import { updateSeaLevelFromInventory } from "../hydrology/SeaLevel";
import { computeWaterCycle } from "../hydrology/WaterCycle";
import { createEnvironmentSnapshot } from "../snapshot/EnvironmentSnapshot";
import { PLANET_UNITS } from "../units";

const GAS_KEYS: readonly GasKey[] = ["N2", "O2", "CO2", "H2O", "CH4", "Ar", "other"];

function cloneConfig(config: PlanetPhysicalConfig): PlanetPhysicalConfig {
  return createEarthLikeConfig({
    ...config,
    orbit: { ...config.orbit },
    star: { ...config.star },
    interior: { ...config.interior },
    atmosphere: { ...config.atmosphere, composition: { ...config.atmosphere.composition } },
    hydrosphere: { ...config.hydrosphere },
    surface: { ...config.surface },
  });
}

function cloneOrbit(orbit: OrbitPosition): OrbitPosition {
  return { ...orbit };
}

function cloneSnapshot(snapshot: PlanetEngineSnapshot): PlanetEngineSnapshot {
  return { ...snapshot, orbit: cloneOrbit(snapshot.orbit) };
}

function cloneSurfaceField(field: SurfaceField): SurfaceField {
  return {
    ...field,
    elevationM: new Float32Array(field.elevationM),
    oceanMask: new Uint8Array(field.oceanMask),
    coastlineMask: new Uint8Array(field.coastlineMask),
  };
}

export class PlanetEngine {
  readonly engineVersion = PLANET_ENGINE_VERSION;

  private readonly config: PlanetPhysicalConfig;
  private state: PlanetState;
  private currentSnapshot: PlanetEngineSnapshot;
  private elevationGrid?: ElevationGrid;
  private cachedElevationRevision = -1;
  private elevationRevision = 0;
  private surfaceCache?: { key: string; field: SurfaceField };

  constructor(config: PlanetPhysicalConfig) {
    validateConfig(config);
    this.config = cloneConfig(config);
    this.state = createInitialState(this.config);
    this.state.climate.albedo = estimateBondAlbedo(this.config);
    validateState(this.config, this.state);
    this.currentSnapshot = this.refreshDerived();
  }

  getConfig(): PlanetPhysicalConfig {
    return cloneConfig(this.config);
  }

  getState(): PlanetState {
    return cloneState(this.state);
  }

  /** Advance by a caller-supplied SI duration. One call is one simulation tick. */
  step(deltaS: number): PlanetEngineSnapshot {
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new PlanetInvariantError("step deltaS must be a finite non-negative number");
    }
    return this.seek(this.state.tick + 1, this.state.timeS + deltaS);
  }

  /** Seek to an absolute tick/time. Deterministic because no history is stored. */
  seek(tick: number, timeS: number): PlanetEngineSnapshot {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new PlanetInvariantError("seek tick must be a non-negative integer");
    }
    if (!Number.isFinite(timeS) || timeS < 0) {
      throw new PlanetInvariantError("seek timeS must be a finite non-negative number");
    }
    this.state.tick = tick;
    this.state.timeS = timeS;
    return this.refreshDerivedAndSnapshot();
  }

  snapshot(): PlanetEngineSnapshot {
    return cloneSnapshot(this.currentSnapshot);
  }

  /** Deterministic elevation grid; rebuilt only when geology mutates it. */
  getElevationGrid(): ElevationGrid {
    if (!this.elevationGrid || this.cachedElevationRevision !== this.elevationRevision) {
      this.elevationGrid = buildElevationGrid(this.config);
      this.cachedElevationRevision = this.elevationRevision;
    }
    return {
      ...this.elevationGrid,
      elevationM: new Float32Array(this.elevationGrid.elevationM),
    };
  }

  /** Surface derived from elevation + ocean mass inventory + solved sea level. */
  getSurfaceField(): SurfaceField {
    const key = `${this.state.hydrosphere.oceanMassKg.toFixed(6)}:${this.elevationRevision}`;
    if (this.surfaceCache?.key === key) return cloneSurfaceField(this.surfaceCache.field);

    const grid = this.getElevationGrid();
    const waterVolumeM3 = this.state.hydrosphere.oceanMassKg / PLANET_UNITS.waterDensityKgM3;
    const seaLevelM = solveSeaLevelM(grid, waterVolumeM3);
    const field = buildSurfaceField(grid, seaLevelM);
    field.coastlineMask = buildCoastlineMask(field);

    this.surfaceCache = { key, field };
    return cloneSurfaceField(field);
  }

  /**
   * Explicit geology step. It is separate from `step()` so orbital/climate
   * determinism tests remain valid while surface evolution is opt-in.
   */
  stepGeology(deltaS: number): SurfaceField {
    if (!Number.isFinite(deltaS) || deltaS <= 0) {
      throw new PlanetInvariantError("stepGeology deltaS must be a finite positive number");
    }

    const interior = stepInterior(this.config, this.state, deltaS);
    this.state.interior.heatJ = interior.heatJ;
    this.state.interior.tectonicStress = interior.tectonicStress;
    this.state.interior.volcanicActivity = interior.volcanicActivity;

    const grid = this.getElevationGrid();
    const deltaM = new Float32Array(grid.elevationM.length);
    let volcanicCo2Kg = 0;

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const index = y * grid.width + x;
        const event = volcanicEventAt(this.config, this.state, x, y, this.state.timeS, deltaS);
        deltaM[index] = tectonicElevationDeltaM(this.config, this.state, x, y, deltaS) + event.elevationDeltaM;
        volcanicCo2Kg += event.co2Kg;
      }
    }

    this.injectAtmosphericMassKg(volcanicCo2Kg, "CO2");
    const uplifted = applyElevationDeltaM(grid, deltaM);
    const eroded = erodeAndDeposit(this.config, uplifted, deltaS);
    this.setElevationGrid(eroded.elevationM);
    validateState(this.config, this.state);
    return this.getSurfaceField();
  }

  /** Local climate driven by orbit, obliquity, elevation and gas inventory. */
  getClimateField(): ClimateField {
    const surface = this.getSurfaceField();
    const orbit = orbitAt(this.config, this.state.timeS);
    const fluxWm2 = stellarFluxWm2(this.config.star.luminosityW, orbit.distanceM);
    const pressurePa = surfacePressureFromState(this.config, this.state);
    const vaporPressurePa = this.state.atmosphere.composition.H2O * pressurePa;
    const omega = rotationRateRadPerS(this.config);
    const season = seasonAt(this.config, this.state.timeS);
    const size = surface.width * surface.height;

    const latitudeRad = new Float32Array(size);
    const longitudeRad = new Float32Array(size);
    const temperatureK = new Float32Array(size);
    const irradianceWm2 = new Float32Array(size);
    const humidity = new Float32Array(size);
    const windMS = new Float32Array(size);

    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) {
        const index = y * surface.width + x;
        const lat = latitudeAtY(y, surface.height);
        const lon = longitudeAtX(x, surface.width, this.state.rotationPhaseRad);
        const irradiance = dailyMeanIrradianceWm2(fluxWm2, lat, orbit.declinationRad);
        const heightAboveSeaM = Math.max(0, surface.elevationM[index] - surface.seaLevelM);
        const oceanProximity = surface.oceanMask[index] === 1
          ? 1
          : 1 - Math.min(1, heightAboveSeaM / Math.max(this.config.surface.roughnessM, 1));
        const rh = relativeHumidityFromPressure(
          this.state.climate.globalMeanTemperatureK,
          vaporPressurePa * (surface.oceanMask[index] === 1 ? 1 : 0.6 + 0.4 * oceanProximity),
          oceanProximity,
        );
        const temperature = localTemperatureK({
          globalMeanTemperatureK: this.state.climate.globalMeanTemperatureK,
          latitudeRad: lat,
          elevationM: surface.elevationM[index],
          seaLevelM: surface.seaLevelM,
          declinationRad: orbit.declinationRad,
          obliquityRad: this.state.obliquityRad,
          humidity: rh,
          gravityMS2: this.currentSnapshot.gravityMS2,
        });

        latitudeRad[index] = lat;
        longitudeRad[index] = lon;
        irradianceWm2[index] = irradiance;
        humidity[index] = rh;
        windMS[index] = zonalWindMS(lat, omega, 1e-5);
        temperatureK[index] = temperature;
      }
    }

    return {
      width: surface.width,
      height: surface.height,
      latitudeRad,
      longitudeRad,
      temperatureK,
      irradianceWm2,
      humidity,
      windMS,
      season,
    };
  }

  getHydrologyField(deltaS: number): HydrologyField {
    const result = computeWaterCycle({
      config: this.config,
      state: this.state,
      surface: this.getSurfaceField(),
      climate: this.getClimateField(),
      deltaS,
    });
    return result.field;
  }

  /** Close the water cycle for one timestep and recompute sea level. */
  stepClimateHydrology(deltaS: number): HydrologyField {
    if (!Number.isFinite(deltaS) || deltaS <= 0) {
      throw new PlanetInvariantError("stepClimateHydrology deltaS must be a finite positive number");
    }
    const result = computeWaterCycle({
      config: this.config,
      state: this.state,
      surface: this.getSurfaceField(),
      climate: this.getClimateField(),
      deltaS,
    });
    applyWaterFluxes(this.state, result.fluxesKg);
    updateSeaLevelFromInventory(this.getElevationGrid(), this.state);
    validateState(this.config, this.state);
    return result.field;
  }

  /** Stable headless bridge for ecology/GENOME consumers. */
  createEnvironmentSnapshot(deltaS = PLANET_UNITS.secondsPerEarthDay): EnvironmentSnapshot {
    return createEnvironmentSnapshot(this, {
      engineVersion: this.engineVersion,
      deltaS,
    });
  }

  totalWaterKg(): number {
    return totalWaterInventoryKg(this.state);
  }

  private injectAtmosphericMassKg(massKg: number, gas: GasKey): void {
    if (!(massKg > 0)) return;
    const oldMass = this.state.atmosphere.totalMassKg;
    const newMass = oldMass + massKg;
    for (const key of GAS_KEYS) this.state.atmosphere.composition[key] *= oldMass / newMass;
    this.state.atmosphere.composition[gas] += massKg / newMass;
    this.state.atmosphere.totalMassKg = newMass;
  }

  private setElevationGrid(elevationM: Float32Array): void {
    let minM = Infinity;
    let maxM = -Infinity;
    for (let i = 0; i < elevationM.length; i += 1) {
      if (elevationM[i] < minM) minM = elevationM[i];
      if (elevationM[i] > maxM) maxM = elevationM[i];
    }
    this.elevationGrid = {
      width: this.config.surface.gridWidth,
      height: this.config.surface.gridHeight,
      elevationM: new Float32Array(elevationM),
      minM,
      maxM,
      cellAreaM2: (4 * Math.PI * this.config.radiusM ** 2) / elevationM.length,
    };
    this.elevationRevision += 1;
    this.surfaceCache = undefined;
  }

  private refreshDerived(): PlanetEngineSnapshot {
    const orbit = orbitAt(this.config, this.state.timeS);
    const budget = computeEnergyBudget(this.config, orbit, this.state);

    this.state.orbitalMeanAnomalyRad = orbit.meanAnomalyRad;
    this.state.rotationPhaseRad = rotationPhaseAt(this.config, this.state.timeS);
    this.state.atmosphere.opticalDepth = budget.opticalDepth;
    this.state.climate.albedo = budget.albedo;
    this.state.climate.globalMeanTemperatureK = budget.surfaceTemperatureK;
    this.state.climate.co2Ppm = this.state.atmosphere.composition.CO2 * 1e6;

    return {
      schemaVersion: 2,
      engineVersion: this.engineVersion,
      tick: this.state.tick,
      timeS: this.state.timeS,
      rotationPhaseRad: this.state.rotationPhaseRad,
      orbit: cloneOrbit(orbit),
      fluxWm2: budget.fluxWm2,
      meanInsolationWm2: budget.meanInsolationWm2,
      equilibriumTemperatureK: budget.equilibriumTemperatureK,
      greenhouseDeltaK: budget.greenhouseDeltaK,
      surfaceTemperatureK: budget.surfaceTemperatureK,
      surfacePressurePa: budget.surfacePressurePa,
      gravityMS2: gravityMS2(this.config),
    };
  }

  private refreshDerivedAndSnapshot(): PlanetEngineSnapshot {
    const snapshot = this.refreshDerived();
    validateState(this.config, this.state);
    this.currentSnapshot = snapshot;
    return cloneSnapshot(snapshot);
  }
}
