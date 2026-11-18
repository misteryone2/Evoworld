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
import { exactAmplitudeSpectrum } from "../tools/e2/fourier";
import {
  combineSurrogatePValues,
  DEFAULT_SURROGATE_CONFIG,
  IAAFT_AMPLITUDE_TOLERANCE,
  iaaftSurrogatesDetailed,
  mulberry32,
  runSurrogateNullTest,
  type SurrogateConfig,
} from "../tools/e2/surrogateInference";
import { crossCorrelation, type Point } from "../tools/e2/timeseries";
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

const relativeSpectralError = (reference: number[], candidate: number[]): number => {
  const target = exactAmplitudeSpectrum(reference);
  const observed = exactAmplitudeSpectrum(candidate);
  const energy = target.reduce((sum, value) => sum + value * value, 0);
  if (energy === 0) return 0;
  const error = observed.reduce((sum, value, index) => sum + (value - target[index]) ** 2, 0);
  return Math.sqrt(error / energy);
};

const autocorrelation = (values: number[], lag: number): number => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centred = values.map((value) => value - mean);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index + lag < values.length; index++) {
    numerator += centred[index] * centred[index + lag];
    denominator += centred[index] ** 2 + centred[index + lag] ** 2;
  }
  return denominator === 0 ? 0 : (2 * numerator) / denominator;
};

const sortedDeviation = (reference: number[], candidate: number[]): number => {
  const a = [...reference].sort((x, y) => x - y);
  const b = [...candidate].sort((x, y) => x - y);
  return a.reduce((maximum, value, index) =>
    Math.max(maximum, Math.abs(value - b[index])), 0);
};

