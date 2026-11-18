/** E2.1 review — correlazioni originali e detrendizzate preda-predatore. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import { analyzeTrophicCorrelation } from "../tools/e2/correlationReview";

interface PilotPayload {
  schema: string;
  results: RunResult[];
}

describe("E2.1 correlation review", () => {
  it(
    "compares original and detrended correlations from the existing pilot",
    () => {
      const inputPath = resolveOutputPath(process.env.E2_CORRELATION_INPUT);
      const outputPath = resolveOutputPath(process.env.E2_CORRELATION_OUT);
      const maxLag = Number(process.env.E2_CORRELATION_MAX_LAG ?? "5");
      if (!Number.isInteger(maxLag) || maxLag < 0) throw new Error("E2_CORRELATION_MAX_LAG must be non-negative");

      const raw = readFileSync(inputPath, "utf8");
      const payload = JSON.parse(raw) as PilotPayload;
      if (payload.schema !== "evoworld.e2.pilot.v1" || !Array.isArray(payload.results)) {
        throw new Error("E2_CORRELATION_INPUT must be an E2.1 pilot payload");
      }
      const s06 = payload.results.filter((result) => result.scenario === "S06_predator_prey_mixed");
      if (s06.length === 0) throw new Error("E2_CORRELATION_INPUT contains no S06 runs");

      const analysis = analyzeTrophicCorrelation(s06, maxLag);
      const output = {
        schema: "evoworld.e2.correlation-review.v1",
        phase: "E2.1-review-correlation",
        executedAt: new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        input: {
          path: "<E2_CORRELATION_INPUT>",
          sha256: createHash("sha256").update(raw).digest("hex"),
          schema: payload.schema,
          runs: s06.length,
        },
        maxLag,
        analysis,
      };
      writeExperimentOutput(outputPath, output);
      process.stdout.write(
        `E2 correlation review complete: ${s06.length} seeds, spuriousTrendRisk=${analysis.spuriousTrendRiskSeeds}, output=${outputPath}\n`,
      );
    },
    120_000,
  );
});
