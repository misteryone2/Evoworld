import type { SavedSession, SavedSessionSummary } from "../types";

/**
 * v1.0.1 — Persistenza. Saved sessions live in IndexedDB rather than
 * localStorage: a session contains one full WorldSnapshot per planet
 * (organisms, planet grid, species registry, RNG state — everything
 * needed to resume exactly), which routinely includes thousands of
 * organisms each carrying a Float32Array brain (v0.8). IndexedDB stores
 * structured-clonable values natively (same mechanism already used to
 * pass WorldSnapshot across the worker boundary via postMessage), so
 * typed arrays round-trip correctly without any manual
 * serialize/deserialize step — localStorage would require JSON, which
 * can't represent a Float32Array without extra (lossy, slower) work.
 */

const DB_NAME = "evoworld";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Impossibile aprire il database di salvataggio."));
  });
}

/** Saves (or overwrites, if the same id is reused) a full session. */
export async function saveSession(session: SavedSession): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Salvataggio fallito."));
    });
  } finally {
    db.close();
  }
}

/** Lists every saved session as a lightweight summary (no snapshot payloads), most recent first. */
export async function listSessions(): Promise<SavedSessionSummary[]> {
  const db = await openDatabase();
  try {
    const sessions = await new Promise<SavedSession[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as SavedSession[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error("Impossibile leggere i salvataggi."));
    });
    return sessions
      .map((s) => ({ id: s.id, label: s.label, savedAt: s.savedAt, planetCount: s.planets.length }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

/** Loads one full saved session (including every planet's WorldSnapshot) by id. */
export async function loadSession(id: string): Promise<SavedSession | null> {
  const db = await openDatabase();
  try {
    const session = await new Promise<SavedSession | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result as SavedSession | undefined);
      request.onerror = () => reject(request.error ?? new Error("Impossibile caricare il salvataggio."));
    });
    return session ?? null;
  } finally {
    db.close();
  }
}

/** Permanently deletes one saved session. */
export async function deleteSession(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Eliminazione fallita."));
    });
  } finally {
    db.close();
  }
}
