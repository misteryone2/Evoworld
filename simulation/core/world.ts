import type {
  Organism,
  PlanetConfig,
  SimulationStats,
  SpeciesGenomeStats,
  SpeciesRecord,
  WorldSnapshot,
} from "../../types";
import { Random } from "./random";
import { Planet } from "../planet/planet";
import { createRandomOrganism, upkeepCost, dispersalCost, DISPERSAL_HOME_RADIUS, isDying } from "../biology/organism";
import { averageGenome, randomGenome } from "../biology/genome";
import { moveOrganism } from "../ecology/movement";
import { feedOrganisms, regionKey, FEEDING_REGION_SIZE } from "../ecology/feeding";
import { huntPrey } from "../ecology/predation";
import { buildOrganismBuckets } from "../ecology/spatialIndex";
import { BEHAVIOR_BUCKET_SIZE } from "../ecology/behavior";
import { reproduceOrganisms } from "../evolution/reproduction";
import {
  attemptSpeciation,
  initializeSpeciesRegistry,
  updateSpeciesPopulations,
  SPECIATION_CHECK_INTERVAL,
} from "../evolution/speciation";
import { computeSpeciesGenomeStats } from "../evolution/speciesAnalysis";
import { TICKS_PER_YEAR, CHUNK_ACTIVATION_HALO } from "./constants";
import { computeActiveChunkKeys } from "../planet/chunkActivity";
import { RegionEstablishment } from "../ecology/regionEcology";

/**
 * v1.2 — EXPERIMENTAL. Maximum extra per-tick death probability for an
 * organism in a completely unestablished (freshly colonized) region,
 * tapering to 0 as that region settles — see World.step's death phase and
 * RegionEstablishment.
 */
const SETTLEMENT_MORTALITY_MAX = 0.004;