/** b riceve una copia ritardata e attenuata di a, oltre al proprio rumore AR(1). */
const laggedAr1Values = (
  seed: number,
  length: number,
  phi: number,
  lag: number,
  strength: number,
): { a: number[]; b: number[] } => {
  const rngA = mulberry32(seed >>> 0);
  const rngB = mulberry32((seed + 0x9e3779b9) >>> 0);
  const a: number[] = [];
  const b: number[] = [];
  for (let index = 0; index < length; index++) {
    a.push(phi * (a[index - 1] ?? 0) + rngA() * 2 - 1);
    const own = phi * (b[index - 1] ?? 0) + rngB() * 2 - 1;
    b.push(own + strength * (index - lag >= 0 ? a[index - lag] : 0));
  }
  return { a, b };
};

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

      // 7. Proprietà IAAFT a tutte le lunghezze obbligatorie, con errore spettrale esplicito.
      const requiredLengths = [100, 160, 271, 256, 512];
      const autocorrelationLags = [1, 2, 3, 5];
      const propertySweep = requiredLengths.map((length) => {
        const values = ar1Values(0xa1a1 + length, length, 0.72);
        const detailed = iaaftSurrogatesDetailed(values, 12, mulberry32(0x1234 + length), 24);
        const spectralErrors = detailed.surrogates.map((surrogate) =>
          relativeSpectralError(values, surrogate));
        const distributionErrors = detailed.surrogates.map((surrogate) =>
          sortedDeviation(values, surrogate));
        const autocorrelationErrors = autocorrelationLags.map((lag) => {
          const observed = autocorrelation(values, lag);
          const mean = detailed.surrogates.reduce((sum, surrogate) =>
            sum + autocorrelation(surrogate, lag), 0) / detailed.surrogates.length;
          return { lag, observed, surrogateMean: mean, absoluteError: Math.abs(observed - mean) };
        });
        const finite = detailed.surrogates.every((surrogate) =>
          surrogate.length === length && surrogate.every(Number.isFinite));
        const repeated = iaaftSurrogatesDetailed(values, 12, mulberry32(0x1234 + length), 24);
        const deterministic = JSON.stringify(repeated.surrogates) === JSON.stringify(detailed.surrogates);

        expect(finite).toBe(true);
        expect(Math.max(...distributionErrors)).toBeLessThan(1e-9);
        expect(Math.max(...spectralErrors)).toBeLessThan(0.05);
        expect(Math.max(...autocorrelationErrors.map((entry) => entry.absoluteError))).toBeLessThan(0.2);
        expect(deterministic).toBe(true);
        return {
          length,
          surrogates: detailed.surrogates.length,
          finite,
          distributionErrorMax: Math.max(...distributionErrors),
          spectralErrorMax: Math.max(...spectralErrors),
          spectralErrorMean: spectralErrors.reduce((sum, value) => sum + value, 0) / spectralErrors.length,
          autocorr: autocorrelationErrors,
          deterministic,
          convergence: detailed.convergence,
        };
      });

      // 8. Serie costanti, quasi costanti e ripetute: stessa lunghezza e distribuzione esatta.
      const degenerateSeries = {
        constant: Array.from({ length: 160 }, () => 7),
        nearConstant: Array.from({ length: 160 }, (_, index) => 7 + (index % 2) * 1e-9),
        repeated: Array.from({ length: 271 }, (_, index) => [0, 0, 1, 1, 2, 2][index % 6]),
      };
      const degenerateValidation = Object.fromEntries(Object.entries(degenerateSeries).map(([label, values]) => {
        const detailed = iaaftSurrogatesDetailed(values, 4, mulberry32(0xabcd), 12);
        const distributionErrorMax = Math.max(...detailed.surrogates.map((surrogate) =>
          sortedDeviation(values, surrogate)));
        const finite = detailed.surrogates.every((surrogate) =>
          surrogate.length === values.length && surrogate.every(Number.isFinite));
        expect(finite).toBe(true);
        expect(distributionErrorMax).toBeLessThan(1e-9);
        return [label, {
          length: values.length,
          surrogates: detailed.surrogates.length,
          finite,
          distributionErrorMax,
          spectralErrorMax: Math.max(...detailed.surrogates.map((surrogate) =>
            relativeSpectralError(values, surrogate))),
        }];
      }));

      // 9. Calibrazione del nullo: intensità AR(1), lunghezze 100/160/271 e controllo FPR.
      const ar1Intensities = [0, 0.25, 0.65, 0.9];
      const calibrationLengths = [100, 160, 271];
      const ar1Calibration = ar1Intensities.flatMap((phi) => calibrationLengths.map((length) => {
        const pValues: number[] = [];
        for (let seed = 1; seed <= 32; seed++) {
          const test = runSurrogateNullTest(
            "calibration",
            seed,
            pointsFrom(ar1Values(seed * 31 + Math.round(phi * 100), length, phi)),
            pointsFrom(ar1Values(seed * 97 + 500 + Math.round(phi * 100), length, phi)),
            20,
            { ...DEFAULT_SURROGATE_CONFIG, surrogates: 49, iterations: 12, minOverlappingObservations: 30 },
          );
          pValues.push(test.pValue);
        }
        const falsePositive = pValues.filter((value) => value < 0.05).length / pValues.length;
        const meanP = pValues.reduce((sum, value) => sum + value, 0) / pValues.length;
        expect(falsePositive).toBeLessThanOrEqual(0.15);
        expect(meanP).toBeGreaterThan(0.25);
        expect(meanP).toBeLessThan(0.75);
        return {
          phi,
          length,
          tests: pValues.length,
          surrogatesPerTest: 49,
          falsePositiveRate: falsePositive,
          meanPValue: meanP,
        };
      }));
      const falsePositiveRate = ar1Calibration.reduce((sum, entry) => sum + entry.falsePositiveRate, 0)
        / ar1Calibration.length;
      const meanNullP = ar1Calibration.reduce((sum, entry) => sum + entry.meanPValue, 0)
        / ar1Calibration.length;

      // 10. Serie correlate con ritardo noto: il nullo deve rilevare la sequenzialità positiva.
      const knownLagValidation = [100, 271].flatMap((length) => [0.3, 0.7].map((phi) => {
        const pValues: number[] = [];
        let positiveLags = 0;
        for (let seed = 1; seed <= 8; seed++) {
          const { a, b } = laggedAr1Values(seed * 17 + Math.round(phi * 100), length, phi, 3, 1.1);
          const test = runSurrogateNullTest(
            "known-lag",
            seed,
            pointsFrom(a),
            pointsFrom(b),
            30,
            { ...DEFAULT_SURROGATE_CONFIG, surrogates: 49, iterations: 12, minOverlappingObservations: 30 },
          );
          pValues.push(test.pValue);
          if (test.observedLag !== null && test.observedLag > 0
            && (test.observedCorrelation ?? 0) > 0) positiveLags++;
        }
        const combined = combineSurrogatePValues(pValues);
        expect(positiveLags).toBeGreaterThanOrEqual(7);
        expect(combined.significant).toBe(true);
        return { length, phi, lag: 3, tests: pValues.length, positiveLags, pValues, combined };
      }));

      // 11. Sensibilità al numero di iterazioni: l'errore spettrale deve migliorare all'aumentare del budget.
      const iterationBudgets = [1, 2, 4, 8, 12, 24];
      const iterationSensitivity = iterationBudgets.map((iterations) => {
        const values = ar1Values(0x1aa1, 271, 0.7);
        const detailed = iaaftSurrogatesDetailed(values, 8, mulberry32(0x77aa), iterations);
        const spectralErrors = detailed.surrogates.map((surrogate) => relativeSpectralError(values, surrogate));
        return {
          iterations,
          usedIterationsMean: detailed.convergence.iterations.mean,
          spectralErrorMean: spectralErrors.reduce((sum, value) => sum + value, 0) / spectralErrors.length,
          spectralErrorMax: Math.max(...spectralErrors),
          convergedSurrogates: detailed.convergence.convergedSurrogates,
        };
      });
      expect(iterationSensitivity.at(-1)!.spectralErrorMean)
        .toBeLessThanOrEqual(iterationSensitivity[0].spectralErrorMean);

      const iterationPairA = pointsFrom(ar1Values(0x2aa1, 271, 0.7));
      const iterationPairB = pointsFrom(ar1Values(0x2bb2, 271, 0.7));
      const iterationNullSensitivity = [2, 6, 12, 24].map((iterations) => ({
        iterations,
        pValue: runSurrogateNullTest("iteration-sensitivity", 1, iterationPairA, iterationPairB, 20, {
          ...DEFAULT_SURROGATE_CONFIG, surrogates: 49, iterations, minOverlappingObservations: 30,
        }).pValue,
      }));

      // 12. Sensibilità al numero di surrogate: il p-value resta nella griglia (1+hits)/(B+1).
      const surrogateCounts = [19, 49, 99, 199];
      const surrogateCountSensitivity = surrogateCounts.map((surrogates) => {
        const test = runSurrogateNullTest("surrogate-count-sensitivity", 1,
          iterationPairA, iterationPairB, 20, {
            ...DEFAULT_SURROGATE_CONFIG, surrogates, iterations: 12, minOverlappingObservations: 30,
          });
        expect(test.pValue).toBeGreaterThanOrEqual(1 / (surrogates + 1));
        expect(test.pValue).toBeLessThanOrEqual(1);
        return { surrogates, pValue: test.pValue, nullMaxAbsN: test.nullMaxAbs.n };
      });

      // 13. I report corretti usano solo la statistica significante per EVIDENZA.
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
        schema: "evoworld.e2.foodweb-review-validation.v2",
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
            tolerance: IAAFT_AMPLITUDE_TOLERANCE,
            transform: "exact-length mixed-radix Cooley-Tukey with Rader prime handling",
            requiredLengths: propertySweep,
            degenerateSeries: degenerateValidation,
          },
          nullCalibration: {
            model: "independent AR(1) pairs",
            intensities: ar1Intensities,
            lengths: calibrationLengths,
            testsPerCell: 32,
            surrogatesPerTest: 49,
            iterations: 12,
            cells: ar1Calibration,
            meanFalsePositiveRate: falsePositiveRate,
            meanPValue: meanNullP,
          },
          knownLag: knownLagValidation,
          iterationSensitivity: {
            spectralError: iterationSensitivity,
            nullPValues: iterationNullSensitivity,
          },
          surrogateCountSensitivity,
          realReports: realSummaries,
        },
        note: "IAAFT usa la DFT alla lunghezza esatta senza padding/troncamento; la convergenza è misurata sull'errore spettrale normalizzato, non solo sull'autocorrelazione lag-1. Il test non usa tick come repliche indipendenti; la direzione è separata dal segno di r e del lag; la causalità resta NON_IDENTIFICABILE.",
      };
      const outputPath = resolveOutputPath(process.env.E2_FOODWEB_VALIDATION_OUT);
      writeExperimentOutput(outputPath, summary);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      process.stdout.write(`E2.2 review validation complete: output=${outputPath}\n`);
    },
    1_800_000,
  );
});
