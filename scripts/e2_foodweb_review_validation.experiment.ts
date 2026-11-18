/** E2.2 review — validazione indipendente delle correzioni statistiche. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import { stableStringify } from "../tools/e1/dataset";
import type { RunResult } from "../tools/e1/runner";
import {
  analyzePairCorrelation,
  assessCarnivoreDependence,
  buildFoodWebReport,
  FOOD_WEB_PAIRS,
  type FoodWebProtocol,
  type FoodWebScenarioReport,
} from "../tools/e2/foodWebReport";
import { readDataset } from "../tools/e2/dataset";
import {
  DEFAULT_SURROGATE_CONFIG,
  iaaftSurrogates,
  mulberry32,
  runSurrogateNullTest,
  type SurrogateConfig,
} from "../tools/e2/surrogateInference";
import {
  crossCorrelation,
  detrendLinear,
  lag1Autocorrelation,
  linearTrend,
  type Point,
} from "../tools/e2/timeseries";
import { makeRun, makeSample } from "../tests/e2/fixtures";

const BLOCKS = ["main", "seed", "duration", "sampling"] as const;
type BlockName = (typeof BLOCKS)[number];

interface ReviewBlock {
  label: string;
  review: { sourceBlockSha256: string; sourceLabel: string; surrogateConfig: SurrogateConfig };
  scientificReport: { byScenario: FoodWebScenarioReport[] };
  results: unknown[];
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const hashStable = (value: unknown): string => sha256(stableStringify(value));

const readJson = <T>(value: string | undefined, name: string): T => {
  if (!value) throw new Error(`${name} is required`);
  return JSON.parse(readFileSync(resolveOutputPath(value), "utf8")) as T;
};

const pulseRun = (seed: number, scenario: string, shift: number): RunResult => {
  const pulse = [10, 20, 30, 40, 50, 40, 30, 20, 10, 5, 3, 2];
  const samples = pulse.map((herbivoreCount, index) => {
    const carnivoreCount = index - shift >= 0 ? pulse[index - shift] : 3;
    const population = herbivoreCount + carnivoreCount;
    return makeSample({
      tick: index * 10,
      population,
      eventDenominator: population,
      organismsSampled: population,
      herbivoreFraction: herbivoreCount / population,
      carnivoreFraction: carnivoreCount / population,
      predationKills: index % 3,
      cumulativePredationKills: index * 2,
      occupiedVegetation: 0.5 - index * 0.01,
    });
  });
  return makeRun(scenario, seed, samples);
};

/** Segnale stazionario non periodico; b segue a di `shift` campioni, con segno scelto. */
const waveRun = (seed: number, scenario: string, sign: 1 | -1, shift = 2, length = 70): RunResult => {
  const wave = (index: number): number =>
    12 * Math.sin((index + seed) * 0.31) + 6 * Math.sin((index + seed) * 0.87);
  const samples = Array.from({ length }, (_, index) => {
    const herbivore = 50 + wave(index);
    const carnivore = 50 + sign * wave(index - shift) + 1.5 * Math.cos((index + seed * 3) * 1.7);
    const population = herbivore + carnivore;
    return makeSample({
      tick: index * 10,
      population,
      eventDenominator: population,
      organismsSampled: population,
      herbivoreFraction: herbivore / population,
      carnivoreFraction: carnivore / population,
      predationKills: index % 2,
      cumulativePredationKills: index,
      occupiedVegetation: 0.5 + 0.01 * Math.sin(index * 0.2),
    });
  });
  return makeRun(scenario, seed, samples);
};

const syntheticConfig: SurrogateConfig = {
  ...DEFAULT_SURROGATE_CONFIG,
  surrogates: 99,
  iterations: 12,
  seed: 0x5eed1234,
  minOverlappingObservations: 18,
  pairIds: ["herbivore_carnivore"],
};

const noSurrogate: Partial<SurrogateConfig> = {
  enabled: false,
  minOverlappingObservations: 8,
};

const ar1Values = (seed: number, length: number, phi = 0.65): number[] => {
  const rng = mulberry32(seed >>> 0);
  let value = 0;
  return Array.from({ length }, () => {
    const shock = rng() * 2 - 1 + (rng() < 0.08 ? 2.5 : 0);
    value = phi * value + shock;
    return value;
  });
};

const pointsFrom = (values: number[], start = 0, step = 10): Point[] =>
  values.map((value, index) => ({ tick: start + index * step, value }));

const pairSummary = (report: FoodWebScenarioReport | undefined, pairId: string) =>
  report?.correlations.find((entry) => entry.pairId === pairId);

const s06Report = (block: ReviewBlock): FoodWebScenarioReport | undefined =>
  block.scientificReport.byScenario.find((scenario) => scenario.scenario === "S06_predator_prey_mixed");

