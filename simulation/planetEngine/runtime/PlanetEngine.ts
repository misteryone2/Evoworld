/**
 * PHYSICAL_MODEL / RUNTIME / CONTRACT
 *
 * Deterministic orchestration facade. One `step()` is one logical tick: read
 * initial state, compute flows, apply mass/energy transfers, evolve geology and
 * surface, recompute climate/hydrology diagnostics, advance time once, then
 * publish a coherent core snapshot and headless Environment Snapshot.
 *
 * The engine never reads Date.now, Math.random, DOM globals, Three.js, World or
 * any biology/GENOME module.
 */

import type {
  ClimateField,
  ElevationGrid,
  EnvironmentSnapshot,
  HydrologyField,
  OrbitPosition,
  PlanetEngineSnapshot,
  PlanetPhysicalConfig,
  PlanetSchedulerConfig,
  PlanetState,
  SurfaceField,
} from "../contracts";
import {
  cloneState,
  createEarthLikeConfig,
  createInitialState,
  PLANET_ENGINE_VERSION,
  resolveSchedulerConfig,
  rotationPhaseAt,
  rotationRateRadPerS,
  gravityMS2,
} from "../core/PlanetCore";
import { orbitAt } from "../core/Orbit";
import { computeEnergyBudget, estimateBondAlbedo, surfacePressureFromState } from "../core/EnergyBudget";
import { PlanetInvariantError, validateConfig, validateState } from "../core/invariants";
import { stepInterior } from "../geology/Interior";
import { tectonicElevationDeltaM } from "../geology/Tectonics";
import { volcanicEventAt } from "../geology/Volcanism";
import { applyElevationDeltaM, erodeAndDeposit } from "../geology/SurfaceEvolution";
import { buildElevationGrid, solveSeaLevelM } from "../surface/Hypsometry";
import { cellAreasForConfig, meanCellAreaM2 } from "../surface/GridGeometry";
import { buildSurfaceField } from "../surface/Continents";
import { buildCoastlineMask } from "../surface/Coastlines";
import { injectGasMassKg } from "../atmosphere/Composition";
import { dailyMeanIrradianceWm2, latitudeAtY, longitudeAtX } from "../climate/Insolation";
import { localTemperatureK } from "../climate/TemperatureField";
import { relativeHumidityFromPressure } from "../climate/Humidity";
import { zonalWindMS } from "../atmosphere/Circulation";
import { seasonAt } from "../climate/ClimateZones";
import { applyWaterFluxes, totalWaterInventoryKg, type WaterFluxKg } from "../hydrology/Inventory";
import { updateSeaLevelFromInventory } from "../hydrology/SeaLevel";
import { computeWaterCycle } from "../hydrology/WaterCycle";
import { slopeAt } from "../hydrology/Drainage";
import {
  BiomeMemoryStore,
  decideBiome,
  readonlyBiomeMemory,
  type ReadonlyBiomeMemory,
  type SerializedBiomeMemory,
} from "../biomes/stability";
import { createEnvironmentSnapshot } from "../snapshot/EnvironmentSnapshot";
import { PLANET_UNITS } from "../units";

