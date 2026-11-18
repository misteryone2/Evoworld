# Titolo
G2 — Review & hardening: geometria, estensioni/terreno, simmetria, cache (schema v2)

# Base e confronto
base: `main` ← compare: `graphics/g2-anatomy-phenotype`

# Descrizione
Revisione tecnica del sistema G2 (anatomia e fenotipo procedurali, già presente su `main`). Nessuna nuova funzione biologica, nessun collegamento al renderer, motore biologico e file di Vibe intatti.

**Correzioni** (13 anomalie dimostrate, dettaglio in `docs/graphics/G2_REVIEW_REPORT.md`): radici delle appendici sulla superficie del segmento; placche distribuite lungo il corpo; appendice dispari orientata correttamente; `computeExtents` con appendici e terreno dalle punte delle zampe d'appoggio (`null` se non determinabile); simmetria effettiva (MCD radiale, sfera con appendici = radiale); locomozione coerente; giunti interni coerenti; ripartizione del tetto di 64 appendici; simmetria robusta al rumore in virgola mobile; cache con chiave completa e senza spec modificabili; validazione degli spec.
**Contratto:** `schemaVersion` 2 (nessun descriptor v1 è mai stato salvato).

**Test:** +88 (`tests/anatomyG2Review.test.ts`), totale G2 117, tutti passati.
**Risultati reali:** `tsc` 0 errori · `npm test` 797 passati / 5 falliti preesistenti / 1 saltato · `npm run build` riuscita.
**5 fallimenti preesistenti, non G2** (identici senza G2): fauna180 (1), reproduction (2), vibeGenomeV1110 (2).
ESLint non eseguito (nessuna configurazione nel repo).

**Da decidere a parte:** il `LEGGIMI.txt` della radice è stato sovrascritto dall'upload del 17/11 (commit 83abcc4); il testo originale è nel commit c35c287. Non incluso in questa PR.
