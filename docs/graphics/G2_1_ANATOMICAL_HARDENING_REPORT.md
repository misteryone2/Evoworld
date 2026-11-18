# G2.1 — Anatomical Integrity, Geometry Validation & Structural Hardening — Report finale

Branch: `graphics/g2-anatomy-hardening` — base: `main@d330c12f345ab26ab7405b908c729e2e2f6bcc22`.

## 1. Executive summary

L’audit indipendente ha confermato tutti i difetti principali segnalati nella review preliminare: ground clearance falsamente derivata dalla lunghezza massima delle zampe, extents incompleti e asymmetric-width errato, posizionamento delle appendici dispari non anatomicamente coerente, simmetria dichiarata ma non verificata, assenza di controlli di coincidenza/degenerazione. Ho corretto i difetti confermati con un intervento **additivo e isolato** su `lib/anatomy/`, senza riscrivere G2, senza toccare sistemi protetti e senza modificare G1 o il renderer.

Il descriptor ora espone AABB reali (corpo e organismo completo), `totalHeight`, `maxLimbLength` separato da una `groundClearance` **nullable e motivata**, anomalie dichiarate, diagnostici `VALID`/`WARNING`/`INVALID`, policy esplicite per le appendici dispari e validazione geometrica della simmetria. `validateAnatomy()` mantiene la firma legacy `{ ok, errors }`; la serializzazione migra i descrittori precedenti in modo additivo.

Verifiche eseguite: 90 test mirati passati, 61 nuovi test geometrici passati, `tsc --noEmit` exit 0, `next build` exit 0. La suite completa resta con 10 failure preesistenti/flaky, **identiche come insieme** a quelle di `main`; nessuna nuova regressione e +61 test passati rispetto al baseline.

## 2. Stato iniziale del branch

- Repository: `Evoworld-git`, checkout iniziale su `research/e2-ecosystem-dynamics` con modifiche non committate di altri agenti (`tools/e2/...`, successivamente anche nuovi script `scripts/e2_...`). **Non sono state toccate.**
- Branch G2 preesistenti: `graphics/g1-creature-visuals` (precedente a G2, privo di `lib/anatomy`) e il G2 storico confluito in `main`. Non esisteva `graphics/g2-anatomy-hardening`.
- Ho creato un worktree isolato `Evoworld-g2` da `main@d330c12`, senza checkout nel repository condiviso e senza merge.
- Baseline G2 prima di qualsiasi modifica: `npx vitest run tests/anatomyG2.test.ts tests/phenotypeG2.test.ts --reporter=dot` → **29 passed (29)**, `EXIT=0`.
- Nota ambientale: inizialmente il worktree usava un junction `node_modules` verso il checkout sorgente; Turbopack lo rifiutava. Ho sostituito il junction con una copia fisica (459,5 MB / 24.008 file), lasciando intatto `Evoworld-git/node_modules`.

## 3. Audit delle criticità

| Problema | Confermato? | File/linea (baseline) | Severità | Intervento |
|---|---|---|---|---|
| Ground clearance errata | Sì | `lib/anatomy/assemble.ts:30-31` | Alta | Ricalcolo da geometria; `null` + motivo se non determinabile; `maxLimbLength` separato |
| Extents incompleti | Sì | `lib/anatomy/assemble.ts:21-32` | Alta | AABB reale di segmenti+appendici, centro, `scaledSize`, `totalHeight` |
| Posizionamento appendici | Sì | `lib/anatomy/generate.ts:85-88,104-118` | Alta | Host per intervallo Z, `clampZ`, policy dispari, orientamento coerente, jitter simmetrico |
| Simmetria non verificata | Sì | `lib/anatomy/validate.ts:100-113` | Alta | Controllo bilaterale (posizione/direzione/dimensioni) e radiale (ordine/spaziatura/coerenza) |
| Appendici dispari | Sì | `lib/anatomy/generate.ts:85-88` | Media | `OddAppendagePolicy` esplicita + anomalia `WARNING` dichiarata nel descriptor |
| Collisioni anatomiche | Sì | `lib/anatomy/validate.ts` (assente) | Media | Controlli O(n²) selettivi: sovrapposizione AABB non articolata, appendici coincidenti |
| Altri problemi | Parziale | `generate.ts:243-248`, `lod.ts:29-31` | Bassa | Cache corretta ma chiave seed ambigua; LOD non ricalcolava extents: entrambi hardening |

