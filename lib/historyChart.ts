/**
 * v1.0.3 — Osservazione storica. Pure data-to-coordinates math for the
 * hand-rolled SVG line charts in components/history/LineChart.tsx —
 * separated out so the actual scaling logic is testable without touching
 * SVG/DOM (consistent with the rest of the project: pure math in lib/,
 * untested rendering in components/).
 */

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Maps a series of values onto normalized coordinates within
 * [0, width] x [0, height]. Y is flipped so larger values plot higher
 * (SVG's y axis grows downward, but a chart reading "up = more" is the
 * expected convention). Degenerates gracefully for empty/single-point/
 * flat series rather than dividing by zero.
 */
export function computeChartPoints(values: number[], width: number, height: number): ChartPoint[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [{ x: 0, y: height / 2 }];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = range === 0 ? height / 2 : height - ((v - min) / range) * height;
    return { x, y };
  });
}

/** Formats a list of points as an SVG `points` attribute string for a <polyline>. */
export function pointsToPolyline(points: ChartPoint[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}
