import { describe, expect, it } from "vitest";
import { buildRenderFrame } from "../simulation/core/renderFrame";
import { World } from "../simulation/core/world";

const config = { width: 128, height: 128, seed: 11 } as never;

describe("G3 — canale MOR minimo nel RenderFrame", () => {
  it("copia i soli geni morfologici presenti e finiti, senza toccare la biologia", () => {
    const world = new World(config, 60);
    for (let i = 0; i < 10; i++) world.step();
    const frame = buildRenderFrame(world);
    expect(frame.organismsBodyStature).toHaveLength(world.organisms.length);
    expect(frame.organismsMorphologyPresence).toHaveLength(world.organisms.length);

    for (let i = 0; i < world.organisms.length; i++) {
      const ext = world.organisms[i].genome.ext;
      const presence = frame.organismsMorphologyPresence![i];
      for (const [key, bit, value] of [
        ["bodyStature", 1, frame.organismsBodyStature![i]],
        ["furDensity", 2, frame.organismsFurDensity![i]],
        ["dermalArmor", 4, frame.organismsDermalArmor![i]],
      ] as const) {
        const raw = ext?.[key];
        const expected = raw !== undefined && Number.isFinite(raw) ? bit : 0;
        expect(presence & bit).toBe(expected);
        // Il canale è un Float32Array: il confronto corretto è con l'arrotondamento float32.
        if (expected) expect(value).toBe(Math.fround(raw!));
      }
    }
  });

  it("dati corrotti diventano assenti: nessun valore inventato attraversa il worker", () => {
    const world = new World(config, 60);
    for (let i = 0; i < 5; i++) world.step();
    const organism = world.organisms[0];
    organism.genome.ext = { ...(organism.genome.ext ?? {}), bodyStature: Number.NaN };
    const frame = buildRenderFrame(world);
    expect(frame.organismsMorphologyPresence![0] & 1).toBe(0);
    expect(Number.isFinite(frame.organismsBodyStature![0])).toBe(true);
  });
});
