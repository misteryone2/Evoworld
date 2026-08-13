import { describe, it, expect } from "vitest";
import { terrainColorRGB, terrainColorCSS } from "../lib/terrainColor";

describe("terrainColorRGB", () => {
  it("returns fixed colors for ocean, mountain, tundra regardless of vegetation", () => {
    expect(terrainColorRGB(0, 0)).toEqual(terrainColorRGB(0, 1));
    expect(terrainColorRGB(3, 0)).toEqual(terrainColorRGB(3, 1));
    expect(terrainColorRGB(5, 0)).toEqual(terrainColorRGB(5, 1));
  });

  it("every channel stays within the valid 0-255 range across the full vegetation range", () => {
    for (const terrainCode of [0, 1, 2, 3, 4, 5, 6]) {
      for (const vegetation of [0, 0.25, 0.5, 0.75, 1]) {
        const [r, g, b] = terrainColorRGB(terrainCode, vegetation);
        for (const channel of [r, g, b]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("forest gets greener (higher green channel) as vegetation increases", () => {
    const low = terrainColorRGB(4, 0);
    const high = terrainColorRGB(4, 1);
    expect(high[1]).toBeGreaterThan(low[1]);
  });

  it("desert gets greener as vegetation increases", () => {
    const low = terrainColorRGB(2, 0);
    const high = terrainColorRGB(2, 1);
    expect(high[1]).toBeGreaterThan(low[1]);
  });

  it("plains (default terrain code) shifts from dry tan toward green as vegetation increases", () => {
    const low = terrainColorRGB(1, 0);
    const high = terrainColorRGB(1, 1);
    expect(high[1]).toBeGreaterThan(low[1]); // greener
    expect(high[0]).toBeLessThan(low[0]); // less red/tan
  });
});

describe("terrainColorCSS", () => {
  it("formats as a valid rgb() string matching terrainColorRGB", () => {
    const [r, g, b] = terrainColorRGB(4, 0.5);
    expect(terrainColorCSS(4, 0.5)).toBe(`rgb(${r}, ${g}, ${b})`);
  });
});
