import type { Cell, PlanetConfig, Season, TerrainType } from "../../types";
import { Random } from "../core/random";
import { TICKS_PER_YEAR } from "../core/constants";

/**
 * Planet owns the grid of Cells and the logic to generate and evolve the
 * environment over time (seasonal temperature cycle, vegetation regrowth,
 * dynamic biome reclassification). It has no knowledge of organisms,
 * genetics, or rendering.
 */
export class Planet {
  readonly config: PlanetConfig;
  cells: Cell[];

  constructor(config: PlanetConfig, cells?: Cell[]) {
    this.config = config;
    this.cells = cells ?? Planet.generate(config);
  }

  /** Structural classification from elevation/water — fixed for the planet's lifetime. */
  private static classifyBase(elevation: number, water: number): "ocean" | "mountain" | null {
    if (water > 0.65) return "ocean";
    if (elevation > 0.75) return "mountain";
    return null;
  }

  /**
   * Climate-dependent biome for non-ocean, non-mountain land. Re-evaluated
   * every tick from the cell's *current* temperature/water/vegetation, so a
   * biome can genuinely shift over time as climate drifts (e.g. a plain
   * drying into desert, or warming into savanna).
   */
  private static classifyBiome(temperature: number, water: number, vegetation: number): TerrainType {
    if (temperature < 2) return "tundra";
    if (water < 0.22 && vegetation < 0.35) return "desert";
    if (vegetation > 0.62) return "forest";
    if (temperature > 24 && vegetation < 0.5) return "savanna";
    return "plains";
  }

  /** Generates a new planet using simple layered noise seeded by the config. */
  static generate(config: PlanetConfig): Cell[] {
    const { width, height, seed } = config;
    const rng = new Random(seed);
    const cells: Cell[] = new Array(width * height);

    const elevationPoints = Planet.randomFieldPoints(rng, 6, width, height);
    const waterPoints = Planet.randomFieldPoints(rng, 5, width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const elevation = Planet.fieldValue(elevationPoints, x, y, width, height);
        const water = Planet.fieldValue(waterPoints, x, y, width, height);
        const latitude = Math.abs(y / height - 0.5) * 2; // 0 at equator, 1 at poles
        const temperature = 32 - latitude * 40 - elevation * 10 + rng.range(-2, 2);

        const base = Planet.classifyBase(elevation, water);
        const vegetation = base === "ocean"
          ? 0
          : Math.max(0, Math.min(1, (1 - Math.abs(temperature - 22) / 40) * (1 - Math.abs(water - 0.4))));

        const terrain: TerrainType = base ?? Planet.classifyBiome(temperature, water, vegetation);

        cells[y * width + x] = { elevation, temperature, water, vegetation, terrain };
      }
    }
    return cells;
  }

  private static randomFieldPoints(rng: Random, count: number, width: number, height: number) {
    return Array.from({ length: count }, () => ({
      x: rng.range(0, width),
      y: rng.range(0, height),
      strength: rng.range(0.5, 1),
      radius: rng.range(width * 0.2, width * 0.5),
    }));
  }

  private static fieldValue(
    points: { x: number; y: number; strength: number; radius: number }[],
    x: number,
    y: number,
    width: number,
    height: number,
  ): number {
    let total = 0;
    for (const p of points) {
      const dx = Math.min(Math.abs(x - p.x), width - Math.abs(x - p.x));
      const dy = Math.min(Math.abs(y - p.y), height - Math.abs(y - p.y));
      const dist = Math.sqrt(dx * dx + dy * dy);
      total += p.strength * Math.max(0, 1 - dist / p.radius);
    }
    return Math.max(0, Math.min(1, total / points.length + 0.3));
  }

  get width(): number {
    return this.config.width;
  }

  get height(): number {
    return this.config.height;
  }

  index(x: number, y: number): number {
    return y * this.config.width + x;
  }

  getCell(x: number, y: number): Cell {
    return this.cells[this.index(x, y)];
  }

  /** Returns the current season for a given tick, based on a full-year cycle. */
  static seasonForTick(tick: number): Season {
    const phase = (tick % TICKS_PER_YEAR) / TICKS_PER_YEAR; // 0..1 through the year
    if (phase < 0.25) return "primavera";
    if (phase < 0.5) return "estate";
    if (phase < 0.75) return "autunno";
    return "inverno";
  }

  /**
   * Advances environment by one tick: seasonal temperature swing, vegetation
   * regrowth (faster in warm/wet seasons, slower in winter), and dynamic
   * biome reclassification for land cells.
   */
  update(tick: number): void {
    // Seasonal temperature offset: a full sine wave per year, warmest in
    // "estate", coldest in "inverno".
    const seasonalOffset = Math.sin((tick / TICKS_PER_YEAR) * Math.PI * 2) * 8;
    // Slow multi-year climate drift on top of the seasonal cycle.
    const climateDrift = Math.sin(tick / (TICKS_PER_YEAR * 20)) * 2;
    const season = Planet.seasonForTick(tick);
    const growthFactor = season === "inverno" ? 0.3 : season === "estate" ? 1.6 : 1;

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (cell.terrain === "ocean") continue;

      cell.temperature = cell.temperature * 0.999 + (cell.temperature + seasonalOffset * 0.02 + climateDrift * 0.005) * 0.001;

      if (cell.terrain !== "mountain") {
        const regrowth = 0.0025 * growthFactor * (1 - cell.vegetation) * (cell.water > 0.1 ? 1 : 0.2);
        cell.vegetation = Math.max(0, Math.min(1, cell.vegetation + regrowth));
        // Biome can shift dynamically as temperature/vegetation change.
        cell.terrain = Planet.classifyBiome(cell.temperature, cell.water, cell.vegetation);
      }
    }
  }
}
