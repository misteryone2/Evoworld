# G3 — Final Limitations

**Data:** 2026-11-18  
**Branch:** `graphics/g3-renderer-integration` (da `graphics/g-final-consolidation` @ `27995b0`)  
Questo documento elenca limiti noti, scelte di progetto e verifiche non eseguibili. Integra — senza sostituirli — `G_FINAL_KNOWN_LIMITATIONS.md` e i report G3. Aggiornamenti di questa sessione (cache, performance, pool, StatsPanel, benchmark fino a 10000) sono in `G3_CACHE_PERFORMANCE_STATS_REPORT.md`.

---

## 1. Limiti di progetto

1. **Il body plan non è codificato geneticamente.** Il genoma non contiene un gene che specifichi la struttura corporea. `speculativeBodyPlanId(speciesId)` sceglie un piano in modo deterministico con origine dichiarata `seeded-speculative` e provenienza `undetermined`. Non va interpretato come una verità biologica: è una scelta di rendering.
2. **Canale MOR minimo.** Il `RenderFrame` trasporta solo `bodyStature`, `furDensity`, `dermalArmor` e la maschera di presenza. Tutti gli altri tratti morfologici non sono disponibili al renderer senza estendere il contratto del frame.
3. **Tetti dei pool.** `RENDER_POOL_LIMITS` (32 segmenti, 64 appendici, 16 occhi) è un limite dichiarato: oltre questi valori il piano diventa `unsupported` e la creatura usa il fallback legacy. Nessuna parte viene tagliata silenziosamente, ma le anatomie eccedenti non vengono disegnate con geometria G3.
4. **Capacità iniziale ≠ tetto.** `GENERIC_RENDER_SLOTS` (6/12/2) è la capacità di partenza; la crescita con headroom 25% arrotondato a 64 aumenta la memoria CPU delle istanze (fino a ~13.7 MB nei proxy di benchmark a 3000 creature).
5. **Costo per frame maggiore (ridisimensionato).** Il documento storico riportava 80.1 vs 69.5 ms a 3000 creature. Dopo validazione memoizzata dei piani e layout denso dei pool, il benchmark riprodotto su questa macchina misura 31.2 ms per G3 ottimizzato e 24.5 ms per G2 attuale a 3000 (baseline pre-ottimizzazione: 65.2 e 53.8 ms). Il divario residuo è il costo della fedeltà: tutte le parti anatomiche vengono emesse. Ogni ottimizzazione che tagliasse parti violerebbe il requisito di assenza di perdite silenziose.
6. **Fallback legacy.** Frame senza MOR, geni corrotti o piani fuori capacità ricadono sul rendering G1. È un comportamento dichiarato e misurabile (`renderStats.fallback`, `fallbackReasons`), non un errore.
7. **Renderer non proprietario della biologia.** L’unica modifica sotto `simulation/**` è l’aggiunta di 26 righe in `renderFrame.ts` per copiare i tre valori MOR. Biologia, evoluzione, persistence, salvataggi e caricamenti sono invariati.
8. **Snapshot QA solo dev.** `window.__EVOWORLD_G3__` è esposto solo in development; non è un’API pubblica e non va usato in produzione.

---

## 2. Limiti ambientali e di toolchain

1. **`npm install` non utilizzabile.** Con `--no-package-lock --no-audit --no-fund` fallisce con `npm error Cannot read properties of null (reading 'edgesOut')`. È stata usata una junction `node_modules` verso `Evoworld-g-final\node_modules`, ignorata da Git e **non deliverable**. Nessuna dipendenza è stata aggiunta.
2. **Build Turbopack non eseguibile.** La junction punta fuori dalla root del filesystem e Turbopack abortisce con `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. La build è stata completata con `npx next build --webpack` (exit 0, 2 route statiche).
3. **Screenshot nativo non disponibile.** `browser.screenshot` richiede una finestra desktop visibile. Le catture sono state ottenute via `toDataURL` in `requestAnimationFrame` (il buffer WebGL non è preservato fuori dal frame).
4. **Heap snapshot non trasferibile.** Supera il limite di 5 MiB dello strumento. Proxy usati: `renderer.info.memory` e `performance.memory`.
5. **Mobile reale non verificato.** L’override di `innerWidth/innerHeight` non attiva il breakpoint mobile in modalità immersiva (`visualViewport.width` resta 912). Il layout responsive su dispositivo touch resta da verificare.
6. **Nessuna misura GPU.** Il benchmark Node non ha un `WebGLRenderer`: FPS, upload, fill-rate e memoria GPU sono dichiarati `null`; i dati browser disponibili sono draw call, geometrie, texture e heap JS.

---

## 3. Difetti pre-esistenti (non introdotti da G3)

1. **Suite completa:** `7 failed | 911 passed | 1 skipped (919)`. La baseline G_FINAL era `11 failed | 889 passed | 1 skipped (901)`. I 7 fallimenti sono in `fauna180`, `hydrology`, `reproduction`, `settlementDefaults`, `vibeGenome` (biologia/simulazione). Nessuno riguarda il renderer. Non sono stati corretti per non alterare aspettative di test fuori dal percorso G3.
2. **`StatsPanel` — `TypeError: value.toFixed is not a function` ( RISOLTO ).** Il riferimento storico a `StatsPanel.tsx:171` è obsoleto (il file ha 84 righe). La causa reale è `averageGenome.ext`, un oggetto `Record<string, number>` passato a `toFixed()`: il difetto è pre-esistente e indipendente dagli organismi morti. Ora `lib/formatAverageGenome.ts` converte i tratti base e i 20 geni estesi in righe numeriche; 4 test dedicati e QA browser confermano la correzione. Vedi il report A–I.
3. **`NotFoundError: setPointerCapture`** durante la QA: deriva da eventi pointer sintetici senza pointer reale attivo. Non riprodotto con input umano.

---

## 4. Verifiche non eseguite

- Confronto visivo pixel-perfect G3 vs G_FINAL (sono state verificate integrità e statistiche pixel, non equivalenza estetica).
- Mobile reale / emulazione viewport completa.
- Profilazione CPU/GPU di Chromium, trace di rendering e misura FPS in scena reale.
- Test di longevità oltre la sessione QA (nessun test di molte ore o migliaia di cicli di qualità).
- Popolazioni superiori a 10000 nel benchmark (100/500/1500/3000/5000/10000 ora eseguiti) e oltre 86 organismi in browser.
- Dispositivi con WebGL1-only o senza supporto `InstancedMesh` (la baseline G_FINAL già dichiarava requisiti WebGL2).

---

## 5. Ambito della consegna

- Nessun commit, merge, push, chiusura di PR o release su altri rami: solo il branch `graphics/g3-renderer-integration`.
- I report G1/G2/G_FINAL restano validi come baseline storica.
- La junction `node_modules` e gli artefatti QA in `C:\Users\matti\AppData\Local\Temp\opencode\g3-qa\` non fanno parte della consegna.
