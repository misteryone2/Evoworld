# E1.3.1 — Statistical Engine Final Hardening

**Branch:** `research/e1-ecosystem-qa` · **PR:** #2 (aperta, non integrata in `main`) · **Runtime:** Node `v22.14.0` / V8 `12.4.254.21-node.22` (identico a E1.3).

## 1. Obiettivo

Rendere robusto il quantile t di Student usato per gli IC95 per qualsiasi dimensione campionaria ragionevole, eliminando il fallback `T_CRITICAL_95[df] ?? 1.96` oltre 30 gradi di libertà, senza dipendenze esterne e senza alterare i risultati E1.3 con 12 seed.

## 2. Modifiche

- `tools/e1/statistics.ts`
  - Aggiunto `studentTQuantile95(df)`: quantile 0.975 calcolato invertendo la coda della t di Student con beta incompleta regolarizzata (frazione continua di Lentz + log-Gamma di Lanczos/Stirling) e bisezione su `t >= 0`. Nessuna dipendenza esterna.
  - `summarize()` usa la tabella storica a 3 decimali per `df` 1..30 e il calcolo esatto per `df > 30`. Il fallback a 1.96 è stato rimosso.
  - `summarize()` filtra i valori non finiti (`NaN`, `±Infinity`) prima di calcolare media, SD, min/max e IC; `n` è il numero di osservazioni finiti.
- `tests/e1/e1_statistics.test.ts`
  - 11 nuovi test: quantili per `n = 2, 12, 31, 50, 100, 1000` (anche IC95 completi), assenza di 1.96 per `df > 30`, regressione E1.3 a 4 decimali, gestione vuoti/singoli/non finiti (anche nelle differenze appaiate), rifiuto di `df` non validi.

Nessun altro file è stato modificato: `simulation/**`, genetica, G1/G1-b, G2, strumenti E1 diversi da `statistics.ts`, dataset E1.2/E1.3 e report di fase precedenti sono intatti.

## 3. Metodo e riferimenti

Per `t >= 0` la coda superiore bilateralmente è

`P(|T| > t) = I_x(df/2, 1/2)`, con `x = df / (df + t²)`,

dove `I_x(a,b)` è la beta incompleta regolarizzata. Si risolve `P(|T| > t) = 0.05` per bisezione (200 iterazioni, `t >= 0`). `I_x` è calcolata con la frazione continua di Lentz (Numerical Recipes, cap. 6.4); il prefattore usa `log Γ` con approssimazione di Lanczos per `z < 10` e serie di Stirling per `z >= 10`.

Riferimenti usati per la verifica (valori indipendenti, non derivati dal codice E1):

- **Statistics Kingdom**, t-table ad alta precisione, colonna `t0.975` (cumulata 0.975): `https://www.statskingdom.com/t_table.html` — verifica di df 1, 2, 11, 30, 40, 50, 100.
- **NIST/SEMATECH e-Handbook**, *Table of t distribution*, 5% two-sided: `https://itl.nist.gov/div898/handbook/mpc/section3/mpc3652.htm` — verifica di df 50 e 100 (2.009 / 1.984 a 3 decimali).
- **jStat 1.9.6**, implementazione indipendente `jStat.studentt.inv(0.975, df)` (`https://unpkg.com/jstat@1.9.6/dist/jstat.min.js`) — verifica di df 1, 2, 11, 30, 49, 99, 999, 10⁶.
- **Wessa / Quarto Appendix F** (source NIST/SEMATECH): `https://quarto.wessa.net/tdisttable.html` — verifica della colonna 0.975 per df 1..100.

## 4. Valori verificati

| n | df | quantile calcolato | riferimento | scarto |
|---:|---:|---:|---:|---:|
| 2 | 1 | 12.7062047362 | 12.7062047362 | < 1e-10 |
| 12 | 11 | 2.2009851601 | 2.2009851601 | < 1e-10 |
| 31 | 30 | 2.0422724563 | 2.0422724563 | < 1e-10 |
| 50 | 49 | 2.0095752371 | 2.0095752345 | ~3e-9 |
| 100 | 99 | 1.9842169516 | 1.9842169516 | < 1e-10 |
| 1000 | 999 | 1.9623414611 | 1.9623414165 (jStat) | ~5e-8 |

I valori per `df > 30` sostituiscono l'approssimazione 1.96 (che è il limite per `df → ∞`, non il valore esatto). La precisione è ampiamente sufficiente per IC a 4 decimali.

## 5. Casi limite

- **Campione vuoto**: `n = 0`, statistiche a 0, `ci95 = null`.
- **Un solo valore**: `n = 1`, `sd = 0`, `ci95 = null` (gradi di libertà = 0).
- **Valori non finiti**: esclusi dal riassunto; se restano meno di due valori finiti non si produce un IC.
- **`df` non valido** (`< 1`, `NaN`, `Infinity`): `studentTQuantile95` solleva un errore esplicito invece di restituire un numero spurio.

## 6. Invarianza E1.3

La tabella a 3 decimali per `df` 1..30 è stata mantenuta deliberatamente: con `df = 11` il quantile esatto 2.2009851601 sposterebbe il limite inferiore del confronto S08−S01 da `-21.2672` a `-21.2671`, cioè modificherebbe un risultato E1.3 alla precisione già adottata. Con la tabella storica il report appaiato rigenerato dagli stessi 84 run grezzi è **deep-equal** a `e1-phase2-e1.3-paired.json` (`E1.3_PAIRED_IDENTICAL=true`). Nessun dataset storico è stato riscritto: i manifest conservano il `sourceSha256` e la provenance originali della generazione, coerentemente con il principio di non riscrivere il passato.

## 7. Comandi eseguiti ed esiti

| Comando | Esito | Exit code |
|---|---|---:|
| `npx tsc --noEmit --incremental false` | nessun errore | 0 |
| `npx vitest run tests/e1` | 7 file, 65 test passati (54 prima, +11) | 0 |
| `npx next build` | build di produzione riuscita | 0 |
| `E1_PAIRED_INPUT=... E1_PAIRED_OUT=... npx vitest run --config vitest.experiment.config.ts scripts/e1_paired_report.experiment.ts` | report rigenerato, identico a E1.3 | 0 |

Il confronto deep-equal è stato eseguito con `node -e "assert.deepStrictEqual(after, stored)"` su file temporanei fuori dal repository. Nessuna simulazione è stata rieseguita: i dati grezzi E1.3 sono gli stessi già usati per il report approvato.

## 8. Conclusione

Il calcolo degli IC95 è ora esatto anche oltre 30 gradi di libertà, verificato contro riferimenti statistici indipendenti, privo di dipendenze esterne e retrospectivamente compatibile con tutti i numeri E1.3. Nessun risultato biologico o contenuto dei dataset storici è stato toccato; la PR #2 resta aperta e non integrata in `main`.