**Evidenze empiriche della probe temporanea** (test rimosso dopo l’audit):

- `quadruped`: `groundClearance = 0.9 = max(leg.length)`; punta tip minima `y ≈ -1.3708434`; `bodyHeight = 1.313`.
- `simple-asymmetric`: larghezza riportata `1.848` contro AABB vero `1.695`.
- 5 zampe richieste: quinta appendice `side:"mid"`, direzione `(0,0,-1)` invece che verso il basso.
- Direzione speculare manomessa e radiale con `order=99` + braccio spostato: `{"ok":true,"errors":[]}`.
- Appendici coincidenti con joint/complexity coerenti: `{"ok":true,"errors":[]}`; direzione `(0,0,0)` accettata.

## 4. Bug confermati e bug smentiti

**Confermati**: tutti quelli della tabella §3, più la mancata visibilità delle anomalie dichiarate nel validatore (corretta facendo conflure i diagnostici dichiarati nei warnings).

**Smentiti / non bug**:

- Il generatore è puro e deterministico: `mulberry32`, `rd`, `canonicalJson`, nessun `Math.random`.
- La provenienza non inventa geni: solo `size`, `bodyStature`, `furDensity`, `dermalArmor` sono ammessi nelle provenienze genetiche.
- L’adattatore legacy (`descriptorFromLegacyTraits`, `descriptorFromLegacyAnatomy`) produce descriptors validi.
- I 13 body plan del catalogo sono internamente validi e componibili con `seg()`/`grp()`.
- G1/renderer **non consuma ancora** il descriptor G2: nessun impatto sui file protetti e nessuna rottura di API pubblica legacy.
- La cache era già deterministicamente corretta; la modifica alla chiave (`seed === undefined ? "n" : seed >>> 0`) è solo una disambiguazione difensiva.

## 5. Modifiche implementate

1. **Contratto additivo** (`types.ts`): `AnatomyExtents`, `AnatomyDiagnostic`, `AnatomyStatus`, `GroundClearanceStatus`; nuovi campi in `AnatomyProportions` e `declaredAnomalies` nel descriptor. `ANATOMY_SCHEMA_VERSION` resta `1`.
2. **Geometria** (`assemble.ts`): `computeAnatomicalExtents()`, `computeExtents()`, `assessGroundClearance()`; AABB da primitive reali; clearance richiede almeno 2 contatti verso il basso, approssimativamente coplanari e sotto il corpo; altrimenti `null` con `reason`.
3. **Placement** (`generate.ts`, `bodyPlan.ts`): `hostFor()` per intervallo, `clampZ()`, `fractions()`, `OddAppendagePolicy = "auto" | "center-line" | "staggered" | "omit"`, `declaredAnomalies`, jitter identico per coppie/anelli simmetrici.
4. **Validazione** (`validate.ts`): `inspectAnatomy()` con `VALID/WARNING/INVALID`, codici diagnostici e motivazioni; wrapper legacy `validateAnatomy()` invariato.
5. **LOD** (`lod.ts`): extents, altezza e clearance ricalcolati sulla geometria effettivamente ridotta.
6. **Serializzazione** (`serialize.ts`): migrazione additiva dei descriptor senza i nuovi campi; fingerprint aggiornato.
7. **Esportazioni** (`index.ts`): nuove funzioni geometriche esposte senza rimuovere nulla.
8. **Test** (`tests/anatomyG2Geometry.test.ts`): 61 test parametrizzati su body plan, geometria, simmetria, collisioni, determinismo, cache, LOD e migrazione.

## 6. Architettura finale

- Nessuna dipendenza nuova; nessun import da React, Three.js, renderer, simulazione o persistenza nel core anatomico.
- `generateAnatomy()` resta pura; la validazione approfondita resta un controllo QA/on-demand e non entra nel percorso di generazione runtime.
- Le misure sono derivate dalla geometria generata: segmenti come AABB, appendici come segmento posizione→tip con raggio; `sectionCount` non inventa curvatura perché il descriptor non memorizza angoli di sezione.
- Il piano d’appoggio è una stima anatomica interna: nessuna dipendenza da terreno, pianeta o World.
- Compatibilità: campi legacy (`bodyLength`, `bodyWidth`, `bodyHeight`, `groundClearance` in `locomotion`) conservati; `groundClearance` ora può essere `null`.

