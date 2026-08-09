import type {
  Organism,
  PlanetConfig,
  SimulationStats,
  SpeciesRecord,
  WorldSnapshot,
} from "../../types";
import { Random } from "./random";
import { Planet } from "../planet/planet";
import { createRandomOrganism, upkeepCost, isDying } from "../biology/organism";
import { averageGenome } from "../biology/genome";
import { moveOrganism } from "../ecology/movement";
import { feedOrganisms } from "../ecology/feeding";
import { reproduceOrganisms } from "../evolution/reproduction";
import {
  attemptSpeciation,
  initializeSpeciesRegistry,
  updateSpeciesPopulations,
  SPECIATION_CHECK_INTERVAL,
} from "../evolution/speciation";
import { TICKS_PER_YEAR } from "./constants";

/**
 * World is the top-level simulation object. It owns the planet, the
 * population of organisms, the species genealogy registry, and drives the
 * tick cycle:
 *  1. update environment (climate, seasons, biomes)
 *  2. update metabolism
 *  3. update movement
 *  4. handle feeding
 *  5. handle death + removal
 *  6. handle reproduction (genetic-distance-based mate compatibility)
 *  7. apply mutation to offspring (done inside reproduction)
 *  8. update statistics (including species population/extinction bookkeeping,
 *     and periodic speciation checks)
 */
export class World {
  planet: Planet;
  organisms: Organism[] = [];
  tick = 0;

  private rng: Random;
  private nextOrganismId = 1;
  private nextSpeciesId = 1;
  private speciesRegistry: Map<number, SpeciesRecord>;
  private lastStats: SimulationStats;

  constructor(config: PlanetConfig, initialPopulation: number) {
    this.rng = new Random(config.seed);
    this.planet = new Planet(config);
    this.speciesRegistry = new Map();
    this.seedPopulation(initialPopulation);
    this.lastStats = this.computeStats(0, 0);
  }

  private seedPopulation(count: number): void {
    const speciesId = this.nextSpeciesId++;
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const x = this.rng.range(0, this.planet.width);
      const y = this.rng.range(0, this.planet.height);
      const cell = this.planet.getCell(Math.round(x) % this.planet.width, Math.round(y) % this.planet.height);
      if (cell.terrain === "ocean") continue;
      this.organisms.push(
        createRandomOrganism(this.nextOrganismId++, speciesId, x, y, this.rng),
      );
      placed++;
    }
    this.speciesRegistry = initializeSpeciesRegistry(speciesId, placed);
  }

  /** Runs exactly one simulation tick, per the documented 8-step cycle. */
  step(): void {
    this.tick++;

    // 1. environment (includes seasonal cycle and dynamic biome shifts)
    this.planet.update(this.tick);

    // 2 & 3. metabolism + movement
    for (const o of this.organisms) {
      if (!o.alive) continue;
      o.age++;
      o.energy -= upkeepCost(o);
      moveOrganism(o, this.planet, this.rng);
    }

    // 4. feeding
    feedOrganisms(this.organisms, this.planet);

    // 5. death + removal
    let deaths = 0;
    for (const o of this.organisms) {
      if (o.alive && isDying(o)) {
        o.alive = false;
        deaths++;
      }
    }
    if (deaths > 0) {
      this.organisms = this.organisms.filter((o) => o.alive);
    }

    // 6 & 7. reproduction + mutation (mate compatibility is genetic-distance-based)
    const offspring = reproduceOrganisms(this.organisms, this.planet, this.rng, () => this.nextOrganismId++);
    if (offspring.length > 0) this.organisms.push(...offspring);

    // 8a. species bookkeeping: population counts + extinction detection
    updateSpeciesPopulations(this.organisms, this.speciesRegistry, this.tick);

    // 8b. periodic speciation check: can a species' population be split
    // into two geographically + genetically diverged groups?
    if (this.tick % SPECIATION_CHECK_INTERVAL === 0) {
      const currentYear = Math.floor(this.tick / TICKS_PER_YEAR);
      attemptSpeciation(this.organisms, this.speciesRegistry, this.tick, currentYear, this.rng, () => this.nextSpeciesId++);
      // Recompute populations again since organisms may have just been
      // reassigned to newly created species.
      updateSpeciesPopulations(this.organisms, this.speciesRegistry, this.tick);
    }

    // 8c. statistics
    this.lastStats = this.computeStats(offspring.length, deaths);
  }

  private computeStats(births: number, deaths: number): SimulationStats {
    const records = Array.from(this.speciesRegistry.values());
    const speciesAlive = records.filter((r) => r.alive).length;
    const speciesExtinct = records.filter((r) => !r.alive).length;

    return {
      tick: this.tick,
      year: Math.floor(this.tick / TICKS_PER_YEAR),
      season: Planet.seasonForTick(this.tick),
      population: this.organisms.length,
      speciesCount: speciesAlive,
      speciesAlive,
      speciesTotalEver: records.length,
      speciesExtinct,
      averageGenome: averageGenome(this.organisms.map((o) => o.genome)),
      births,
      deaths,
    };
  }

  getStats(): SimulationStats {
    return this.lastStats;
  }

  /** Full species genealogy (living and extinct), for the UI/albero evolutivo. */
  getSpeciesTree(): SpeciesRecord[] {
    return Array.from(this.speciesRegistry.values());
  }

  toSnapshot(): WorldSnapshot {
    return {
      tick: this.tick,
      planet: { config: this.planet.config, cells: this.planet.cells },
      organisms: this.organisms,
      nextOrganismId: this.nextOrganismId,
      nextSpeciesId: this.nextSpeciesId,
      randomState: this.rng.getState(),
      speciesRegistry: Array.from(this.speciesRegistry.values()),
    };
  }

  static fromSnapshot(snapshot: WorldSnapshot): World {
    const world = Object.create(World.prototype) as World;
    world.planet = new Planet(snapshot.planet.config, snapshot.planet.cells);
    world.organisms = snapshot.organisms;
    world.tick = snapshot.tick;
    world.nextOrganismId = snapshot.nextOrganismId;
    world.nextSpeciesId = snapshot.nextSpeciesId;
    world.rng = new Random(snapshot.planet.config.seed);
    world.rng.setState(snapshot.randomState);
    world.speciesRegistry = new Map(snapshot.speciesRegistry.map((r) => [r.speciesId, r]));
    world.lastStats = world.computeStats(0, 0);
    return world;
  }
}
