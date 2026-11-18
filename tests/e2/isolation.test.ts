import { describe, expect, it } from "vitest";
import {
  buildVariableIsolationScenarios,
  E2_ISOLATION_ARM_IDS,
  foundersPerCell,
  ISOLATION_CONTRASTS,
  ISOLATION_CONTROL_ID,
  ISOLATION_DENSITY_ID,
  ISOLATION_GEOMETRY_ID,
} from "../../tools/e2/isolation";

const scenarios = buildVariableIsolationScenarios({ seeds: [1, 2], ticks: 900, sampleEvery: 10 });
const one = (id: string) => scenarios.filter((spec) => spec.id === id);

describe("buildVariableIsolationScenarios", () => {
  it("builds every arm for every seed", () => {
    expect(scenarios).toHaveLength(E2_ISOLATION_ARM_IDS.length * 2);
    for (const id of E2_ISOLATION_ARM_IDS) expect(one(id)).toHaveLength(2);
  });

  it("isolates geometry while keeping founder density approximately constant", () => {
    const control = one(ISOLATION_CONTROL_ID)[0];
    const geometry = one(ISOLATION_GEOMETRY_ID)[0];

    expect([control.width, control.height, control.population]).toEqual([128, 128, 150]);
    expect([geometry.width, geometry.height, geometry.population]).toEqual([64, 64, 38]);
    const controlDensity = foundersPerCell(control.width, control.height, control.population);
    const geometryDensity = foundersPerCell(geometry.width, geometry.height, geometry.population);
    expect(Math.abs(geometryDensity / controlDensity - 1)).toBeLessThan(0.02);
  });

  it("isolates founder density at fixed geometry", () => {
    const control = one(ISOLATION_CONTROL_ID)[0];
    const density = one(ISOLATION_DENSITY_ID)[0];

    expect([density.width, density.height]).toEqual([control.width, control.height]);
    expect(density.population).toBe(220);
    expect(density.setup).toBe(control.setup);
  });

  it("keeps habitat controls at fixed geometry and population", () => {
    const resourceIds = E2_ISOLATION_ARM_IDS.filter((id) => id.startsWith("S"));
    expect(resourceIds).toHaveLength(4);
    for (const id of resourceIds) {
      const spec = one(id)[0];
      expect([spec.width, spec.height, spec.population]).toEqual([128, 128, 150]);
      expect(spec.setup).not.toBe("baseline");
    }
  });
});

describe("ISOLATION_CONTRASTS", () => {
  it("declares one independent variable per paired comparison", () => {
    expect(ISOLATION_CONTRASTS).toHaveLength(7);
    expect(new Set(ISOLATION_CONTRASTS.map((c) => c.variable))).toEqual(
      new Set(["geometry", "density", "combined", "resource", "position"]),
    );
    expect(ISOLATION_CONTRASTS.every((c) => c.causal === false)).toBe(true);
  });
});
