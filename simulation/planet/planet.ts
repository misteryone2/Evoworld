import type { Cell, PlanetConfig, TerrainType } from "../../types";
import { Random } from "../core/random";

/**
 * Planet owns the grid of Cells and the logic to generate and evolve the
 * environment over time (temperature drift, vegetation regrowth). It has no
 * knowledge of organisms, genetics, or rendering.
 */
export class Planet {
  readonly config: PlanetConfig;
  cells: Cell[];

  constructor(config: PlanetConfig, cells?: Cell[]) {
    this.config = config;
    this.cells = cells ?? Planet.generate(config);
  }

  private static classifyTerrain(elevation: number, water: number): TerrainType {
    if (water > 0.65) return "ocean";
    if (elevation > 0.75) return "mountain";
    if (water < 0.2 && elevation < 0.4) return "desert";
    return "plains";
  }

  /** Generates a new planet using simple layered noise seeded by the config. */
  static generate(config: PlanetConfig): Cell[] {
    const { width, height, seed } = config;
    const rng = new Random(seed);
    const cells: Cell[] = new Array(width * height);

    // A handful of random "influence points" create smooth, organic
    // elevation/water fields without needing a full noise library dependency.
    const elevationPoints = Planet.randomFieldPoints(rng, 6, width, height);
    const waterPoints = Planet.randomFieldPoints(rng, 5, width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const elevation = Planet.fieldValue(elevationPoints, x, y, width, height);
        const water = Planet.fieldValue(waterPoints, x, y, width, height);
        const latitude = Math.abs(y / height - 0.5) * 2; // 0 at equator, 1 at poles
        const temperature = 32 - latitude * 40 - elevation * 10 + rng.range(-2, 2);
        const vegetation = Planet.classifyTerrain(elevation, water) === "ocean"
          ? 0
          : Math.max(0, Math.min(1, (1 - Math.abs(temperature - 22) / 40) * (1 - Math.abs(water - 0.4))));

        cells[y * width + x] = {
          temperature,
          water,
          vegetation,
          terrain: Planet.classifyTerrain(elevation, water),
        };
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
      // Wrap distance for a seamless-ish planet surface.
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

  /** Advances environment by one tick: vegetation regrowth and mild seasonal drift. */
  update(tick: number): void {
    const seasonal = Math.sin(tick / 3650) * 3; // slow multi-year drift
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (cell.terrain === "ocean") continue;
      const regrowth = 0.002 * (1 - cell.vegetation) * (cell.water > 0.1 ? 1 : 0.2);
      cell.vegetation = Math.max(0, Math.min(1, cell.vegetation + regrowth));
      cell.temperature += seasonal * 0.001;
    }
  }
}