/**
 * World is the top-level simulation object. It owns the planet, the
 * population of organisms, the species genealogy registry, and drives the
 * tick cycle:
 *  1. update environment (climate, seasons, biomes)
 *  2. update metabolism
 *  3. update movement
 *  4. handle feeding (vegetation, weighted by herbivory) + predation (v0.3)
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
  /**
   * v1.2 — EXPERIMENTAL flag, defaults on. Exists so a controlled A/B
   * comparison (with vs. without the dispersal cost — see
   * simulation/biology/organism.ts's dispersalCost) can be run from the
   * exact same World class rather than a forked copy. Not exposed through
   * PlanetConfig/the worker protocol: this is an internal tuning knob for
   * evaluating the mechanism, not a person-facing setting.
   */
  private enableDispersalCost: boolean;
  /**
   * v1.2 — EXPERIMENTAL, same rationale as enableDispersalCost above: a
   * newly colonized region's low productivity/higher mortality (see
   * simulation/ecology/regionEcology.ts) is toggleable for controlled A/B
   * comparison. null when disabled (no per-region state tracked at all,
   * not just a no-op multiplier — keeps the "without" condition honestly
   * identical to pre-settlement-mechanism behavior).
   */
  private regionEstablishment: RegionEstablishment | null;

  constructor(
    config: PlanetConfig,
    initialPopulation: number,
    options?: { enableDispersalCost?: boolean; enableSettlement?: boolean },
  ) {
    this.rng = new Random(config.seed);
    this.planet = new Planet(config);
    this.speciesRegistry = new Map();
    this.enableDispersalCost = options?.enableDispersalCost ?? true;
    this.regionEstablishment = (options?.enableSettlement ?? true) ? new RegionEstablishment() : null;
    this.seedPopulation(initialPopulation);
    // v1.2 — the founding population represents organisms already settled
    // in the world, not colonizers: their home regions start fully
    // established, never subject to the settlement ramp. Only regions
    // reached *later* — by organisms dispersing out from where they
    // already are, whether founders or their descendants — start at 0 and
    // must go through it. This is what confines the settlement penalty to
    // the actual colonization dynamic rather than to the initial seeding.
    //
    // v1.2.2 — seeds the founder's *whole home territory* (every region
    // within DISPERSAL_HOME_RADIUS, matching dispersalCost's own
    // definition of "home"), not just the single 8-cell region a founder
    // happened to land in. Otherwise ordinary local foraging that drifts
    // even one region over from the exact birth point — completely
    // normal, unremarkable movement, not dispersal — would still trigger
    // feeding.ts's settlement-efficiency floor and the settlement
    // mortality risk below for a founding population that's supposed to
    // already be settled everywhere it naturally roams.
    if (this.regionEstablishment) {
      const seedKeys: string[] = [];
      for (const o of this.organisms) {
        const homeRx = Math.floor(o.position.x / FEEDING_REGION_SIZE);
        const homeRy = Math.floor(o.position.y / FEEDING_REGION_SIZE);
        const regionsX = Math.ceil(this.planet.width / FEEDING_REGION_SIZE);
        const regionsY = Math.ceil(this.planet.height / FEEDING_REGION_SIZE);
        for (let dx = -DISPERSAL_HOME_RADIUS; dx <= DISPERSAL_HOME_RADIUS; dx++) {
          for (let dy = -DISPERSAL_HOME_RADIUS; dy <= DISPERSAL_HOME_RADIUS; dy++) {
            const rx = (((homeRx + dx) % regionsX) + regionsX) % regionsX;
            const ry = (((homeRy + dy) % regionsY) + regionsY) % regionsY;
            seedKeys.push(`${rx},${ry}`);
          }
        }
      }
      this.regionEstablishment.seedEstablished(seedKeys);
    }
    this.lastStats = this.computeStats(0, 0, 0);
  }

  private seedPopulation(count: number): void {
    const speciesId = this.nextSpeciesId++;
    let placed = 0;
    let attempts = 0;
    const founders: Organism[] = [];
    while (placed < count && attempts < count * 20) {
      attempts++;
      const x = this.rng.range(0, this.planet.width);
      const y = this.rng.range(0, this.planet.height);
      const cell = this.planet.getCell(Math.round(x) % this.planet.width, Math.round(y) % this.planet.height);
      if (cell.terrain === "ocean") continue;
      const organism = createRandomOrganism(this.nextOrganismId++, speciesId, x, y, this.rng);
      this.organisms.push(organism);
      founders.push(organism);
      placed++;
    }
    const originGenomeSnapshot = averageGenome(founders.map((o) => o.genome));
    this.speciesRegistry = initializeSpeciesRegistry(
      speciesId,
      placed,
      // founders is always non-empty in practice (initialPopulation > 0);
      // fall back to a fresh random genome defensively rather than throw.
      originGenomeSnapshot ?? randomGenome(this.rng),
    );
  }

  /** Runs exactly one simulation tick, per the documented 8-step cycle. */
  step(): void {
    this.tick++;

    // 1. environment (includes seasonal cycle and dynamic biome shifts).
    // v1.1 — only chunks near a living organism (plus a small halo) are
    // actually simulated this tick; see computeActiveChunkKeys and
    // Planet.update's class doc for the full rationale.
    const activeChunks = computeActiveChunkKeys(
      this.organisms,
      this.planet.width,
      this.planet.height,
      this.planet.chunkSize,
      CHUNK_ACTIVATION_HALO,
    );
    this.planet.update(this.tick, activeChunks);

    // 2 & 3. metabolism + movement. Buckets are built once from
    // pre-movement positions and shared by every organism's behavioral bias
    // computation this tick (v0.5: flocking/fear/hunting-seek/territoriality).
    const behaviorBuckets = buildOrganismBuckets(this.organisms, BEHAVIOR_BUCKET_SIZE);
    for (const o of this.organisms) {
      if (!o.alive) continue;
      o.age++;
      o.energy -= upkeepCost(o);
      if (this.enableDispersalCost) {
        const currentX = Math.round(o.position.x) % this.planet.width;
        const currentY = Math.round(o.position.y) % this.planet.height;
        const currentEstablishment = this.regionEstablishment?.get(regionKey(currentX, currentY)) ?? 1;
        o.energy -= dispersalCost(
          Math.floor(o.home.x / FEEDING_REGION_SIZE),
          Math.floor(o.home.y / FEEDING_REGION_SIZE),
          Math.floor(currentX / FEEDING_REGION_SIZE),
          Math.floor(currentY / FEEDING_REGION_SIZE),
          Math.ceil(this.planet.width / FEEDING_REGION_SIZE),
          Math.ceil(this.planet.height / FEEDING_REGION_SIZE),
          currentEstablishment,
        );
      }
      moveOrganism(o, this.planet, this.rng, behaviorBuckets, BEHAVIOR_BUCKET_SIZE, this.tick);
    }

    // 4. feeding (vegetation, weighted by 1 - carnivory)
    feedOrganisms(this.organisms, this.planet, this.regionEstablishment ?? undefined);

    // 4b. predation (v0.3): carnivorous organisms may hunt nearby prey
    const predationKills = huntPrey(this.organisms, this.planet, this.rng, this.tick);

    // 5. death + removal (includes organisms killed by predation above)
    let deaths = 0;
    for (const o of this.organisms) {
      if (!o.alive) continue;
      if (isDying(o)) {
        o.alive = false;
        deaths++;
        continue;
      }
      // v1.2 — EXPERIMENTAL settlement risk: an organism living in a
      // still-unsettled region (see RegionEstablishment) faces a small
      // extra chance of death this tick — unfamiliar hazards a mature,
      // established population would no longer be as exposed to. Tapers
      // to 0 as the region establishes; never applies at all when the
      // settlement mechanism is disabled.
      if (this.regionEstablishment) {
        const key = regionKey(
          Math.round(o.position.x) % this.planet.width,
          Math.round(o.position.y) % this.planet.height,
        );
        const establishment = this.regionEstablishment.get(key);
        const settlementRisk = SETTLEMENT_MORTALITY_MAX * (1 - establishment);
        if (settlementRisk > 0 && this.rng.chance(settlementRisk)) {
          o.alive = false;
          deaths++;
        }
      }
    }
    if (deaths > 0 || predationKills > 0) {
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
      updateSpeciesPopulations(this.organisms, this.speciesRegistry, this.tick);
    }

    // 8c. statistics
    this.lastStats = this.computeStats(offspring.length, deaths, predationKills);
  }

  private computeStats(births: number, deaths: number, predationKills: number): SimulationStats {
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
      predationKills,
    };
  }

  getStats(): SimulationStats {
    return this.lastStats;
  }

  /** Full species genealogy (living and extinct), for the UI/albero evolutivo. */
  getSpeciesTree(): SpeciesRecord[] {
    return Array.from(this.speciesRegistry.values());
  }

  /** Per-species genetic analysis for every currently-alive species (v0.4.1). */
  getSpeciesGenomeStats(): SpeciesGenomeStats[] {
    return computeSpeciesGenomeStats(this.organisms, this.speciesRegistry);
  }

  /** Finds a single living organism by id (v1.0.4 — esplorazione individuale), or null if it's no longer alive/present. */
  findOrganismById(id: number): Organism | null {
    return this.organisms.find((o) => o.id === id) ?? null;
  }

  toSnapshot(): WorldSnapshot {
    return {
      tick: this.tick,
      planet: { config: this.planet.config, chunks: this.planet.getMaterializedChunks() },
      organisms: this.organisms,
      nextOrganismId: this.nextOrganismId,
      nextSpeciesId: this.nextSpeciesId,
      randomState: this.rng.getState(),
      speciesRegistry: Array.from(this.speciesRegistry.values()),
    };
  }

  static fromSnapshot(snapshot: WorldSnapshot): World {
    const world = Object.create(World.prototype) as World;
    // v1.1 — new saves carry chunks; saves made before v1.1 instead carry
    // a legacy dense cells array, migrated once here (see
    // Planet.fromLegacyDenseCells for what that migration does).
    world.planet = snapshot.planet.chunks
      ? Planet.fromChunkSnapshot(snapshot.planet.config, snapshot.planet.chunks)
      : Planet.fromLegacyDenseCells(snapshot.planet.config, snapshot.planet.cells ?? []);
    world.organisms = snapshot.organisms;
    world.tick = snapshot.tick;
    world.nextOrganismId = snapshot.nextOrganismId;
    world.nextSpeciesId = snapshot.nextSpeciesId;
    world.rng = new Random(snapshot.planet.config.seed);
    world.rng.setState(snapshot.randomState);
    world.speciesRegistry = new Map(snapshot.speciesRegistry.map((r) => [r.speciesId, r]));
    // v1.2 — restored worlds resume with dispersal cost/settlement both
    // on (the shipped default), since these flags are an internal tuning
    // knob, not part of a saved WorldSnapshot. Regions around every
    // restored organism's current position are seeded as established —
    // otherwise a long-settled population would resume as if it had just
    // colonized everywhere it already lives, paying the settlement
    // penalty for no reason (same home-territory-seeding logic as the
    // constructor, applied to current position since a restored
    // organism's true settled history isn't itself part of the snapshot).
    world.enableDispersalCost = true;
    world.regionEstablishment = new RegionEstablishment();
    const seedKeys: string[] = [];
    const regionsX = Math.ceil(world.planet.width / FEEDING_REGION_SIZE);
    const regionsY = Math.ceil(world.planet.height / FEEDING_REGION_SIZE);
    for (const o of world.organisms) {
      const rx = Math.floor(o.position.x / FEEDING_REGION_SIZE);
      const ry = Math.floor(o.position.y / FEEDING_REGION_SIZE);
      for (let dx = -DISPERSAL_HOME_RADIUS; dx <= DISPERSAL_HOME_RADIUS; dx++) {
        for (let dy = -DISPERSAL_HOME_RADIUS; dy <= DISPERSAL_HOME_RADIUS; dy++) {
          const wrappedX = (((rx + dx) % regionsX) + regionsX) % regionsX;
          const wrappedY = (((ry + dy) % regionsY) + regionsY) % regionsY;
          seedKeys.push(`${wrappedX},${wrappedY}`);
        }
      }
    }
    world.regionEstablishment.seedEstablished(seedKeys);
    world.lastStats = world.computeStats(0, 0, 0);
    return world;
  }
}