## 7. Test aggiunti

`tests/anatomyG2Geometry.test.ts` — **61 test**, parametrizzati su 13 body plan e 2 semi:

- AABB corpo/anatomico, min/max/center/size/scaledSize, `totalHeight`, separazione clearance/`maxLimbLength`.
- Corpo asimmetrico, clearance non determinabile senza zampe, rilettura di extents/clearance manomessi.
- Radici ancorate, direzioni non degenerate, assenza di coincidenze, policy dispari (`staggered`, `center-line`, `omit`) con anomalia dichiarata.
- Simmetria bilaterale (posizione, direzione, dimensioni) e radiale (ordine, spaziatura, coerenza), jitter con seme.
- Tre categorie `VALID/WARNING/INVALID`, sovrapposizioni e appendici coincidenti.
- Cache vs generazione diretta per LOD 0–3, ricalcolo extents per LOD, migrazione serialization, adattatore legacy.

## 8. Test eseguiti con risultati effettivi

| Comando | Risultato | Exit code |
|---|---|---|
| `npx vitest run tests/anatomyG2.test.ts tests/phenotypeG2.test.ts --reporter=dot` (baseline pre-modifica) | `29 passed (29)` | `0` |
| `npx vitest run tests/__g2_audit_probe.test.ts --reporter=verbose` (probe temporanea, poi rimossa) | `1 passed (1)`; evidenze in §3 | `0` |
| `npx vitest run tests/anatomyG2Geometry.test.ts --reporter=dot` | `61 passed (61)` | `0` |
| `npx vitest run tests/anatomyG2.test.ts tests/phenotypeG2.test.ts tests/anatomyG2Geometry.test.ts --reporter=dot` | `3 files passed`, `90 passed (90)` | `0` |
| `npx tsc --noEmit --pretty false` (prima della build, stato iniziale) | solo `app/layout.tsx(10,50): error TS2304: Cannot find name 'LayoutProps'.` | `2` |
| `npx next build` (dopo copia reale di `node_modules` e correzione tipi di test) | `✓ Compiled successfully`, `Finished TypeScript in 3.1s`, 3 pagine statiche generate | `0` |
| `npx tsc --noEmit --pretty false` (finale, dopo generazione tipi `.next`) | nessun output | `0` |
| `npx vitest run --reporter=dot` (G2.1 finale) | `10 failed \| 830 passed \| 1 skipped (841)` | `1` |
| `npx vitest run --reporter=dot` (baseline `main` in worktree detached) | `10 failed \| 769 passed \| 1 skipped (780)` | `1` |
| `git diff --check` | nessun errore; solo avvisi LF→CRLF | `0` |

I 10 failure della suite completa sono gli stessi in G2.1 e in `main`: `fauna180` (1), `hydrology` (1), `planet` (2), `reproduction` (2), `settlementDefaults` (1, flaky nel tempo), `vibeGenomeV1110` (3). Non riguardano `lib/anatomy/`. Il divario `769 → 830` è spiegato esattamente dai 61 nuovi test.

Nota sulla build: il primo tentativo fallì con `TurbopackInternalError: Symlink [project]/node_modules is invalid` (junction del worktree, non codice); il secondo con 10 errori TS nel nuovo test dovuti a mutazioni di campi `readonly` (corretti tipizzando i clone di tampering come `any`). Il terzo tentativo è passato con exit 0.

## 9. Performance e impatto

- Nuove dipendenze: **nessuna**.
- `computeExtents`/AABB: O(n) su segmenti+appendici; `MAX_APPENDAGES = 64`.
- Controlli di sovrapposizione/coincidenza: O(n²) ma solo in `inspectAnatomy()`, non nel percorso di generazione; n piccolo e tolleranze esplicite.
- LOD: un ulteriore passaggio O(n) per ricalcolare le misure della rappresentazione ridotta.
- Cache WeakMap/Map invariata nella semantica; fingerprint canonico aggiornato solo quando cambia il contenuto.
- Nessuna modifica a simulazione, genetica, evoluzione, G1, Three.js, salvataggi.

