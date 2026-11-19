import { describe, expect, it } from "vitest";
import { analyzePairedResilience } from "../../tools/e2/resilienceReview";
import { makeRun, makeSample } from "./fixtures";

const samples = (values: number[]) =>
  values.map((population, index) => makeSample({ tick: index * 10, population }));

const cull = { atTick: 50, kind: "cull80" as const };

describe("analyzePairedResilience", () => {
  it("pairs S08 with S01 by seed and separates recovery categories", () => {
    const perturbed = [
      makeRun("S08_recovery_after_cull80", 1, samples([100, 100, 100, 100, 100, 100, 40, 80, 95, 100, 100, 100]), { perturbation: cull }),
      makeRun("S08_recovery_after_cull80", 2, samples([100, 100, 100, 100, 100, 100, 40, 55, 65, 60, 45, 35]), { perturbation: cull }),
    ];
    const control = [
      makeRun("S01_stability_baseline", 1, samples([100, 100, 100, 100, 100, 100, 80, 70, 60, 50, 40, 30])),
      makeRun("S01_stability_baseline", 2, samples([100, 100, 100, 100, 100, 100, 80, 70, 60, 50, 40, 30])),
    ];

    const review = analyzePairedResilience(perturbed, control);

    expect(review.perturbationTick).toBe(50);
    expect(review.assessments.map((a) => a.seed)).toEqual([1, 2]);
    expect(review.assessments[0].outcome).toBe("absolute_recovery");
    expect(review.assessments[1].outcome).toBe("control_relative_recovery");
    expect(review.absoluteRecoverySeeds).toBe(1);
    expect(review.controlRelativeRecoverySeeds).toBe(1);
    expect(review.noObservedRecoverySeeds).toBe(0);
    expect(review.gapClosureFraction.n).toBe(2);
    expect(review.note).toContain("non dimostrano");
  });

  it("rejects perturbed runs without a perturbation tick", () => {
    const perturbed = [makeRun("S08_recovery_after_cull80", 1, samples([100, 50, 40, 30, 20, 10]))];
    expect(() => analyzePairedResilience(perturbed, [])).toThrow(/perturbation\.atTick/);
  });
});
