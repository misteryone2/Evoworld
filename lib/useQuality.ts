"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  QUALITY_PROFILES,
  QUALITY_STORAGE_KEY,
  classifyDevice,
  parsePreference,
  resolveLevel,
  stepDown,
  type DeviceInfo,
  type QualityLevel,
  type QualityPreference,
  type QualityProfile,
} from "./qualityProfile";

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/** Reads what the browser exposes about the device. Safe to call only in the browser. */
export function probeDevice(): DeviceInfo {
  const nav = navigator as NavigatorWithMemory;
  let hasWebGL2 = false;
  let gpuRenderer: string | undefined;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (gl) {
      hasWebGL2 = true;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) gpuRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      // Release the probe context right away: devices only allow a handful at once.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    hasWebGL2 = false;
  }
  return {
    hasWebGL2,
    isTouch: window.matchMedia("(pointer: coarse)").matches,
    screenWidth: window.innerWidth,
    deviceMemoryGB: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    gpuRenderer,
  };
}

export interface QualityState {
  /** false until the device has been probed; the 3D view must not start before then. */
  ready: boolean;
  preference: QualityPreference;
  setPreference: (preference: QualityPreference) => void;
  /** The level actually in use. */
  level: QualityLevel;
  profile: QualityProfile;
  /** The level picked by looking at the device, whatever the person chose. */
  detectedLevel: QualityLevel;
  hasWebGL2: boolean;
  /** Called by the 3D view when it cannot keep up; in automatic mode this steps the level down once. */
  reportSlow: () => void;
}

/**
 * v1.6.0 — Modalità leggera. Chooses how much the app draws and reports:
 * automatically from the device, or from the person's saved choice, and
 * (in automatic mode only) steps down by itself if the 3D view turns out to
 * be too slow for the device.
 */
export function useQuality(): QualityState {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [preference, setPreferenceState] = useState<QualityPreference>("auto");
  const [autoLevel, setAutoLevel] = useState<QualityLevel | null>(null);

  useEffect(() => {
    const info = probeDevice();
    setDevice(info);
    setAutoLevel(classifyDevice(info));
    try {
      setPreferenceState(parsePreference(window.localStorage.getItem(QUALITY_STORAGE_KEY)));
    } catch {
      // storage can be blocked (private mode, strict settings): just stay on automatic
    }
  }, []);

  const detectedLevel: QualityLevel = device ? classifyDevice(device) : "basso";

  const setPreference = useCallback(
    (next: QualityPreference) => {
      setPreferenceState(next);
      // Choosing "automatic" again starts over from what the device suggests.
      if (next === "auto" && device) setAutoLevel(classifyDevice(device));
      try {
        window.localStorage.setItem(QUALITY_STORAGE_KEY, next);
      } catch {
        // see above
      }
    },
    [device],
  );

  const reportSlow = useCallback(() => {
    if (preference !== "auto") return; // an explicit choice is never overridden
    setAutoLevel((current) => (current ? stepDown(current) : current));
  }, [preference]);

  const hasWebGL2 = device?.hasWebGL2 ?? true;
  const level = resolveLevel(preference, autoLevel ?? detectedLevel, hasWebGL2);
  const profile = useMemo(() => QUALITY_PROFILES[level], [level]);

  return { ready: device !== null, preference, setPreference, level, profile, detectedLevel, hasWebGL2, reportSlow };
}
