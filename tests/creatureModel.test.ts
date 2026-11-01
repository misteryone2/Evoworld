import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import { computeCreatureAnatomy, type CreatureTraits } from "../lib/creatureAnatomy";
import { buildCreatureModel } from "../lib/creatureModel";

const R = TRAIT_RANGES;
const at = (k: keyof CreatureTraits, t: number) => R[k].min + (R[k].max - R[k].min) * t;
const traits = (o: Partial<Record<keyof CreatureTraits, number>> = {}): CreatureTraits => ({
  speed: at("speed", o.speed ?? 0.5),
  carnivory: at("carnivory", o.carnivory ?? 0),
  vision: at("vision", o.vision ?? 0.5),
  evasion: at("evasion", o.evasion ?? 0),
  huntingSkill: at("huntingSkill", o.huntingSkill ?? 0.5),
});
const names = (g: THREE.Group) => g.children.map((c) => c.name);
const zExtent = (g: THREE.Group) => new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).z;

describe("v1.5.0 — creature 3D model", () => {
  it("a plain herbivore has a body, a head, two eyes and a tail — no jaw, no spikes", () => {
    const { group } = buildCreatureModel(computeCreatureAnatomy(traits()), "#88cc99");
    const n = names(group);
    expect(n.filter((x) => x === "body")).toHaveLength(1);
    expect(n.filter((x) => x === "head")).toHaveLength(1);
    expect(n.filter((x) => x === "eye")).toHaveLength(2);
    expect(n.filter((x) => x === "tail")).toHaveLength(1);
    expect(n).not.toContain("jaw");
    expect(n).not.toContain("spike");
  });

  it("carnivores get a jaw and evasive creatures get spikes", () => {
    const predator = buildCreatureModel(computeCreatureAnatomy(traits({ carnivory: 1 })), "#c88");
    expect(names(predator.group)).toContain("jaw");
    const spiky = buildCreatureModel(computeCreatureAnatomy(traits({ evasion: 1 })), "#8c8");
    const spikes = names(spiky.group).filter((x) => x === "spike");
    expect(spikes.length).toBeGreaterThan(0);
    expect(spikes.length).toBeLessThanOrEqual(3);
  });

  it("a fast creature is longer than a slow one", () => {
    const slow = buildCreatureModel(computeCreatureAnatomy(traits({ speed: 0 })), "#fff");
    const fast = buildCreatureModel(computeCreatureAnatomy(traits({ speed: 1 })), "#fff");
    expect(zExtent(fast.group)).toBeGreaterThan(zExtent(slow.group));
  });

  it("the head is in front of the body and the tail behind it (+Z is forward)", () => {
    const { group } = buildCreatureModel(computeCreatureAnatomy(traits()), "#fff");
    const z = (name: string) => group.children.find((c) => c.name === name)!.position.z;
    expect(z("head")).toBeGreaterThan(z("body"));
    expect(z("tail")).toBeLessThan(z("body"));
  });

  it("stands on the ground: the torso is sunk only slightly (a fifth of its height), so it neither floats nor is buried", () => {
    const anatomy = computeCreatureAnatomy(traits({ carnivory: 1, evasion: 1 }));
    const { group } = buildCreatureModel(anatomy, "#fff");
    const minY = new THREE.Box3().setFromObject(group).min.y;
    expect(minY).toBeLessThanOrEqual(0);
    expect(minY).toBeGreaterThanOrEqual(-anatomy.bodyHalfHeight * 0.25);
  });

  it("dispose() can be called without error", () => {
    const m = buildCreatureModel(computeCreatureAnatomy(traits({ carnivory: 1, evasion: 1 })), "#fff");
    expect(() => m.dispose()).not.toThrow();
  });
});
