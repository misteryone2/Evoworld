"use client";

import { computeChartPoints, pointsToPolyline } from "../../lib/historyChart";

interface Props {
  title: string;
  values: number[];
  color: string;
  formatValue?: (v: number) => string;
  height?: number;
}

/**
 * A single hand-rolled SVG line chart (v1.0.3), no charting library — same
 * "draw it yourself" approach as every other visual in this project. Shows
 * the current (last) value alongside the title, and the min/max of the
 * visible series as axis labels, since there are no gridlines to read
 * exact values off otherwise.
 */
export function LineChart({ title, values, color, formatValue = (v) => v.toFixed(2), height = 60 }: Props) {
  const width = 100; // viewBox units; scales to container via CSS width: 100%
  const points = computeChartPoints(values, width, height);
  const polyline = pointsToPolyline(points);
  const last = values[values.length - 1];
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;

  return (
    <div className="line-chart">
      <div className="line-chart-header">
        <span className="line-chart-title">{title}</span>
        <span className="line-chart-current" style={{ color }}>
          {values.length > 0 ? formatValue(last) : "—"}
        </span>
      </div>
      {values.length > 1 ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="line-chart-svg">
            <polyline points={polyline} fill="none" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="line-chart-range">
            <span>{formatValue(min)}</span>
            <span>{formatValue(max)}</span>
          </div>
        </>
      ) : (
        <p className="line-chart-empty">Dati insufficienti — attendi qualche tick di simulazione.</p>
      )}
    </div>
  );
}
