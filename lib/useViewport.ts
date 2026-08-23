"use client";

import { useEffect, useState } from "react";

/**
 * v1.0.6 — Adaptive UI & Device Optimization.
 *
 * Rileva dimensioni dello schermo, orientamento e tipo di puntatore in modo
 * che i componenti possano adattare il proprio layout (pannelli, controlli,
 * scena 3D) al dispositivo reale. Nessun UA-sniffing: ci si basa solo su
 * `window.innerWidth/innerHeight` e `matchMedia("(pointer: coarse)")`, quindi
 * il risultato resta corretto anche ruotando il dispositivo o ridimensionando
 * la finestra (es. multitasking split-screen su tablet).
 *
 * Le funzioni pure sono esportate separatamente da `useViewport` così da
 * poter essere testate senza dover montare un componente React (questo
 * progetto non ha una dipendenza da @testing-library/react).
 */

export type DeviceBreakpoint = "mobile" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";

export interface ViewportInfo {
  width: number;
  height: number;
  breakpoint: DeviceBreakpoint;
  orientation: Orientation;
  /** true su touchscreen (pointer grossolano); false con mouse/trackpad */
  isTouch: boolean;
  /** false finché non è stata letta la finestra reale (prima del mount) */
  ready: boolean;
}

// Soglie in CSS px. Allineate ai breakpoint usati in globals.css.
export const MOBILE_MAX_WIDTH = 640;
export const TABLET_MAX_WIDTH = 1024;

export function computeBreakpoint(width: number): DeviceBreakpoint {
  if (width <= MOBILE_MAX_WIDTH) return "mobile";
  if (width <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

export function computeOrientation(width: number, height: number): Orientation {
  return height >= width ? "portrait" : "landscape";
}

export function buildViewportInfo(width: number, height: number, isTouch: boolean, ready = true): ViewportInfo {
  return {
    width,
    height,
    breakpoint: computeBreakpoint(width),
    orientation: computeOrientation(width, height),
    isTouch,
    ready,
  };
}

// Valore di default usato lato server e nel primo render lato client, prima
// che l'effetto possa leggere le dimensioni reali della finestra. Il primo
// render client-side deve produrre lo stesso markup di quello server-side
// (Next.js), quindi qui non si accede mai a `window`.
const SSR_FALLBACK: ViewportInfo = buildViewportInfo(1280, 800, false, false);

function readViewport(): ViewportInfo {
  if (typeof window === "undefined") return SSR_FALLBACK;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  return buildViewportInfo(window.innerWidth, window.innerHeight, isTouch, true);
}

export function useViewport(): ViewportInfo {
  const [viewport, setViewport] = useState<ViewportInfo>(SSR_FALLBACK);

  useEffect(() => {
    const update = () => setViewport(readViewport());
    update();

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    const pointerQuery = window.matchMedia("(pointer: coarse)");
    // Safari < 14 non supporta addEventListener su MediaQueryList.
    if (pointerQuery.addEventListener) {
      pointerQuery.addEventListener("change", update);
    }

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (pointerQuery.removeEventListener) {
        pointerQuery.removeEventListener("change", update);
      }
    };
  }, []);

  return viewport;
}