describe("E2.2 review validation", () => {
  it(
    "validates sign handling, surrogate properties, null calibration and corrected real reports",
    () => {
      const rawText = {} as Record<BlockName, string>;
      const rawResults = {} as Record<BlockName, unknown[]>;
      const reviewBlocks = {} as Record<BlockName, ReviewBlock>;
      for (const name of BLOCKS) {
        const upper = name.toUpperCase();
        const rawPath = process.env[`E2_FOODWEB_VALIDATION_RAW_${upper}`];
        if (!rawPath) throw new Error(`E2_FOODWEB_VALIDATION_RAW_${upper} is required`);
        rawText[name] = readFileSync(resolveOutputPath(rawPath), "utf8");
        const rawPayload = JSON.parse(rawText[name]) as { results: unknown[] };
        rawResults[name] = rawPayload.results;
        reviewBlocks[name] = readJson<ReviewBlock>(process.env[`E2_FOODWEB_VALIDATION_REVIEW_${upper}`], `E2_FOODWEB_VALIDATION_REVIEW_${upper}`);
      }

      // 1. I risultati grezzi usati dalle analisi corrette sono byte-identici agli originali.
      const provenance = BLOCKS.map((name) => {
        const block = reviewBlocks[name];
        const fileHash = sha256(rawText[name]);
        const resultsHash = hashStable(rawResults[name]);
        expect(fileHash).toBe(block.review.sourceBlockSha256);
        expect(hashStable(block.results)).toBe(resultsHash);
        return {
          block: name,
          sourceBlockSha256: fileHash,
          resultsSha256: resultsHash,
          unchanged: true,
        };
      });

      // 2. L'archivio originale resta intatto e verificabile.
      const originalManifestPath = resolveOutputPath(
        process.env.E2_FOODWEB_VALIDATION_ORIGINAL_MANIFEST
        ?? "docs/research/e2/datasets/e2.2-foodweb.manifest.json",
      );
      const originalArchivePath = resolveOutputPath(
        process.env.E2_FOODWEB_VALIDATION_ORIGINAL_ARCHIVE
        ?? "docs/research/e2/datasets/e2.2-foodweb.json.gz",
      );
      const original = readDataset(originalArchivePath, originalManifestPath);
      const expectedOriginal = {
        payloadSha256: "755d2a4f778ba8c90243daee3dd01e63530380567ac36875d8ecc281dc5e772d",
        archiveSha256: "d407c8d3a906ff1d0909681f95a9f441173f502eb61a3b39970a82ef17f7cb79",
      };
      expect(original.payloadSha256).toBe(expectedOriginal.payloadSha256);
      expect(original.manifest?.archiveSha256).toBe(expectedOriginal.archiveSha256);

      // 3. Sequenzialità positiva sintetica: richiede il test surrogato, non la concordanza.
      const positiveRuns = Array.from({ length: 12 }, (_, index) =>
        waveRun(index + 1, "S06_predator_prey_mixed", 1));
      const positive = analyzePairCorrelation(positiveRuns, FOOD_WEB_PAIRS[0], 60, syntheticConfig);
      const positiveAssessment = assessCarnivoreDependence(positive, "S06_predator_prey_mixed");
      expect(positive.strongPositiveLagSeeds).toBe(12);
      expect(positive.surrogate?.significant).toBe(true);
      expect(positiveAssessment.sequencing.verdict).toBe("EVIDENZA_SEQUENZIALITA_POSITIVA");

      // 4. Una forte correlazione negativa non diventa mai evidenza positiva.
      const negativeRuns = Array.from({ length: 12 }, (_, index) =>
        waveRun(index + 1, "S06_predator_prey_mixed", -1));
      const negative = analyzePairCorrelation(negativeRuns, FOOD_WEB_PAIRS[0], 60, syntheticConfig);
      const negativeAssessment = assessCarnivoreDependence(negative, "S06_predator_prey_mixed");
      expect(negative.detrendedPeakCorrelation.mean).toBeLessThan(-0.5);
      expect(negative.negativeCorrelationPositiveLagSeeds).toBeGreaterThanOrEqual(10);
      expect(negative.strongPositiveLagSeeds).toBe(0);
      expect(negativeAssessment.sequencing.direction).toBe("NEGATIVA");
      expect(negativeAssessment.sequencing.verdict).toBe("EVIDENZA_SEQUENZIALITA_NEGATIVA");
      expect(negativeAssessment.sequencing.verdict).not.toContain("POSITIVA");

      // 5. Serie sincrone: nessuna sequenzialità senza lag e senza test.
      const synchronousRuns = Array.from({ length: 12 }, (_, index) =>
        pulseRun(index + 1, "S06_predator_prey_mixed", 0));
      const synchronous = analyzePairCorrelation(synchronousRuns, FOOD_WEB_PAIRS[0], 20, noSurrogate);
      const synchronousAssessment = assessCarnivoreDependence(synchronous, "S06_predator_prey_mixed");
      expect(synchronous.zeroLagSeeds).toBe(12);
      expect(synchronousAssessment.sequencing.verdict).toBe("NON_DIMOSTRATO");
      expect(synchronousAssessment.statistical.classification).toBe("NON_VALUTABILE");

      // 6. Diagnostica esplicita della ricerca del massimo sui lag.
      const diagnosticsA = pointsFrom(Array.from({ length: 271 }, (_, index) =>
        100 + 10 * Math.sin(index * 0.11)));
      const diagnosticsB = pointsFrom(Array.from({ length: 271 }, (_, index) =>
        90 + 8 * Math.cos(index * 0.09)));
      const lagCurve = crossCorrelation(diagnosticsA, diagnosticsB, 200, 30);
      expect(lagCurve.lagSearch.lagsAttempted).toBe(401);
      expect(lagCurve.lagSearch.lagsOnGrid).toBe(41);
      expect(lagCurve.lagSearch.lagsWithoutPairs).toBe(360);
      expect(lagCurve.lagSearch.lagsAccepted).toBe(41);
      expect(lagCurve.lagSearch.minimumPairsOnGrid).toBe(251);
      expect(lagCurve.lagSearch.extremeLagPairs.lossFraction).toBeCloseTo(1 - 251 / 271, 5);

      // 7. IAAFT conserva la distribuzione, l'autocorrelazione e non reintroduce trend.
      const trendedValues = ar1Values(0xa1a1, 160, 0.72).map((value, index) => value + 0.02 * index);
      const residualValues = detrendLinear(pointsFrom(trendedValues)).residuals.map((point) => point.value);
      const propertySurrogates = iaaftSurrogates(residualValues, 30, mulberry32(0x1234), 20);
      const sortedReference = [...residualValues].sort((a, b) => a - b);
      const distributionError = Math.max(...propertySurrogates.map((surrogate) => {
        const sorted = [...surrogate].sort((a, b) => a - b);
        return Math.max(...sorted.map((value, index) => Math.abs(value - sortedReference[index])));
      }));
      const autocorrObserved = lag1Autocorrelation(residualValues) ?? 0;
      const autocorrMean = propertySurrogates.reduce(
        (sum, surrogate) => sum + (lag1Autocorrelation(surrogate) ?? 0), 0,
      ) / propertySurrogates.length;
      const surrogateTrendMax = Math.max(...propertySurrogates.map((surrogate) =>
        linearTrend(pointsFrom(surrogate, 0, 1)).r2 ?? 1));
      expect(distributionError).toBeLessThan(1e-9);
      expect(Math.abs(autocorrObserved - autocorrMean)).toBeLessThan(0.2);
      expect(surrogateTrendMax).toBeLessThan(0.25);

      // 8. Calibrazione del nullo: serie indipendenti non devono produrre falsi positivi sistematici.
      const nullPValues: number[] = [];
      for (let seed = 1; seed <= 120; seed++) {
        const test = runSurrogateNullTest(
          "calibration",
          seed,
          pointsFrom(ar1Values(seed * 31, 100)),
          pointsFrom(ar1Values(seed * 97 + 500, 100)),
          20,
          { ...DEFAULT_SURROGATE_CONFIG, surrogates: 99, iterations: 10, minOverlappingObservations: 30 },
        );
        nullPValues.push(test.pValue);
      }
      const falsePositiveRate = nullPValues.filter((value) => value < 0.05).length / nullPValues.length;
      const meanNullP = nullPValues.reduce((sum, value) => sum + value, 0) / nullPValues.length;
      expect(falsePositiveRate).toBeLessThanOrEqual(0.15);
      expect(meanNullP).toBeGreaterThan(0.3);
      expect(meanNullP).toBeLessThan(0.7);

      // 9. I report corretti usano solo la statistica significante per EVIDENZA.
      const realSummaries = BLOCKS.map((name) => {
        const block = reviewBlocks[name];
        const s06 = s06Report(block);
        const herbivoreCarnivore = pairSummary(s06, "herbivore_carnivore");
        const herbivoreKills = pairSummary(s06, "herbivore_kills");
        const killsAssessment = s06?.sequencingByPair["herbivore_kills"] ?? null;
        for (const scenario of block.scientificReport.byScenario) {
          for (const assessment of Object.values(scenario.sequencingByPair ?? {})) {
            if (assessment.sequencing.verdict.startsWith("EVIDENZA")) {
              expect(assessment.statistical.classification).toBe("SIGNIFICATIVO");
              expect(["POSITIVA", "NEGATIVA"]).toContain(assessment.sequencing.direction);
            }
            if (assessment.sequencing.direction === "NEGATIVA") {
              expect(assessment.sequencing.verdict).not.toContain("POSITIVA");
            }
            expect(assessment.causality.classification).toBe("NON_IDENTIFICABILE");
          }
        }
        const short = (
          pair: typeof herbivoreCarnivore,
          assessment: FoodWebScenarioReport["sequencingByPair"][string] | null,
        ) => ({
          runs: pair?.runs ?? 0,
          meanPeakLag: pair?.detrendedPeakLag.mean ?? null,
          meanPeakCorrelation: pair?.detrendedPeakCorrelation.mean ?? null,
          positiveCorrelationPositiveLagSeeds: pair?.positiveCorrelationPositiveLagSeeds ?? 0,
          negativeCorrelationPositiveLagSeeds: pair?.negativeCorrelationPositiveLagSeeds ?? 0,
          strongPositiveLagSeeds: pair?.strongPositiveLagSeeds ?? 0,
          lagsAttempted: pair?.lagsAttempted ?? 0,
          lagsAccepted: pair?.lagsAcceptedPerRun.mean ?? null,
          minimumOverlappingObservations: pair?.minimumOverlappingObservations ?? 0,
          fisherP: pair?.surrogate?.fisherP ?? null,
          verdict: assessment?.sequencing.verdict ?? null,
          statistical: assessment?.statistical.classification ?? null,
        });
        return {
          block: name,
          label: block.label,
          herbivoreCarnivore: short(herbivoreCarnivore, s06?.dependence ?? null),
          herbivoreKills: short(herbivoreKills, killsAssessment),
        };
      });

      // 10. Il protocollo del report è quello dichiarato, non un default implicito.
      for (const name of BLOCKS) {
        const config = reviewBlocks[name].review.surrogateConfig;
        expect(config.enabled).toBe(true);
        expect(config.surrogates).toBe(199);
        expect(config.iterations).toBe(12);
        expect(config.alpha).toBe(0.05);
        expect(config.minOverlappingObservations).toBe(30);
      }

      const summary = {
        schema: "evoworld.e2.foodweb-review-validation.v1",
        executedAt: process.env.E2_FOODWEB_VALIDATION_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        checks: {
          rawBlocksUnchanged: provenance,
          originalDataset: {
            payloadSha256: original.payloadSha256,
            archiveSha256: original.manifest?.archiveSha256 ?? null,
            unchanged: true,
          },
          synthetic: {
            positive: {
              verdict: positiveAssessment.sequencing.verdict,
              fisherP: positive.surrogate?.fisherP,
              strongPositiveLagSeeds: positive.strongPositiveLagSeeds,
            },
            negative: {
              verdict: negativeAssessment.sequencing.verdict,
              fisherP: negative.surrogate?.fisherP,
              strongPositiveLagSeeds: negative.strongPositiveLagSeeds,
              negativeCorrelationPositiveLagSeeds: negative.negativeCorrelationPositiveLagSeeds,
            },
            synchronous: {
              verdict: synchronousAssessment.sequencing.verdict,
              statistical: synchronousAssessment.statistical.classification,
              zeroLagSeeds: synchronous.zeroLagSeeds,
            },
          },
          lagSearch: {
            lagsAttempted: lagCurve.lagSearch.lagsAttempted,
            lagsOnGrid: lagCurve.lagSearch.lagsOnGrid,
            lagsWithoutPairs: lagCurve.lagSearch.lagsWithoutPairs,
            lagsAccepted: lagCurve.lagSearch.lagsAccepted,
            minimumPairsOnGrid: lagCurve.lagSearch.minimumPairsOnGrid,
            extremeLagPairLossFraction: lagCurve.lagSearch.extremeLagPairs.lossFraction,
          },
          iaaft: {
            distributionError,
            observedLag1Autocorrelation: autocorrObserved,
            surrogateMeanLag1Autocorrelation: autocorrMean,
            autocorrelationAbsoluteError: Math.abs(autocorrObserved - autocorrMean),
            surrogateResidualTrendMax: surrogateTrendMax,
          },
          nullCalibration: {
            tests: nullPValues.length,
            surrogatesPerTest: 99,
            falsePositiveRate,
            meanPValue: meanNullP,
          },
          realReports: realSummaries,
        },
        note: "Il test non usa tick come repliche indipendenti; la direzione è separata dal segno di r e del lag; la causalità resta NON_IDENTIFICABILE.",
      };
      const outputPath = resolveOutputPath(process.env.E2_FOODWEB_VALIDATION_OUT);
      writeExperimentOutput(outputPath, summary);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      process.stdout.write(`E2.2 review validation complete: output=${outputPath}\n`);
    },
    600_000,
  );
});
