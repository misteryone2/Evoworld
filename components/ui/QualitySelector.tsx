"use client";

import { QUALITY_LEVELS, QUALITY_PROFILES, type QualityLevel, type QualityPreference } from "../../lib/qualityProfile";

interface Props {
  preference: QualityPreference;
  /** The level actually in use right now. */
  level: QualityLevel;
  /** The level the device suggests (shown next to "Automatica"). */
  detectedLevel: QualityLevel;
  hasWebGL2: boolean;
  onChange: (preference: QualityPreference) => void;
}

/**
 * v1.6.0 — Modalità leggera. Lets the person pick how heavy the picture is:
 * automatic (recommended: follows the device and eases off if it struggles)
 * or a fixed level, from a plain 2D map up to full 3D detail.
 */
export function QualitySelector({ preference, level, detectedLevel, hasWebGL2, onChange }: Props) {
  return (
    <div className="quality-selector">
      <label htmlFor="quality-select">Prestazioni</label>
      <select id="quality-select" value={preference} onChange={(e) => onChange(e.target.value as QualityPreference)}>
        <option value="auto">Automatica (consigliata: {QUALITY_PROFILES[detectedLevel].label})</option>
        {QUALITY_LEVELS.map((l) => (
          <option key={l} value={l} disabled={l !== "2d" && !hasWebGL2}>
            {QUALITY_PROFILES[l].label}
          </option>
        ))}
      </select>
      <p className="quality-hint">
        In uso: <strong>{QUALITY_PROFILES[level].label}</strong> — {QUALITY_PROFILES[level].description}
        {!hasWebGL2 && " Questo dispositivo non supporta il 3D (WebGL2): si usa la mappa 2D."}
      </p>
    </div>
  );
}
