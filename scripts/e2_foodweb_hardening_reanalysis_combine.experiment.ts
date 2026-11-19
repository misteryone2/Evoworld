/** E2.2.1 — combina i blocchi rianalizzati e applica la correzione multipla pre-dichiarata. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import type { FoodWebReport, SequencingVerdict } from "../tools/e2/foodWebReport";
import {
  hardenFoodWebReports,
  QA_ACCEPTANCE,
  type HardeningAssessment,
} from "../tools/e2/inferenceHardening";

const BLOCKS = ["main", "seed", "duration", "sampling"] as const;
type Block = (typeof BLOCKS)[number];

interface BlockArtifact {
  block: Block;
  label: string;
  executedAt: string;
  runtime: { node: string; v8: string };
  env: unknown;
  protocol: unknown;
  scientificReport: FoodWebReport;
  provenance: Record<string, unknown>;
}

const readBlock = (block: Block): { artifact: BlockArtifact; sha256: string } => {
  const value = process.env[`E2_HARDENING_COMBINE_${block.toUpperCase()}`];
  if (!value) throw new Error(`E2_HARDENING_COMBINE_${block.toUpperCase()} is required`);
  const text = readFileSync(resolveOutputPath(value), "utf8");
  const artifact = JSON.parse(text) as BlockArtifact;
  if (artifact.block !== block || !artifact.scientificReport?.byScenario) {
    throw new Error(`invalid hardened block artifact: ${block}`);
  }
  return { artifact, sha256: createHash("sha256").update(text).digest("hex") };
};

interface VerdictChange {
  block: Block;
  scenario: string;
  pairId: string;
  prior: SequencingVerdict | null;
  hardenedBeforeAdjustment: SequencingVerdict | null;
  final: SequencingVerdict | null;
  changedFromPrior: boolean;
  lostSignificance: boolean;
}

describe("E2.2.1 hardened reanalysis combine", () => {
  it(
    "applies pre-declared Holm/BH families and records every verdict transition",
    () => {
      const loaded = BLOCKS.map(readBlock);
      const before = new Map<string, SequencingVerdict | null>();
      const prior = new Map<string, SequencingVerdict | null>();
      for (const { artifact } of loaded) {
        for (const scenario of artifact.scientificReport.byScenario) {
          for (const [pairId, assessment] of Object.entries(scenario.sequencingByPair ?? {})) {
            const key = `${artifact.block}|${scenario.scenario}|${pairId}`;
            before.set(key, assessment.sequencing.verdict);
            const statistical = assessment.statistical as typeof assessment.statistical & {
              verdictBefore?: SequencingVerdict | null;
            };
            prior.set(key, statistical.verdictBefore ?? null);
          }
        }
      }

      const hardened = hardenFoodWebReports(loaded.map(({ artifact }) => ({
        block: artifact.block,
        report: artifact.scientificReport,
      })));
      const changes: VerdictChange[] = hardened.summary.assessments.map((assessment: HardeningAssessment) => {
        const priorVerdict = prior.get(assessment.id) ?? null;
        const beforeVerdict = before.get(assessment.id) ?? null;
        return {
          block: assessment.block as Block,
          scenario: assessment.scenario,
          pairId: assessment.pairId,
          prior: priorVerdict,
          hardenedBeforeAdjustment: beforeVerdict,
          final: assessment.verdictAfter,
          changedFromPrior: priorVerdict !== null && priorVerdict !== assessment.verdictAfter,
          lostSignificance: Boolean(
            (priorVerdict?.startsWith("EVIDENZA") || beforeVerdict?.startsWith("EVIDENZA"))
            && !assessment.verdictAfter?.startsWith("EVIDENZA"),
          ),
        };
      });

      const finalCounts: Record<string, number> = {};
      for (const row of changes) finalCounts[row.final ?? "MISSING"] = (finalCounts[row.final ?? "MISSING"] ?? 0) + 1;
      const output = {
        schema: "evoworld.e2.hardening-reanalysis.v1",
        executedAt: process.env.E2_HARDENING_COMBINE_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        sources: loaded.map(({ artifact, sha256 }) => ({
          block: artifact.block,
          artifactSha256: sha256,
          rawBlockSha256: artifact.provenance.rawBlockSha256,
          executedAt: artifact.executedAt,
          results: artifact.provenance.rawBlockResults,
        })),
        qualityGate: QA_ACCEPTANCE,
        families: hardened.summary.families,
        verdictChanges: changes,
        summary: {
          assessments: changes.length,
          changedFromPrior: changes.filter((row) => row.changedFromPrior).length,
          lostSignificance: changes.filter((row) => row.lostSignificance).length,
          nonEvaluable: hardened.summary.nonEvaluableCount,
          finalCounts,
          note: "I blocchi riutilizzano le stesse 120 corse e non sono repliche indipendenti: Holm FWER sulla famiglia primaria, BH FDR con sensibilità BY sulla famiglia esplorativa. La significatività non implica causalità.",
        },
        blocks: loaded.map(({ artifact }, index) => ({
          block: artifact.block,
          label: artifact.label,
          env: artifact.env,
          protocol: artifact.protocol,
          provenance: artifact.provenance,
          scientificReport: hardened.reports[index],
        })),
      };
      const outputPath = resolveOutputPath(process.env.E2_HARDENING_COMBINE_OUT);
      writeExperimentOutput(outputPath, output);
      process.stdout.write(`E2.2.1 hardened combine: ${changes.length} assessments, output=${outputPath}\n`);
      process.stdout.write(`${JSON.stringify(output.summary, null, 2)}\n`);
    },
    1_800_000,
  );
});
