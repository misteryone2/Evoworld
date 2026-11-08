"use client";

import { useEffect, useRef, useState } from "react";

/**
 * v1.9.0 — Restituisce `value`, ma aggiornato al massimo una volta ogni `intervalMs`.
 * Serve ai pannelli (specie, statistiche, ispettore): il mondo manda un frame ogni 33-100 ms,
 * ma un pannello di testo non ha bisogno di ridisegnarsi così spesso, e col passare del tempo
 * (più specie, un albero genealogico più grande) ogni ridisegno costa di più.
 * Il primo valore passa subito; l'ultimo non va mai perso (arriva allo scadere dell'intervallo).
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [shown, setShown] = useState(value);
  const lastUpdate = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const wait = lastUpdate.current + intervalMs - Date.now();
    if (wait <= 0) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      lastUpdate.current = Date.now();
      setShown(value);
      return;
    }
    if (timer.current === null) {
      timer.current = setTimeout(() => {
        timer.current = null;
        lastUpdate.current = Date.now();
        setShown(latest.current);
      }, wait);
    }
  }, [value, intervalMs]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return shown;
}
