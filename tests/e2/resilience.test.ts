import { describe, expect, it } from "vitest";
import {
  assessPairedRecovery,
  DEFAULT_RECOVERY_THRESHOLDS,
} from "../../tools/e2/resilience";
import type { Point } from "../../tools/e2/timeseries";

const points = (pairs: Array<[number, number]>): Point[] =>
  pairs.map(([tick, value]) => ({ tick, value }));

const thresholds = {
  ...DEFAULT_RECOVERY_THRESHOLDS,
  minStablePoints: 3,
};

const before = [0, 10, 20, 30, 40].map((tick): [number, number] => [tick, 100]);

describe("assessPairedRecovery", () => {
  it("classifies absolute recovery even when the control keeps declining", () => {
    const perturbed = points([
      ...before,
      [50, 40], [60, 80], [70, 95], [80, 100], [90, 100], [100, 100],
    ]);
    const control = points([
      ...before,
      [50, 80], [60, 70], [70, 60], [80, 50], [90, 40], [100, 30],
    ]);

    const result = assessPairedRecovery(perturbed, control, 50, 1, thresholds);

    expect(result.absoluteRecovered).toBe(true);
    expect(result.outcome).toBe("absolute_recovery");
    expect(result.absoluteBaseline).toBe(100);
  });

  it("classifies control-relative recovery without absolute recovery", () => {
    const perturbed = points([
      ...before,
      [50, 40], [60, 55], [70, 65], [80, 60], [90, 45], [100, 35],
    ]);
    const control = points([
      ...before,
      [50, 80], [60, 70], [70, 60], [80, 50], [90, 40], [100, 30],
    ]);

    const result = assessPairedRecovery(perturbed, control, 50, 2, thresholds);

    expect(result.absoluteRecovered).toBe(false);
    expect(result.controlRelativeRecovered).toBe(true);
    expect(result.outcome).toBe("control_relative_recovery");
    expect(result.preShockGap).toBe(0);
  });

  it("classifies partial gap closure when no recovery criterion is met", () => {
    const perturbed = points([
      ...before,
      [50, 20], [60, 25], [70, 30], [80, 25], [90, 40], [100, 52],
    ]);
    const control = points([
      ...before,
      [50, 80], [60, 70], [70, 60], [80, 50], [90, 40], [100, 30],
    ]);

    const result = assessPairedRecovery(perturbed, control, 50, 3, thresholds);

    expect(result.absoluteRecovered).toBe(false);
    expect(result.controlRelativeRecovered).toBe(false);
    expect(result.partialRecoveryObserved).toBe(true);
    expect(result.outcome).toBe("partial_recovery");
    expect(result.gapClosureFraction as number).toBeGreaterThanOrEqual(0.5);
  });

  it("reports no observed recovery when the gap never closes", () => {
    const perturbed = points([...before, [50, 40], [60, 40], [70, 40], [80, 40], [90, 40], [100, 40]]);
    const control = points([...before, [50, 100], [60, 100], [70, 100], [80, 100], [90, 100], [100, 100]]);

    const result = assessPairedRecovery(perturbed, control, 50, 4, thresholds);

    expect(result.absoluteRecovered).toBe(false);
    expect(result.controlRelativeRecovered).toBe(false);
    expect(result.partialRecoveryObserved).toBe(false);
    expect(result.gapClosureFraction).toBe(0);
    expect(result.outcome).toBe("no_observed_recovery");
  });
});