## 10. File modificati

Implementazione (commit `958a60e`):

- `lib/anatomy/types.ts`
- `lib/anatomy/bodyPlan.ts`
- `lib/anatomy/generate.ts`
- `lib/anatomy/assemble.ts`
- `lib/anatomy/lod.ts`
- `lib/anatomy/validate.ts`
- `lib/anatomy/serialize.ts`
- `lib/anatomy/index.ts`
- `tests/anatomyG2Geometry.test.ts` (nuovo)

Documentazione (commit successivo):

- `docs/graphics/G2_1_ANATOMICAL_HARDENING_REPORT.md` (nuovo)

Totale implementazione: **9 file, +843 / −122 righe**.

## 11. File protetti verificati

`git diff --name-only` sull’implementazione elenca solo i 9 file sopra. Verificati **non modificati**: `simulation/**`, `lib/phenotype/**`, genetica/motore biologico, sistemi evolutivi, `components/**`, `lib/visual/**`, G1 renderer, Three.js, salvataggi/persistenza, `package.json`, `tsconfig.json`. Il checkout originale con il lavoro E2 di altri agenti è rimasto separato e intatto.

## 12. Problemi residui

- La stima di ground clearance è attendibile solo con zampe sufficientemente rivolte verso il basso e coplanari; in tutti gli altri casi restituisce `null` invece di un numero.
- Le appendici G2 sono primitive rette: AABB e test di coincidenza non modellano curvature, mesh o volume articolato.
- I controlli di sovrapposizione sono selettivi e producono `WARNING`, non `INVALID`, perché le sovrapposizioni alle articolazioni sono biologicamente necessarie.
- I gruppi bilaterali con conteggio dispari restano `WARNING` dichiarati: la geometria è valida ma non esattamente speculare, e questo viene esplicitato invece di essere nascosto.
- Non esiste ancora un consumer G1/renderer del descriptor G2: la compatibilità è verificata a livello di contratto e test, non end-to-end visiva.
- La suite completa del repository ha failure preesistenti/flaky fuori da G2; non sono state modificate perché protette e fuori scope.

## 13. Limiti scientifici

- Il body plan non è codificato da geni: resta input esplicito, default legacy o scelta speculativa dichiarata. G2.1 non introduce biologia inventata.
- Il fenotipo morfologico disponibile è limitato a 4 geni; extents e clearance riflettono la geometria generata, non misurazioni biologiche reali.
- La tolleranza di simmetria (`1e-4`, arrotondamento `1e-6`) è una tolleranza di rappresentazione numerica, non un modello di variazione biologica.
- Ground clearance e piano d’appoggio sono approssimazioni geometriche statiche: non modellano deformazione, postura dinamica, gravità o interazione con il terreno.
- Nessuna conclusione evolutiva o ecologica può essere tratta da questi descriptors.

## 14. Commit SHA

- Base: `d330c12f345ab26ab7405b908c729e2e2f6bcc22`
- Implementazione G2.1: `958a60e38dd109c81c7a4d2917c77a880e782ea1`
- Questo report è contenuto nel commit documentale successivo sullo stesso branch (`git log -1 --format=%H`).

## 15. Stato del branch

- Branch locale `graphics/g2-anatomy-hardening`, 2 commit sopra `main` (implementazione + report).
- Nessun merge, nessun PR, nessuna modifica a `main` o ad altri branch.
- Working tree pulito dopo il commit del report; `node_modules` è una copia fisica ignorata da Git e non fa parte del diff.
- Pronto per review indipendente.

## 16. Raccomandazione

**Approvabile per lo scope G2.1.** I difetti confermati sono corretti, i test geometrici mirati e la build passano, TypeScript passa, API legacy e file protetti sono preservati e non risultano nuove regressioni rispetto a `main`. La raccomandazione è di procedere con la review senza merge automatico; prima di un’integrazione andranno gestiti separatamente i failure preesistenti della suite completa e, in un mandato dedicato, il collegamento end-to-end al renderer G1.
