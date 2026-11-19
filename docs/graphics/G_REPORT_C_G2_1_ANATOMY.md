# Report C — G2.1: hardening anatomico, geometria e validazione

**Branch:** `graphics/g2-anatomy-hardening`.
**Commit:** implementazione `958a60e38dd109c81c7a4d2917c77a880e782ea1`, report `0879a8847918622897ea5109b5ccc5fd8e68df2e`.
**Base:** `main@d330c12f345ab26ab7405b908c729e2e2f6bcc22`.
**Data verifica:** 2026-11-16/18.

## 1. Sintesi

| Attività | Classificazione | Evidenza |
|---|---|---|
| AABB reali, extents completi, `totalHeight` | **COMPLETATA** | `computeExtents`/`computeAnatomicalExtents`, test geometrici |
| Ground clearance mai derivata da max lunghezza zampa | **COMPLETATA** | `null` + `groundClearanceStatus`/`groundClearanceReason` quando non determinabile; `maxLimbLength` separato |
| Posizionamento appendici e policy dispari | **COMPLETATA** | `OddAppendagePolicy`, diagnostici `WARNING` dichiarati |
| Simmetria verificata, non solo dichiarata | **COMPLETATA** | controllo numerico con tolleranza `1e-4`, arrotondamento `1e-6` |
| Stati validazione `VALID`/`WARNING`/`INVALID` | **COMPLETATA** | `validateAnatomy()` API invariata, `inspectAnatomy()` additivo |
| LOD, serializzazione, generazione, adattatore legacy | **COMPLETATA** | 90 test mirati + migrazione descrittori vecchi |
| Tutti i test dichiarati rieseguiti | **COMPLETATA** | tabella §2 |
| Collegamento end-to-end al renderer G1 | **NON VERIFICATA** | nel solo G2.1 non esisteva consumer; colmato solo come contratto in consolidamento |
| Realismo biologico della geometria statica | **COMPLETATA CON LIMITAZIONI** | approssimazione geometrica, non modello dinamico |

## 2. Verifiche eseguite e rieseguite

| ID | Tipo | Comando | Exit | Risultato | Errori | Skip |
|---|---|---|---|---|---|---|
| C-01 | A | `npx vitest run tests/anatomyG2.test.ts tests/phenotypeG2.test.ts --reporter=dot` (baseline pre-modifica) | 0 | `29 passed (29)` | 0 | 0 |
| C-02 | A | `npx vitest run tests/__g2_audit_probe.test.ts --reporter=verbose` (probe temporanea, rimossa) | 0 | `1 passed (1)` | 0 | 0 |
| C-03 | A | `npx vitest run tests/anatomyG2Geometry.test.ts --reporter=dot` | 0 | `61 passed (61)` | 0 | 0 |
| C-04 | A | `npx vitest run tests/anatomyG2.test.ts tests/phenotypeG2.test.ts tests/anatomyG2Geometry.test.ts --reporter=dot` | 0 | `3 files passed`, `90 passed (90)` | 0 | 0 |
| C-05 | A | `npx tsc --noEmit --pretty false` (prima build) | 2 | `app/layout.tsx(10,50): error TS2304: Cannot find name 'LayoutProps'.` | 1 (tipi Next non generati) | — |
| C-06 | A | `npx next build` | 0 | `✓ Compiled successfully`, `Finished TypeScript in 3.1s`, `3/3` pagine statiche | 0 | — |
| C-07 | A | `npx tsc --noEmit --pretty false` (dopo build) | 0 | nessun output | 0 | — |
| C-08 | A | `npx vitest run --reporter=dot` (G2.1 finale) | 1 | `10 failed`, `830 passed`, `1 skipped (841)` | 10 preesistenti/flaky | 1 |
| C-09 | A | `npx vitest run --reporter=dot` (baseline `main`) | 1 | `10 failed`, `769 passed`, `1 skipped (780)` | stesso insieme di errori | 1 |
| C-10 | C | `git diff --check` | 0 | nessun errore (solo avvisi LF→CRLF) | 0 | — |

I 10 failure di C-08/C-09 sono identici come insieme: `fauna180` (1), `hydrology` (1), `planet` (2), `reproduction` (2), `settlementDefaults` (1), `vibeGenomeV1110` (3). Il +61 è esattamente il nuovo file geometrico.

## 3. Correzioni confermate

- `groundClearance` non è più un proxy di `maxLimbLength`; quando le zampe non sono coplanari o rivolte verso il basso restituisce `null` con stato e motivo.
- Extents separati per corpo e organismo completo; `asymmetricWidth`, `bodyExtents`, `anatomicalExtents` coerenti.
- Appendici dispari posizionate con policy esplicita e diagnostico, non silenziosamente specularizzate.
- Simmetria validata geometricamente; segmenti coincidenti/degenerati rilevati.
- `ANATOMY_SCHEMA_VERSION = 1`; `validateAnatomy()` mantiene la firma storica; la deserializzazione migra i descrittori vecchi senza inventare geometria.

## 4. Limiti

- Appendici primitive rette: niente curvature, mesh articolate o volume dinamico.
- I controlli di sovrapposizione sono O(n²) solo in `inspectAnatomy()`, producono `WARNING` e non bloccano.
- Ground clearance è una stima statica; non modella postura, gravità o deformazione del terreno.
- `lib/anatomy/legacyAdapter.ts` resta esplicitamente **non collegato al renderer**: converte e confronta, non guida il disegno.
- Il fenotipo morfologico disponibile è limitato a 4 geni; nessun body plan è geneticamente codificato.

## 5. Classificazione finale

**COMPLETATA CON LIMITAZIONI.** L'hardening è verificato e non regredisce; resta un consumer renderer end-to-end, che nella fase successiva è stato realizzato come ponte read-only e test di contratto, non come riscrittura della geometria instanziata.