function cloneConfig(config: PlanetPhysicalConfig): PlanetPhysicalConfig {
  const scheduler = resolveSchedulerConfig(config);
  return createEarthLikeConfig({
    ...config,
    orbit: { ...config.orbit },
    star: { ...config.star },
    interior: { ...config.interior },
    atmosphere: { ...config.atmosphere, composition: { ...config.atmosphere.composition } },
    hydrosphere: { ...config.hydrosphere },
    surface: { ...config.surface },
    scheduler: { ...scheduler },
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
    cellAreasM2: new Float64Array(field.cellAreasM2),
    oceanMask: new Uint8Array(field.oceanMask),
    coastlineMask: new Uint8Array(field.coastlineMask),
    ...(field.transportElevationM
      ? { transportElevationM: new Float64Array(field.transportElevationM) }
      : {}),
  };
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

interface GeologyFlow {
  interior: { heatJ: number; volcanicActivity: number; tectonicStress: number };
  elevationDeltaM: Float32Array;
  volcanicCo2Kg: number;
}

/**
 * Why the climate cache was invalidated. `scheduled` is the normal multi-rate
 * clock; `forced` is a genuine out-of-band change of climate inputs; `seek` is
 * a derived time jump; `manual` is diagnostic/benchmark refresh; `initial` is
 * the construction of the first field. Simple time advance is deliberately
 * absent: by itself it never invalidates the cache.
 */
export type ClimateRefreshReason = "initial" | "scheduled" | "forced" | "seek" | "manual";

const CLIMATE_REFRESH_REASONS: readonly ClimateRefreshReason[] = [
  "initial", "scheduled", "forced", "seek", "manual",
];

function emptyClimateRefreshCounts(): Record<ClimateRefreshReason, number> {
  return { initial: 0, scheduled: 0, forced: 0, seek: 0, manual: 0 };
}

export class PlanetEngine {
  readonly engineVersion = PLANET_ENGINE_VERSION;

  private readonly config: PlanetPhysicalConfig;
  private readonly schedulerConfig: PlanetSchedulerConfig;
  private readonly biomeMemory = new BiomeMemoryStore();
  private state: PlanetState;
  private currentSnapshot: PlanetEngineSnapshot;
  private currentEnvironmentSnapshot?: EnvironmentSnapshot;
  private elevationGrid?: ElevationGrid;
  private cachedSurfaceRevision = -1;
  /** Surface geometry revision; separate from state and climate revisions. */
  private surfaceRevision = 0;
  /** Applied hydrology transfers; separate from climate. */
  private hydrologyRevision = 0;
  /** Applied geology transfers; separate from climate. */
  private geologyRevision = 0;
  private surfaceCache?: { key: string; field: SurfaceField };
  private climateCache?: { revision: number; field: ClimateField };
  /** Bumped on every state mutation; deliberately NOT used by the climate cache. */
  private stateRevision = 0;
  /** Bumped only when the climate field is really invalidated. */
  private climateRevision = 0;
  /** Reason carried from invalidation to the actual recomputation. */
  private pendingClimateRefreshReason: ClimateRefreshReason = "initial";
  private climateRefreshCounts = emptyClimateRefreshCounts();
  private lastClimateRefreshReason?: ClimateRefreshReason;
  /** Instrumentation: number of real climate-field recomputations. */
  private climateUpdateCount = 0;
  private lastBiomeCommitTick = -1;
  private lastStepDeltaS: number = PLANET_UNITS.secondsPerEarthDay;

  constructor(config: PlanetPhysicalConfig) {
    validateConfig(config);
    this.config = cloneConfig(config);
    this.schedulerConfig = resolveSchedulerConfig(this.config);
    this.state = createInitialState(this.config);
    this.state.climate.albedo = estimateBondAlbedo(this.config);
    updateSeaLevelFromInventory(this.getElevationGrid(), this.state);
    validateState(this.config, this.state);
    this.currentSnapshot = this.refreshDerived();
    this.commitBiomeMemory();
  }

  getConfig(): PlanetPhysicalConfig {
    return cloneConfig(this.config);
  }

  getState(): PlanetState {
    return cloneState(this.state);
  }

  /** One coordinated logical tick. All public snapshots correspond to its end. */
  step(deltaS: number): PlanetEngineSnapshot {
    if (!Number.isFinite(deltaS) || deltaS < 0) {
      throw new PlanetInvariantError("step deltaS must be a finite non-negative number");
    }

    const nextTick = this.state.tick + 1;
    const nextTimeS = this.state.timeS + deltaS;
    const scheduler = this.state.scheduler;

    // 1. Accumulate deterministic SI clocks and decide which subsystems are due.
    scheduler.pendingClimateS += deltaS;
    scheduler.pendingHydrologyS += deltaS;
    scheduler.pendingGeologyS += deltaS;
    const climateDue = nextTick % this.schedulerConfig.climateIntervalTicks === 0;
    const hydrologyDue = nextTick % this.schedulerConfig.hydrologyIntervalTicks === 0;
    const geologyDue = nextTick % this.schedulerConfig.geologyIntervalTicks === 0;
    const hydrologyDeltaS = scheduler.pendingHydrologyS;
    const geologyDeltaS = scheduler.pendingGeologyS;

    // 2. Advance the single production clock BEFORE any field is computed. A
    //    scheduled climate refresh therefore refers to the exact tick/time that
    //    this step publishes, not to the previous tick.
    this.state.tick = nextTick;
    this.state.timeS = nextTimeS;
    this.state.rotationPhaseRad = rotationPhaseAt(this.config, nextTimeS);
    this.lastStepDeltaS = deltaS;
    this.stateRevision += 1;

    if (climateDue) {
      // Scheduled refresh: the only automatic climate invalidation. Water and
      // geology changes bump their own revisions, never `climateRevision`.
      this.invalidateClimateCache("scheduled");
      scheduler.lastClimateTick = nextTick;
      scheduler.pendingClimateS = 0;
    }

    // 3. `getClimateField()` recomputes only when the revision actually changed;
    //    between scheduled updates it returns the previous field unchanged.
    const initialState = cloneState(this.state);
    const initialSurface = this.getSurfaceField();
    const initialClimate = this.getClimateField();

    // 4. Compute flows from the coherent initial state before any transfer.
    const waterFluxes: WaterFluxKg | undefined = hydrologyDue
      ? computeWaterCycle({
        config: this.config,
        state: initialState,
        surface: initialSurface,
        climate: initialClimate,
        deltaS: hydrologyDeltaS,
      }).fluxesKg
      : undefined;
    const geologyFlow: GeologyFlow | undefined = geologyDue
      ? this.computeGeologyFlows(initialState, geologyDeltaS, nextTimeS)
      : undefined;

    // 5. Apply mass/energy transfers and the volume-conserving geology update.
    if (waterFluxes) {
      applyWaterFluxes(this.state, waterFluxes);
      this.stateRevision += 1;
      this.hydrologyRevision += 1;
      scheduler.lastHydrologyTick = nextTick;
      scheduler.pendingHydrologyS = 0;
    }
    if (geologyFlow) {
      this.applyGeologyFlow(geologyFlow, geologyDeltaS);
      this.geologyRevision += 1;
      scheduler.lastGeologyTick = nextTick;
      scheduler.pendingGeologyS = 0;
    }
    if (geologyFlow || waterFluxes) {
      updateSeaLevelFromInventory(this.getElevationGrid(), this.state);
    }

    // 6. Commit biome history once, in deterministic row-major order. Snapshots
    //    are pure readers of this engine-owned, monotonic memory store.
    this.commitBiomeMemory();

    // 7. Publish a coherent core snapshot. The environment view is created
    //    lazily from the same end-of-tick state on first access.
    const snapshot = this.refreshDerived();
    this.currentSnapshot = snapshot;
    this.currentEnvironmentSnapshot = undefined;
    return cloneSnapshot(snapshot);
  }

  /**
   * Derived-only absolute seek. It does not replay stateful geology/hydrology,
   * so it is intended for orbital inspection, not as a simulation substitute.
   */
  seek(tick: number, timeS: number): PlanetEngineSnapshot {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new PlanetInvariantError("seek tick must be a non-negative integer");
    }
    if (!Number.isFinite(timeS) || timeS < 0) {
      throw new PlanetInvariantError("seek timeS must be a finite non-negative number");
    }
    this.state.tick = tick;
    this.state.timeS = timeS;
    this.state.scheduler = {
      lastClimateTick: 0,
      lastHydrologyTick: 0,
      lastGeologyTick: 0,
      pendingClimateS: 0,
      pendingHydrologyS: 0,
      pendingGeologyS: 0,
    };
    this.biomeMemory.clear();
    this.lastBiomeCommitTick = -1;
    this.stateRevision += 1;
    // seek changes time/orbit, so the climate field must be rebuilt once.
    this.invalidateClimateCache("seek");
    return this.refreshDerivedAndSnapshot();
  }

  /** Instrumentation for scheduler/cache verification; no state is mutated. */
  getRuntimeDiagnostics(): Readonly<{
    stateRevision: number;
    surfaceRevision: number;
    hydrologyRevision: number;
    geologyRevision: number;
    climateRevision: number;
    climateUpdateCount: number;
    climateRefreshCounts: Readonly<Record<ClimateRefreshReason, number>>;
    lastClimateRefreshReason?: ClimateRefreshReason;
    lastBiomeCommitTick: number;
  }> {
    return {
      stateRevision: this.stateRevision,
      surfaceRevision: this.surfaceRevision,
      hydrologyRevision: this.hydrologyRevision,
      geologyRevision: this.geologyRevision,
      climateRevision: this.climateRevision,
      climateUpdateCount: this.climateUpdateCount,
      climateRefreshCounts: { ...this.climateRefreshCounts },
      lastClimateRefreshReason: this.lastClimateRefreshReason,
      lastBiomeCommitTick: this.lastBiomeCommitTick,
    };
  }

  snapshot(): PlanetEngineSnapshot {
    return cloneSnapshot(this.currentSnapshot);
  }

  /** Environment view of the latest completed tick, built on first access. */
  environmentSnapshot(): EnvironmentSnapshot {
    if (!this.currentEnvironmentSnapshot) {
      this.currentEnvironmentSnapshot = this.createEnvironmentSnapshot(this.lastStepDeltaS);
    }
    return this.currentEnvironmentSnapshot;
  }

  /**
   * Single climate invalidation gate. The reason is carried to the next real
   * recomputation so diagnostics can distinguish scheduled cadence from a
   * genuine out-of-band input change, a seek or a manual refresh.
   */
  private invalidateClimateCache(reason: ClimateRefreshReason): void {
    if (!CLIMATE_REFRESH_REASONS.includes(reason)) {
      throw new PlanetInvariantError(`unknown climate refresh reason: ${reason}`);
    }
    this.climateRevision += 1;
    this.pendingClimateRefreshReason = reason;
  }

  /** Deterministic elevation grid; rebuilt only when geology mutates it. */
  getElevationGrid(): ElevationGrid {
    if (!this.elevationGrid || this.cachedSurfaceRevision !== this.surfaceRevision) {
      this.elevationGrid = buildElevationGrid(this.config);
      this.cachedSurfaceRevision = this.surfaceRevision;
    }
    const grid = this.elevationGrid;
    return {
      ...grid,
      elevationM: new Float32Array(grid.elevationM),
      cellAreasM2: new Float64Array(grid.cellAreasM2),
      ...(grid.transportElevationM
        ? { transportElevationM: new Float64Array(grid.transportElevationM) }
        : {}),
    };
  }

  /** Surface derived from elevation + ocean mass inventory + solved sea level. */
  getSurfaceField(): SurfaceField {
    const key = `${this.state.hydrosphere.oceanMassKg.toFixed(6)}:${this.surfaceRevision}`;
    if (this.surfaceCache?.key === key) return cloneSurfaceField(this.surfaceCache.field);

    const grid = this.getElevationGrid();
    const waterVolumeM3 = this.state.hydrosphere.oceanMassKg / PLANET_UNITS.waterDensityKgM3;
    const seaLevelM = solveSeaLevelM(grid, waterVolumeM3);
    const field = buildSurfaceField(grid, seaLevelM);
    field.coastlineMask = buildCoastlineMask(field);

    this.surfaceCache = { key, field };
    return cloneSurfaceField(field);
  }

  /** Local climate driven by orbit, obliquity, elevation and gas inventory. */
  getClimateField(): ClimateField {
    if (this.climateCache?.revision === this.climateRevision) {
      return cloneClimateField(this.climateCache.field);
    }

    const surface = this.getSurfaceField();
    const orbit = orbitAt(this.config, this.state.timeS);
    const budget = computeEnergyBudget(this.config, orbit, this.state);
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
        const irradiance = dailyMeanIrradianceWm2(budget.fluxWm2, lat, orbit.declinationRad);
        const heightAboveSeaM = Math.max(0, surface.elevationM[index] - surface.seaLevelM);
        const oceanProximity = surface.oceanMask[index] === 1
          ? 1
          : 1 - Math.min(1, heightAboveSeaM / Math.max(this.config.surface.roughnessM, 1));
        const rh = relativeHumidityFromPressure(
          budget.surfaceTemperatureK,
          vaporPressurePa * (surface.oceanMask[index] === 1 ? 1 : 0.6 + 0.4 * oceanProximity),
          oceanProximity,
        );
        const temperature = localTemperatureK({
          globalMeanTemperatureK: budget.surfaceTemperatureK,
          globalMeanInsolationWm2: budget.meanInsolationWm2,
          irradianceWm2: irradiance,
          elevationM: surface.elevationM[index],
          seaLevelM: surface.seaLevelM,
          humidity: rh,
          gravityMS2: gravityMS2(this.config),
        });

        latitudeRad[index] = lat;
        longitudeRad[index] = lon;
        irradianceWm2[index] = irradiance;
        humidity[index] = rh;
        windMS[index] = zonalWindMS(lat, omega, 1e-5);
        temperatureK[index] = temperature;
      }
    }

    const field: ClimateField = {
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
    this.climateCache = { revision: this.climateRevision, field };
    this.climateUpdateCount += 1;
    this.climateRefreshCounts[this.pendingClimateRefreshReason] += 1;
    this.lastClimateRefreshReason = this.pendingClimateRefreshReason;
    return cloneClimateField(field);
  }

  getHydrologyField(deltaS: number): HydrologyField {
    return computeWaterCycle({
      config: this.config,
      state: this.state,
      surface: this.getSurfaceField(),
      climate: this.getClimateField(),
      deltaS,
    }).field;
  }

  /**
   * Manual hydrology step. It applies one water transfer but does NOT advance
   * tick/time; `step()` is the single coordinated production clock.
   */
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
    this.stateRevision += 1;
    this.hydrologyRevision += 1;
    // Vapor/H₂O is a climate input: this out-of-band mutation really forces a
    // fresh field once, even when the scheduler is not due.
    this.invalidateClimateCache("forced");
    this.getClimateField();
    this.refreshDerivedAndSnapshot();
    return result.field;
  }

  /**
   * Manual climate refresh for diagnostics and benchmarking. It rebuilds the
   * field from the current state but does NOT advance tick/time. Like the other
   * manual helpers it is out-of-band and invalidates the climate cache once.
   */
  refreshClimateField(): ClimateField {
    this.invalidateClimateCache("manual");
    return this.getClimateField();
  }

  /**
   * Manual surface refresh for diagnostics and benchmarking. It clears only the
   * derived surface cache and rebuilds from the current elevation/ocean state;
   * tick, climate and stored biome history are untouched.
   */
  refreshSurfaceField(): SurfaceField {
    this.surfaceCache = undefined;
    return this.getSurfaceField();
  }

  /**
   * Manual geology step. It evolves the surface but does NOT advance tick/time;
   * `step()` is the single coordinated production clock.
   */
  stepGeology(deltaS: number): SurfaceField {
    if (!Number.isFinite(deltaS) || deltaS <= 0) {
      throw new PlanetInvariantError("stepGeology deltaS must be a finite positive number");
    }
    const flow = this.computeGeologyFlows(this.state, deltaS, this.state.timeS);
    this.applyGeologyFlow(flow, deltaS);
    updateSeaLevelFromInventory(this.getElevationGrid(), this.state);
    this.geologyRevision += 1;
    // Elevation and injected volcanic CO₂ are climate inputs: force one fresh
    // field even when the scheduler is not due.
    this.invalidateClimateCache("forced");
    this.getClimateField();
    this.refreshDerivedAndSnapshot();
    return this.getSurfaceField();
  }

  /** Stable headless bridge for ecology/GENOME consumers. */
  createEnvironmentSnapshot(deltaS: number = PLANET_UNITS.secondsPerEarthDay): EnvironmentSnapshot {
    const snapshot = createEnvironmentSnapshot(this, {
      engineVersion: this.engineVersion,
      deltaS,
    });
    this.currentEnvironmentSnapshot = snapshot;
    return snapshot;
  }

  /** Engine-owned serializable memory exposed to consumers as a read-only view. */
  getBiomeMemory(): ReadonlyBiomeMemory {
    return readonlyBiomeMemory(this.biomeMemory);
  }

  /** Restore a previously serialized memory store without temporal regression. */
  restoreBiomeMemory(records: readonly SerializedBiomeMemory[]): void {
    this.biomeMemory.clear();
    for (const record of records) this.biomeMemory.set(record.index, record);
    let maxTick = -1;
    for (const record of records) maxTick = Math.max(maxTick, record.tick);
    this.lastBiomeCommitTick = maxTick;
    this.currentEnvironmentSnapshot = undefined;
  }

  totalWaterKg(): number {
    return totalWaterInventoryKg(this.state);
  }

  /**
   * Controlled biome-memory phase. This is the ONLY writer of the store; it
   * runs once per tick in row-major order so access order can never influence
   * results and stale snapshots cannot rewrite history.
   */
  private commitBiomeMemory(): void {
    if (this.lastBiomeCommitTick === this.state.tick) return;
    const surface = this.getSurfaceField();
    const climate = this.getClimateField();
    const hydrology = this.getHydrologyField(this.lastStepDeltaS);
    const view = this.biomeMemory.view();

    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) {
        const index = y * surface.width + x;
        const decision = decideBiome({
          temperatureK: climate.temperatureK[index],
          precipitationMPerYear: hydrology.precipitationMPerYear[index],
          humidity: climate.humidity[index],
          elevationM: surface.elevationM[index],
          seaLevelM: surface.seaLevelM,
          slope: slopeAt(surface, x, y),
          soilMoisture: hydrology.soilMoisture[index],
          iceFraction: this.config.hydrosphere.iceFraction,
        }, this.state.tick, view.get(index));
        this.biomeMemory.commit(index, decision, this.state.tick);
      }
    }
    this.lastBiomeCommitTick = this.state.tick;
  }

  private computeGeologyFlows(baseState: PlanetState, deltaS: number, timeS: number): GeologyFlow {
    const interior = stepInterior(this.config, baseState, deltaS);
    const grid = this.getElevationGrid();
    const elevationDeltaM = new Float32Array(grid.elevationM.length);
    let volcanicCo2Kg = 0;

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const index = y * grid.width + x;
        const event = volcanicEventAt(this.config, baseState, x, y, timeS, deltaS);
        elevationDeltaM[index] = tectonicElevationDeltaM(this.config, baseState, x, y, deltaS)
          + event.elevationDeltaM;
        volcanicCo2Kg += event.co2Kg;
      }
    }

    return { interior, elevationDeltaM, volcanicCo2Kg };
  }

  private applyGeologyFlow(flow: GeologyFlow, deltaS: number): void {
    this.state.interior.heatJ = flow.interior.heatJ;
    this.state.interior.tectonicStress = flow.interior.tectonicStress;
    this.state.interior.volcanicActivity = flow.interior.volcanicActivity;
    injectGasMassKg(this.state, "CO2", flow.volcanicCo2Kg);

    const uplifted = applyElevationDeltaM(this.getElevationGrid(), flow.elevationDeltaM);
    const eroded = erodeAndDeposit(this.config, uplifted, deltaS);
    this.setElevationGrid(eroded.elevationM, eroded.transportElevationM);
  }

  private setElevationGrid(elevationM: Float32Array, transportElevationM?: Float64Array): void {
    let minM = Infinity;
    let maxM = -Infinity;
    for (let i = 0; i < elevationM.length; i += 1) {
      if (elevationM[i] < minM) minM = elevationM[i];
      if (elevationM[i] > maxM) maxM = elevationM[i];
    }
    const cellAreasM2 = cellAreasForConfig(this.config);
    this.elevationGrid = {
      width: this.config.surface.gridWidth,
      height: this.config.surface.gridHeight,
      elevationM: new Float32Array(elevationM),
      minM,
      maxM,
      cellAreasM2,
      cellAreaM2: meanCellAreaM2(cellAreasM2),
      transportElevationM: transportElevationM ? new Float64Array(transportElevationM) : undefined,
    };
    this.surfaceRevision += 1;
    this.surfaceCache = undefined;
    // Surface geometry changes are tracked by `stateRevision`. They must NOT
    // invalidate the climate cache: only the scheduler controls that clock.
    this.stateRevision += 1;
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
    this.commitBiomeMemory();
    const snapshot = this.refreshDerived();
    validateState(this.config, this.state);
    this.currentSnapshot = snapshot;
    this.currentEnvironmentSnapshot = undefined;
    return cloneSnapshot(snapshot);
  }
}
