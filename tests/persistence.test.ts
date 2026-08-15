import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { saveSession, listSessions, loadSession, deleteSession } from "../lib/persistence";
import type { SavedSession, WorldSnapshot } from "../types";

function fakeSnapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    tick: 1234,
    planet: {
      config: { width: 10, height: 10, seed: 1 },
      cells: [],
    },
    organisms: [
      {
        id: 1,
        speciesId: 1,
        position: { x: 5, y: 5 },
        energy: 80,
        age: 12,
        genome: {
          size: 1,
          speed: 1,
          metabolism: 1,
          vision: 5,
          fertility: 0.5,
          lifespan: 500,
          carnivory: 0.2,
          preferredTemperature: 20,
          temperatureTolerance: 10,
          preferredWater: 0.5,
          waterTolerance: 0.3,
          evasion: 0.3,
          huntingSkill: 0.1,
        },
        alive: true,
        home: { x: 5, y: 5 },
        memory: null,
        // The exact kind of value that requires structured-clone support
        // (not JSON-safe without manual work) — this is the whole reason
        // the persistence layer uses IndexedDB instead of localStorage.
        brain: new Float32Array([0.1, -0.5, 2.3, -4, 0]),
      },
    ],
    nextOrganismId: 2,
    nextSpeciesId: 2,
    randomState: 42,
    speciesRegistry: [],
    ...overrides,
  };
}

function fakeSession(id: string, overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    id,
    label: "Sessione di prova",
    savedAt: Date.now(),
    activePlanetId: "planet-1",
    planets: [{ id: "planet-1", name: "Pianeta 1", seed: 1, snapshot: fakeSnapshot() }],
    ...overrides,
  };
}

describe("persistence", () => {
  beforeEach(async () => {
    // fresh fake IndexedDB per test via fake-indexeddb/auto's reset support
    const { indexedDB } = await import("fake-indexeddb");
    // @ts-expect-error - reassigning the global for test isolation
    globalThis.indexedDB = new indexedDB.constructor();
  });

  it("round-trips a saved session, including a Float32Array field, exactly", async () => {
    const session = fakeSession("s1");
    await saveSession(session);

    const loaded = await loadSession("s1");
    expect(loaded).not.toBeNull();
    expect(loaded!.label).toBe("Sessione di prova");
    expect(loaded!.planets).toHaveLength(1);

    const brain = loaded!.planets[0].snapshot.organisms[0].brain;
    expect(brain).toBeInstanceOf(Float32Array);
    // Compared against a Float32Array with the same literal values (not
    // plain numbers) so both sides go through identical 32-bit rounding —
    // this isolates "did the value round-trip correctly" from "float32
    // has less precision than a JS number", which is expected and fine.
    const expected = new Float32Array([0.1, -0.5, 2.3, -4, 0]);
    expect(Array.from(brain)).toEqual(Array.from(expected));
  });

  it("returns null when loading a session id that doesn't exist", async () => {
    const loaded = await loadSession("does-not-exist");
    expect(loaded).toBeNull();
  });

  it("lists saved sessions as lightweight summaries, most recent first", async () => {
    await saveSession(fakeSession("s1", { label: "Prima", savedAt: 1000 }));
    await saveSession(fakeSession("s2", { label: "Seconda", savedAt: 2000 }));

    const list = await listSessions();
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe("Seconda");
    expect(list[1].label).toBe("Prima");
    expect(list[0].planetCount).toBe(1);
    // Summaries must not carry the (potentially large) snapshot payload.
    expect((list[0] as unknown as SavedSession).planets).toBeUndefined();
  });

  it("overwrites a session saved again with the same id", async () => {
    await saveSession(fakeSession("s1", { label: "Prima versione" }));
    await saveSession(fakeSession("s1", { label: "Versione aggiornata" }));

    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("Versione aggiornata");
  });

  it("deletes a saved session", async () => {
    await saveSession(fakeSession("s1"));
    await deleteSession("s1");
    expect(await loadSession("s1")).toBeNull();
    expect(await listSessions()).toHaveLength(0);
  });

  it("supports multiple planets within one session", async () => {
    const session = fakeSession("s1", {
      planets: [
        { id: "planet-1", name: "Pianeta 1", seed: 1, snapshot: fakeSnapshot({ tick: 100 }) },
        { id: "planet-2", name: "Pianeta 2", seed: 2, snapshot: fakeSnapshot({ tick: 200 }) },
      ],
    });
    await saveSession(session);
    const loaded = await loadSession("s1");
    expect(loaded!.planets).toHaveLength(2);
    expect(loaded!.planets[0].snapshot.tick).toBe(100);
    expect(loaded!.planets[1].snapshot.tick).toBe(200);
  });
});
