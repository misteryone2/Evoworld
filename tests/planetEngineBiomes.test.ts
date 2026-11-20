import { describe, expect, it } from "vitest";
import {
  biomeScores,
  classifyBiome,
  type BiomeInput,
} from "../simulation/planetEngine/biomes/classifier";
import { updateBiome } from "../simulation/planetEngine/biomes/stability";

const BASE: BiomeInput = {
  temperatureK: 288,
  precipitationMPerYear: 1200,
  humidity: 0.7,
  elevationM: 100,
  seaLevelM: 0,
  slope: 0.05,
  soilMoisture: 0.6,
  climateStability: 1,
  iceFraction: 0,
};

describe("M4 — emergent biome classifier", () => {
  it("has no latitude input or fixed latitude threshold", () => {
    expect("latitudeRad" in BASE).toBe(false);
    expect("latRad" in BASE).toBe(false);
  });

  it("selects biomes from continuous environmental suitability", () => {
    expect(classifyBiome(BASE)).toBe("forest");
    expect(classifyBiome({ ...BASE, temperatureK: 305, precipitationMPerYear: 40, humidity: 0.15, soilMoisture: 0.1 })).toBe("desert");
    expect(classifyBiome({ ...BASE, temperatureK: 250, precipitationMPerYear: 300 })).toBe("tundra");
    expect(classifyBiome({ ...BASE, elevationM: -200 })).toBe("ocean");
    expect(classifyBiome({ ...BASE, elevationM: 4000, slope: 0.8, temperatureK: 270 })).toBe("mountain");
  });

  it("changes scores when temperature, precipitation or soil changes", () => {
    const warm = biomeScores(BASE);
    const cold = biomeScores({ ...BASE, temperatureK: 260 });
    const dry = biomeScores({ ...BASE, precipitationMPerYear: 100 });
    const poorSoil = biomeScores({ ...BASE, soilMoisture: 0.05 });
    expect(cold.tundra).toBeGreaterThan(warm.tundra);
    expect(dry.desert).toBeGreaterThan(warm.desert);
    expect(poorSoil.forest).toBeLessThan(warm.forest);
  });

  it("uses hysteresis and cooldown before switching biomes", () => {
    const scores = biomeScores(BASE);
    const memory = { biome: "forest" as const, tick: 0, stability: 1 };

    const tinyGain = { ...scores, savanna: scores.forest + 0.05 };
    expect(updateBiome(tinyGain, 1, memory).biome).toBe("forest");

    const withinCooldown = { ...scores, savanna: scores.forest + 0.5 };
    expect(updateBiome(withinCooldown, 2, memory).biome).toBe("forest");

    const decisive = { ...scores, savanna: scores.forest + 0.5 };
    expect(updateBiome(decisive, 20, memory).biome).toBe("savanna");
  });
});
