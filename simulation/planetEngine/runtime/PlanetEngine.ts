/**
 * CONTRACT / RUNTIME
 *
 * Deterministic orchestration facade. The engine depends only on time and its
 * immutable configuration; it never reads Date.now, Math.random, DOM globals,
 * Three.js, World or any biology/GENOME module.
 */

import type { OrbitPosition, PlanetEngineSnapshot, PlanetPhysicalConfig, PlanetState } from "../contracts";
import {
  cloneState,
  createEarthLikeConfig,
  createInitialState,
  PLANET_ENGINE_VERSION,
  rotationPhaseAt,
} from "../core/PlanetCore";
import { orbitAt } from "../core/Orbit";
import { computeEnergyBudget, estimateBondAlbedo } from "../core/EnergyBudget";
import { PlanetInvariantError, validateConfig, validateState } from "../core/invariants";
import { gravityMS2 } from "../core/PlanetCore";

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

export class PlanetEngine {
  readonly engineVersion = PLANET_ENGINE_VERSION;

  private readonly config: PlanetPhysicalConfig;
  private state: PlanetState;
  private currentSnapshot: PlanetEngineSnapshot;

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
