"use client";

import { useEffect, useState } from "react";
import type { SavedSession, SavedSessionSummary } from "../../types";
import { deleteSession, listSessions, loadSession as loadSessionFromDb } from "../../lib/persistence";

interface Props {
  onSave: (label?: string) => Promise<string>;
  onLoad: (session: SavedSession) => void;
}

/**
 * v1.0.1 — Persistenza. Lets the person save the entire current multiverse
 * (every running planet, via useMultiverse.saveSession) under a label, and
 * browse/resume/delete previously saved sessions. Load/delete work
 * straight against lib/persistence.ts (no live worker state needed for
 * those); saving goes through the parent's onSave since it needs to ask
 * each running worker for its current snapshot first.
 */
export function SaveLoadPanel({ onSave, onLoad }: Props) {
  const [sessions, setSessions] = useState<SavedSessionSummary[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setSessions(await listSessions());
    } catch {
      setError("Impossibile leggere i salvataggi su questo dispositivo.");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await onSave(label);
      setLabel("");
      setStatus("Sessione salvata.");
      await refresh();
    } catch {
      setError("Salvataggio non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (id: string) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const session = await loadSessionFromDb(id);
      if (!session) {
        setError("Questo salvataggio non è più disponibile.");
        await refresh();
        return;
      }
      onLoad(session);
      setStatus(`Sessione "${session.label}" caricata.`);
    } catch {
      setError("Caricamento non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteSession(id);
      await refresh();
    } catch {
      setError("Eliminazione non riuscita. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="save-load-panel">
      <div className="save-row">
        <input
          type="text"
          className="save-label-input"
          placeholder="Nome del salvataggio (opzionale)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
          Salva sessione attuale
        </button>
      </div>

      {error && <p className="save-error">{error}</p>}
      {status && <p className="save-status">{status}</p>}

      <h3>Salvataggi su questo dispositivo</h3>
      {sessions.length === 0 ? (
        <p className="save-empty">Nessun salvataggio ancora. I salvataggi restano su questo dispositivo/browser.</p>
      ) : (
        <ul className="save-list">
          {sessions.map((s) => (
            <li key={s.id} className="save-item">
              <div className="save-item-info">
                <span className="save-item-label">{s.label}</span>
                <span className="save-item-meta">
                  {s.planetCount} {s.planetCount === 1 ? "pianeta" : "pianeti"} · {new Date(s.savedAt).toLocaleString("it-IT")}
                </span>
              </div>
              <div className="save-item-actions">
                <button type="button" className="btn" onClick={() => handleLoad(s.id)} disabled={busy}>
                  Carica
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleDelete(s.id)} disabled={busy}>
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
