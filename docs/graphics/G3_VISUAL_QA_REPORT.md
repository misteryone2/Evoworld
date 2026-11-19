# G3 — Visual QA Report

**Data:** 2026-11-18  
**Ambiente:** Chromium integrato in OpenCode, `http://localhost:3000`, dev server `npx next dev --webpack -p 3000`  
**Strumento:** browser reale con accesso a DOM, console, `renderer.info` e snapshot dev-only `window.__EVOWORLD_G3__.snapshot()`

---

## 1. Metodo

La QA è stata eseguita su una simulazione reale avviata dalla schermata iniziale (“Genera pianeta casuale”), non su un fixture. Per ogni scenario sono stati verificati:

- snapshot G3 (`anatomySource`, `renderStats`, `rendererInfo`);
- dimensione canvas e DPR;
- assenza di errori console;
- integrità visiva tramite statistiche sui pixel del canvas catturato in `requestAnimationFrame`.

Lo screenshot nativo del tab (`browser.screenshot`) non è utilizzabile perché la finestra desktop del browser non è visibile nell’ambiente. In alternativa il canvas WebGL è stato catturato con `toDataURL` **dentro un `requestAnimationFrame`**: il buffer non è preservato, quindi una cattura fuori dal frame restituisce nero. Le catture valide sono state salvate come artefatti locali (fuori dal repository, non deliverable):

- `C:\Users\matti\AppData\Local\Temp\opencode\g3-qa\g3-qa-basso.png` (264.302 byte)
- `C:\Users\matti\AppData\Local\Temp\opencode\g3-qa\g3-qa-medio.png` (395.978 byte)
- `C:\Users\matti\AppData\Local\Temp\opencode\g3-qa\g3-qa-alto.png` (198.916 byte)

---

## 2. Matrice qualità

| Qualità | Canvas (px) | DPR | Creature | Draw call | Geometrie | Texture | Fallback | Parti perse |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Basso | 1000 × 700 | 1.25 | 79 → 266 | 12 | 21 | 4–5 | 0 | 0 |
| Medio | 1250 × 875 | 1.25 | 95 → 269 | 23 | 22 | 5–6 | 0 | 0 |
| Alto | 1250 × 875 | 1.25 | 150 → 1217 | 26–46 | 21–24 | 6–8 | 0 | 0 |

Statistiche pixel delle catture (64 × 64, colori quantizzati a 5 bit):

| Qualità | Colori distinti | Luminanza media | Frazione non scura |
|---|---:|---:|---:|
| Basso | 245 | 130.3 | 0.986 |
| Medio | 265 | 129.2 | 0.985 |
| Alto (campione rAF iniziale) | 352 | 125.6 | — |

Le immagini mostrano terreno, creature e HUD con colori e luminanza coerenti tra i livelli: nessun canvas vuoto, nero o parzialmente disegnato. La frazione non scura non è stata registrata per il campione alto; la validità di quella cattura è attestata dal numero di colori distinti e dalla luminanza.

Nota: il primo campione del livello medio è stato raccolto durante il rimontaggio della vista (`key={quality.level}`), quando `rendererInfo` è momentaneamente a zero. Ricontrollato a loop stabilizzato: 95 creature, 23 draw call, 0 fallback.

---

## 3. Interazioni verificate

| Verifica | Metodo | Esito |
|---|---|---|
| Animazione / avanzamento simulazione | lettura del contatore “Anno” e dello snapshot nel tempo | OK — popolazione e cache evolvono (entries 150 → 1217, `generated`/`reused`/`pruned` coerenti) |
| Rotazione (orbit) | eventi `pointerdown`/`pointermove`/`pointerup` sintetici sul canvas | OK — hash pixel prima/dopo cambiato (2347674132 → 3137311219) |
| Zoom | `WheelEvent` sul canvas | OK — hash pixel cambiato (3137311219 → 819928282) |
| Orbit → Libera → Follow | bottoni reali “🌍 Dall’alto”, “🚶 Libera”, “🐾 Terza persona” | OK — modalità attive, hint aggiornati, 0 fallback |
| Selezione in follow | ingresso in terza persona (seleziona un organismo casuale) e pannello “Organismo #389” | OK — pannello e richiesta di dettaglio compaiono |
| Cambio organismo / zoom in follow | bottoni “Animale successivo/precedente”, “Più vicino” | OK — comandi presenti e attivi; il testo visualizzato dipende dal fatto che l’animale sia ancora vivo |
| Molte creature | simulazione fino a 1217 animali | OK — 26–46 draw call, 0 fallback, 0 parti perse |
| Context loss / restore | `WEBGL_lose_context.loseContext()` / `restoreContext()` | OK — `isContextLost` true → false, snapshot invariato, 0 errori console |
| Leak proxy | 6 cicli di cambio qualità + `renderer.info` / `performance.memory` | OK — geometrie 22, texture 8 a fine sessione; JS heap 121.9 MB / limite 4192 MB |
| Console (flusso nominale) | `browser.console(level: error)` | OK — 0 errori fino all’uscita dalla modalità immersiva |

Gli snapshot G3 durante tutte le interazioni hanno mantenuto `droppedParts = 0`, `fallback = 0`, `unsupported = 0`, `poolGrowth = []` e capacità iniziale 6/12/2: le anatomie generate rientrano nella capacità di partenza.

---

## 4. Errori e anomalie osservate

1. **`NotFoundError: Failed to execute 'setPointerCapture'`** — generato dagli eventi pointer sintetici usati nella QA (nessun pointer reale attivo). Non è un difetto applicativo: non compare nel flusso nominale con input umano.
2. **`TypeError: value.toFixed is not a function` in `StatsPanel.tsx:171`** — emerso solo uscendo dalla modalità immersiva con un organismo selezionato e poi defunto. `StatsPanel` non è stato modificato da G3 (`git diff --stat` conferma solo `renderFrame.ts` lato simulazione). Bug pre-esistente, documentato in `G3_FINAL_LIMITATIONS.md`.
3. Primo campione medio a zero — artefatto di misura durante il rimontaggio, non difetto di rendering (vedi §2).

---

## 5. Verifiche non eseguibili in questo ambiente

- **Mobile reale / emulate completa:** l’override di `window.innerWidth/innerHeight` a 390 × 844 non attiva il layout mobile: l’app resta in modalità immersiva e `window.visualViewport.width` rimane 912 (`matchMedia('(max-width: 700px)')` false). Non è stato possibile verificare il layout responsive su touchscreen reale.
- **Screenshot nativo del browser:** richiede finestra desktop visibile; non disponibile. Sostituito dalle catture canvas in `requestAnimationFrame` descritte in §1.
- **Heap snapshot completo:** supera il limite di trasferimento di 5 MiB dello strumento. Sostituito da `renderer.info` e `performance.memory`.
- **FPS reali e memoria GPU:** non esposti dal contesto di QA; il benchmark Node li dichiara esplicitamente `null`.
- **Confronto visivo pixel-perfect con G_FINAL:** non eseguito. Le catture G3 sono state validate per integrità (colori, luminanza, assenza di canvas nero), non per equivalenza estetica con la baseline.

---

## 6. Conclusione

Il flusso G3 è visivamente stabile su qualità bassa, media e alta, con animazione, rotazione, zoom, navigazione camera, selezione, popolazioni oltre 1000 creature e recupero da context loss. Nessuna fallback o perdita di parte anatomica è stata osservata nel percorso nominale. Le due anomalie rilevate sono una conseguenza degli input sintetici e un bug pre-esistente fuori dal percorso G3.
