/** E2.1 review — recupero assoluto e relativo al controllo appaiato. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import { analyzePairedResilience } from "../tools/e2/resilienceReview";

interface PilotPayload {
  schema: string;
  results: RunResult[];
}

describe("E2.1 resilience review", () => {
  it(
    "reclassifies S08 recovery against the paired S01 trajectory",
    () => {
      const inputPath = resolveOutputPath(process.env.E2_RESILIENCE_INPUT);
      const outputPath = resolveOutputPath(process.env.E2_RESILIENCE_OUT);
      const raw = readFileSync(inputPath, "utf8");
      const payload = JSON.parse(raw) as PilotPayload;
      if (payload.schema !== "evoworld.e2.pilot.v1" || !Array.isArray(payload.results)) {
        throw new Error("E2_RESILIENCE_INPUT must be an E2.1 pilot payload");
      }
      const perturbed = payload.results.filter((result) => result.scenario === "S08_recovery_after_cull80");
      const control = payload.results.filter((result) => result.scenario === "S01_stability_baseline");
      if (perturbed.length === 0 || control.length === 0) {
        throw new Error("E2_RESILIENCE_INPUT must contain both S08 and S01 runs");
      }

      const analysis = analyzePairedResilience(perturbed, control);
      const output = {
        schema: "evoworld.e2.resilience-review.v1",
        phase: "E2.1-review-resilience",
        executedAt: new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        input: {
          path: "<E2_RESILIENCE_INPUT>",
          sha256: createHash("sha256").update(raw).digest("hex"),
          schema: payload.schema,
          perturbedRuns: perturbed.length,
          controlRuns: control.length,
        },
        analysis,
      };
      writeExperimentOutput(outputPath, output);
      process.stdout.write(
        `E2 resilience review complete: ${analysis.assessments.length} pairs, absolute=${analysis.absoluteRecoverySeeds}, relative=${analysis.controlRelativeRecoverySeeds}, partial=${analysis.partialRecoverySeeds}, none=${analysis.noObservedRecoverySeeds}, output=${outputPath}\n`,
      );
    },
    120_000,
  );
});
