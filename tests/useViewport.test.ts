import { describe, expect, it } from "vitest";
import {
  buildViewportInfo,
  computeBreakpoint,
  computeOrientation,
  MOBILE_MAX_WIDTH,
  TABLET_MAX_WIDTH,
} from "../lib/useViewport";

// v1.0.6 — solo la logica pura è testata qui (nessuna dipendenza da
// @testing-library/react nel progetto); l'hook React che legge
// window.innerWidth/matchMedia è una sottile wrapper verificata a mano.

describe("computeBreakpoint", () => {
  it("classifica come mobile fino alla soglia inclusa", () => {
    expect(computeBreakpoint(320)).toBe("mobile");
    expect(computeBreakpoint(MOBILE_MAX_WIDTH)).toBe("mobile");
  });

  it("classifica come tablet subito sopra la soglia mobile", () => {
    expect(computeBreakpoint(MOBILE_MAX_WIDTH + 1)).toBe("tablet");
    expect(computeBreakpoint(TABLET_MAX_WIDTH)).toBe("tablet");
  });

  it("classifica come desktop sopra la soglia tablet", () => {
    expect(computeBreakpoint(TABLET_MAX_WIDTH + 1)).toBe("desktop");
    expect(computeBreakpoint(1920)).toBe("desktop");
  });
});

describe("computeOrientation", () => {
  it("riconosce il ritratto quando l'altezza è maggiore o uguale alla larghezza", () => {
    expect(computeOrientation(400, 800)).toBe("portrait");
    expect(computeOrientation(500, 500)).toBe("portrait");
  });

  it("riconosce il paesaggio quando la larghezza supera l'altezza", () => {
    expect(computeOrientation(800, 400)).toBe("landscape");
  });
});

describe("buildViewportInfo", () => {
  it("combina larghezza, altezza, breakpoint, orientamento e touch", () => {
    const info = buildViewportInfo(390, 844, true);
    expect(info).toEqual({
      width: 390,
      height: 844,
      breakpoint: "mobile",
      orientation: "portrait",
      isTouch: true,
      ready: true,
    });
  });

  it("permette di segnalare uno stato non ancora pronto (valore di fallback SSR)", () => {
    const info = buildViewportInfo(1280, 800, false, false);
    expect(info.ready).toBe(false);
  });

  it("classifica correttamente un tablet in landscape senza touch", () => {
    const info = buildViewportInfo(1024, 768, false);
    expect(info.breakpoint).toBe("tablet");
    expect(info.orientation).toBe("landscape");
    expect(info.isTouch).toBe(false);
  });
});
