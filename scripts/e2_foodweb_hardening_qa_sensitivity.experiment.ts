/** E2.2.1 — sensitivity analysis per definire la soglia QA dell'IAAFT. */
import { describe, expect, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import { iaaftSurrogatesDetailed, mulberry32 } from "../tools/e2/surrogateInference";
import { syntheticSeries, type DistributionKind } from "../tools/e2/syntheticSeries";

const LENGTHS = [100, 160, 271, 512, 1024] as const;
const PHIS = [0, 0.25, 0.65, 0.9, 0.95] as const;
const DISTRIBUTIONS: DistributionKind[] = ["gaussian", "exponential", "discrete"];
const THRESHOLDS = [0.01, 0.02, 0.05, 0.1, 0.2] as const;
const ITERATION_BUDGETS = [1, 2, 4, 8, 12, 24] as const;
const REPLICATES = 6;
const SURROGATES = 6;

const percentile = (values: number[], fraction: number): number => {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

interface QaObservation {
  spectralError: number;
  autocorrelations: Array<{ lag: number; observed: number | null; surrogate: number | null }>;
  converged: boolean;
  iterations: number;
}

const observationsFor = (
  seed: number,
  length: number,
  phi: number,
  distribution: DistributionKind,
  iterations: number,
): QaObservation[] => {
  const values = syntheticSeries(seed, length, { phi, distribution, tieFraction: distribution === "discrete" ? 0.5 : 0 });
  return iaaftSurrogatesDetailed(values, SURROGATES, mulberry32(seed ^ 0x5aa5), iterations, {
    allowInvalidSurrogates: true,
  }).qa.map((record) => ({
    spectralError: record.finalSpectralError,
    autocorrelations: record.autocorrelations.map((entry) => ({
      lag: entry.lag,
      observed: entry.observed,
      surrogate: entry.surrogate,
    })),
    converged: record.converged,
    iterations: record.iterations,
  }));
};

/** Errore medio per lag tra ACF osservata e media ensemble dei surrogati accettati. */
const ensembleAcfError = (observations: QaObservation[]): number => {
  if (observations.length === 0) return Number.POSITIVE_INFINITY;
  const lags = observations[0].autocorrelations.map((entry) => entry.lag);
  return Math.max(...lags.map((lag) => {
    const entries = observations.flatMap((observation) => observation.autocorrelations
      .filter((entry) => entry.lag === lag && entry.surrogate !== null && entry.observed !== null)
      .map((entry) => ({ observed: entry.observed as number, surrogate: entry.surrogate as number })));
    if (entries.length === 0) return Number.POSITIVE_INFINITY;
    const observed = entries[0].observed;
    const mean = entries.reduce((sum, entry) => sum + entry.surrogate, 0) / entries.length;
    return Math.abs(observed - mean);
  }));
};

describe("E2.2.1 IAAFT QA sensitivity", () => {
  it(
    "measures the spectral-error threshold needed for bounded autocorrelation distortion",
    () => {
      const cells: Array<Record<string, unknown>> = [];
      for (const length of LENGTHS) {
        for (const phi of PHIS) {
          for (const distribution of DISTRIBUTIONS) {
            const observations = Array.from({ length: REPLICATES }, (_, replicate) =>
              observationsFor(0x71000000 + length * 101 + Math.round(phi * 100) * 17 + replicate * 7919,
                length, phi, distribution, 12)).flat();
            const spectralErrors = observations.map((entry) => entry.spectralError);
            const thresholdRows = THRESHOLDS.map((threshold) => {
              const accepted = observations.filter((entry) => entry.spectralError <= threshold);
              return {
                threshold,
                acceptedFraction: accepted.length / observations.length,
                ensembleAcfError: ensembleAcfError(accepted),
              };
            });
            expect(spectralErrors.every(Number.isFinite)).toBe(true);
            cells.push({
              length,
              phi,
              distribution,
              observations: observations.length,
              spectralErrorMean: spectralErrors.reduce((sum, value) => sum + value, 0) / spectralErrors.length,
              spectralErrorMax: Math.max(...spectralErrors),
              convergedFraction: observations.filter((entry) => entry.converged).length / observations.length,
              thresholdRows,
            });
          }
        }
      }

      const iterationSweep = ITERATION_BUDGETS.map((iterations) => {
        const observations = [0, 0.65, 0.9, 0.95].flatMap((phi) =>
          observationsFor(0x1a2b3c4d + Math.round(phi * 100), 271, phi, "gaussian", iterations));
        const errors = observations.map((entry) => entry.spectralError);
        return {
          iterations,
          spectralErrorMean: errors.reduce((sum, value) => sum + value, 0) / errors.length,
          spectralErrorMax: Math.max(...errors),
          convergedFraction: observations.filter((entry) => entry.converged).length / observations.length,
        };
      });

      const thresholdDecision = THRESHOLDS.map((threshold) => {
        const acceptedRows = cells.flatMap((cell) =>
          (cell.thresholdRows as Array<{ threshold: number; acceptedFraction: number; ensembleAcfError: number }>)
            .filter((row) => row.threshold === threshold));
        const worstEnsembleAcfError = Math.max(...acceptedRows
          .filter((row) => Number.isFinite(row.ensembleAcfError))
          .map((row) => row.ensembleAcfError));
        const minimumAcceptance = Math.min(...acceptedRows.map((row) => row.acceptedFraction));
        return {
          threshold,
          worstEnsembleAcfError,
          minimumAcceptanceFraction: minimumAcceptance,
          meetsAcfBound: worstEnsembleAcfError <= 0.15,
        };
      });

      const summary = {
        schema: "evoworld.e2.hardening-qa-sensitivity.v1",
        executedAt: process.env.E2_HARDENING_QA_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        protocol: {
          lengths: LENGTHS,
          phis: PHIS,
          distributions: DISTRIBUTIONS,
          replicates: REPLICATES,
          surrogatesPerObservation: SURROGATES,
          reportIterations: 12,
          autocorrelations: "lags 1,2,3,5,10,20 where the series length permits",
        },
        cells,
        iterationSweep,
        thresholdDecision,
        recommendation: {
          spectralErrorMax: THRESHOLDS.find((row) => thresholdDecision
            .find((entry) => entry.threshold === row)?.meetsAcfBound) ?? null,
          autocorrelationErrorMax: 0.15,
          note: "La soglia ACF ensemble 0.15 è fissata prima della calibrazione: separa celle a bassa autocorrelazione, dove l'errore resta sotto il limite, dai registri ad alta autocorrelazione che saranno degradati a NON_VALUTABILE invece di essere fatti passare. L'ACF dei singoli surrogati resta diagnostica.",
        },
      };
      const outputPath = resolveOutputPath(process.env.E2_HARDENING_QA_OUT);
      writeExperimentOutput(outputPath, summary);
      process.stdout.write(`E2.2.1 QA sensitivity complete: output=${outputPath}\n`);
      process.stdout.write(`${JSON.stringify(thresholdDecision, null, 2)}\n`);
    },
    1_800_000,
  );
});
