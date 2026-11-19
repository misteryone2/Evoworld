# EvoWorld — Graphics Revolution: Coordinamento multiagente

> Documento di coordinamento. **Aggiornare a ogni intervento significativo.**  
> Fonte audit: `GRAPHICS_AUDIT_G0.md` (2026-11-16, agente Big Pickle).  
> **Stato workspace:** clone git in `Evoworld-git/`, branch `graphics/g1-creature-visuals`, PR **#1** aperta verso `main` (main non toccato). Verifiche eseguite con **Node v22.14.0 portable** in `%TEMP%\opencode` (non installato a sistema). Dettaglio esiti: `G1_IMPLEMENTATION_REPORT.md` §6 e §9.

## Stato fasi
| Fase | Stato | Owner | Note |
|---|---|---|---|
| G0 — Audit e baseline | **Audit completato. Baseline build/test eseguita; mancano misure runtime PC/mobile** | Big Pickle | Vedi §Baseline |
| G1 — Architettura grafica e contratto dati | **Contratto implementato e verificato (build+typecheck+12 test); adozione parziale nel 3D; refactor modulare G1-b completato (API invariata)** | Big Pickle | `lib/visual/creatureVisualDescriptor.ts`, `tests/creatureVisualDescriptor.test.ts`, `components/simulation/planet3d/*`; vedi `G1_IMPLEMENTATION_REPORT.md` §6 e §9 |
| G2 — Creature e anatomia | **Parziale: pass visuale 2D/3D (materiali, colore per individuo, luce di riempimento, dettagli 2D); smoke desktop eseguito** | Big Pickle | Build/test verdi sul nuovo codice; smoke browser desktop 3D "Completa" + mappa 2D senza errori console (`G1_IMPLEMENTATION_REPORT.md` §7); mancano mobile e carichi forzati |
| G3 — Materiali e dettagli | **Parziale: materiali creature (roughness/metalness) + luce di riempimento** | Big Pickle | Restano PBR/texture reali e materiali terreno/acqua |
| G4 — Animazioni | Non iniziata (posa procedurale esistente invariata) | — | Dipende da G2 |
| G5 — Ambiente e vegetazione | Non iniziata | — | Parallelizzabile |
| G6 — Ecosistema e interazioni | Non iniziata | — | Richiede segnali reali sim |
| G7 — Interfaccia | Non iniziata | — | Parallelizzabile con attenzione a `app/page.tsx` |
| G8 — Ottimizzazione PC/mobile | **Parziale: guardie di costo nel 2D (dettaglio solo sopra soglia px); micro-misura CPU fatta, nessuna misura GPU/browser** | Big Pickle | Misure FPS/p95 rinviate |
| G9 — Integrazione e collaudo | Non iniziata | — | Richiede ambiente di test reale |

## Baseline (risultati reali, 2026-11-16)
- **Commit/branch:** _checkout locale `Evoworld-main/` senza `.git`; commit sconosciuto_
- **Runtime:** Node v22.14.0 (portable), npm 10.9.2, Next 16.3.0, vitest 4.1.12
- **Install:** `npm install --legacy-peer-deps` → 391 pacchetti (npm 10.9.2 fallisce senza flag: bug `edgesOut`)
- **Build (`next build`):** ✅ compilata in 25.0s, TypeScript 57s, 3/3 pagine statiche
- **Typecheck (`tsc --noEmit`):** ✅ exit 0
- **Test (`vitest run`):** ⚠️ 687/698 pass, 10 fail, 1 skip; 6 file falliti, tutti in aree non grafiche (world-gen/sim/genoma), parte flaky. Nuovo `creatureVisualDescriptor.test.ts`: 12/12 pass.
- **Benchmark/profiling:** solo micro-misura CPU Node (nessuna GPU/browser): `updateCreatureInstances` ~1.0/1.9/2.1/6.4 ms per 100/500/1500/3000; descriptor ~4.2 ms per 3000.
- **Carichi target misurati (100/500/1500/3000):** solo CPU-side, non FPS
- **Piattaforme verificate (PC/mobile):** ❌ nessuna verifica browser/GPU
- **Dopo G1-b (2026-11-17):** `tsc --noEmit` exit 0, `next build` OK, suite completa 684 pass/13 fail/1 skip (baseline stash 682/15/1 → flaky), smoke browser 3D+2D senza errori console; FPS non confrontabile per throttling della finestra non visibile. Dettagli: `G1_IMPLEMENTATION_REPORT.md` §9.

## File hotspot (coordinare prima di modificare)
- `components/simulation/Planet3DView.tsx` — **caldo** (renderer principale, monolitico)
- `app/page.tsx` — **caldo** (wiring viste/camera/quality/UI)
- `lib/qualityProfile.ts`, hook qualità — impatto trasversale
- `components/simulation/PlanetCanvas.tsx`, `localScene.ts`, `lib/bodyAnimation.ts`, `lib/animationLod.ts`, `lib/motionInterpolation.ts`, `lib/livingBehavior.ts`
- `types/index.ts`, `simulation/core/renderFrame.ts` — **solo modifiche additive/approvate**

## Attività in corso
| Agente | Attività | File/area | Inizio | Stato |
|---|---|---|---|---|
| Big Pickle | G1 descriptor + pass visuale creature (2D/3D) | `lib/visual/*`, `components/simulation/drawCreature.ts`, `components/simulation/Planet3DView.tsx`, `tests/creatureVisualDescriptor.test.ts` | 2026-11-16 | Implementato; build+typecheck OK; 12/12 test nuovo modulo; smoke browser desktop 3D+2D senza errori; mobile mancante |
| Big Pickle | G1-b refactor modulare del renderer 3D | `components/simulation/Planet3DView.tsx`, `components/simulation/planet3d/*` | 2026-11-17 | Completato su branch PR #1; 2199 → 1072 righe nel componente, API riesportata; build+typecheck OK, suite completa nel range flaky noto, smoke browser 3D+2D senza errori |

## Attività completate
- 2026-11-16 — **Big Pickle:** audit tecnico G0; proposta `CreatureVisualDescriptor` read-only; mappa rischi/priorità.
- 2026-11-16 — **Big Pickle:** deliverable G1 di design: `G1_VISUAL_DESCRIPTOR_SPEC.md`, `G1_RENDERER_ARCHITECTURE.md`.
- 2026-11-16 — **Big Pickle:** **implementazione G1** in `lib/visual/` (tipi + `buildCreatureVisualDescriptor` + helper deterministici) e **adozione parziale** nel renderer 3D per la variazione cromatica per individuo (zero allocazioni extra). Aggiunto test puro `tests/creatureVisualDescriptor.test.ts`.
- 2026-11-16 — **Big Pickle:** pass visuale creature senza toccare la sim:
  - 3D: materiali `MeshStandardMaterial` differenziati (roughness/metalness per parte; occhi lucidi), luce di riempimento direzionale debole, colore per individuo stabile (tinta di specie ± jitter).
  - 2D: volume (gradiente), ventre, coda, accenno arti, occhio con pupilla/riflesso, spine triangolari, ombra; **decorazioni attive solo sopra soglie di raggio** per non peggiorare il costo per frame.
  - Nessuna modifica a genetica/mutazioni/selezione/riproduzione/metabolismo/energia/comportamento/predazione/ecologia.
- 2026-11-16 — **Big Pickle:** **verifica reale** (Node v22.14.0 portable): `next build` OK (25.0s), `tsc --noEmit` exit 0, nuovo test 12/12, suite completa 687/698 (10 fail preesistenti/flaky in world-gen/sim/genoma). Micro-misura CPU di `updateCreatureInstances` e descriptor. Dettagli: `G1_IMPLEMENTATION_REPORT.md` §6.
- 2026-11-16 — **Big Pickle:** branch `graphics/g1-creature-visuals` pubblicato sul remoto e PR **#1** aperta verso `main` (main non toccato). Smoke test browser desktop (Chromium in-app, `next dev`): 3D profilo "Completa" e mappa 2D senza errori console; rAF 3D stabile a 30.0 fps (cap del loop, p95 33.5 ms); CPU main-thread ~17% in 3D e ~4.3% in 2D. Popolazione non forzata; mobile e build di produzione ancora da fare. Dettagli: `G1_IMPLEMENTATION_REPORT.md` §7.
- 2026-11-17 — **Big Pickle:** **G1-b — refactor modulare di `Planet3DView`**: 9 moduli in `components/simulation/planet3d/` (costanti, tipi, terreno/tier, cielo, sole, sampling, camera, anello selezione, instancing creature); componente 2199 → 1072 righe. API storica preservata tramite re-export, nessun chiamante o test modificato, scratch per modulo senza stato condiviso, zero modifiche alla simulazione. Verifica: `tsc --noEmit` exit 0, `next build` OK, test mirati 184 pass/2 fail preesistenti, suite completa 684 pass/13 fail/1 skip (baseline stash 682/15/1 → flaky). Smoke browser su `127.0.0.1:3101`: 3D "Completa", tre modalità camera e mappa 2D senza errori console; misura FPS non confrontabile per finestra desktop non visibile (throttling ~1 fps), nuovi screenshot non acquisibili. Dettagli: `G1_IMPLEMENTATION_REPORT.md` §9.

## Decisioni architetturali (ADR-lite)
| ID | Decisione | Motivazione | Stato |
|---|---|---|---|
| D-001 | Separazione rigorosa sim biologica / rendering | Vincolo di progetto; evitare regressioni evolutive | **Confermata** |
| D-002 | Introdurre `CreatureVisualDescriptor` read-only come boundary | Coerenza visiva, testabilità, niente duplicazione logica sim | **Implementata (G1)**: contratto + helper in `lib/visual/`, adozione parziale |
| D-003 | Evoluzione incrementale con LOD/quality tiers, no riscrittura big-bang | Sostenibilità PC/mobile e lavoro parallelo | **Confermata** (pass visuale additivo) |
| D-004 | Variazione cromatica per individuo deterministica (hash `organismId`) | Popolazione non monocroma senza random runtime, 2D/3D coerenti | **Implementata** |
| D-005 | Dettaglio 2D condizionato al raggio (px) | Evitare gradienti/particelle su punti minuscoli, proteggere il frame budget | **Implementata, da misurare** |
| D-006 | G1-b: split di `Planet3DView` in moduli + re-export dell'API storica | Manutenibilità e riutilizzo senza rompere chiamanti/test; nessun cambiamento di comportamento | **Implementata** |
| D-007 | Scratch temporaneo privato per modulo (non condiviso) | Evitare interferenze tra camera, terreno e loop creature durante il refactor | **Implementata** |

## Dipendenze e conflitti
- **Dipendenze:** G2–G4 dipendono da G1 (descriptor/moduli); G8/G9 richiedono baseline e strumentazione.
- **Conflitti noti:** `Planet3DView.tsx` (hotspot) ora è un orchestratore che importa i moduli in `components/simulation/planet3d/` e riesporta l'API storica: prima di modify quei moduli, coordinarsi con l'owner G1-b. `drawCreature.ts` riscritto internamente con la stessa firma pubblica. Nessun altro agente rilevato nel checkout locale.

## Problemi aperti
1. **Baseline completa:** build/typecheck/test eseguiti con Node portatile (vedi §Baseline). Restano da eseguire benchmark runtime e misure FPS/p95 su PC/mobile reali.
2. Presenza/assenza di altri branch, PR o doc di coordinamento remoti non verificata (checkout senza `.git`).
3. Dettaglio componenti UI/HUD e `localScene` non auditato a runtime.
4. **Test suite:** 10 fail (su 698) in world-gen/sim/genoma, in parte flaky; 1 accertato preesistente (`addBellyGradient` 1.08 vs test che si aspetta 1.0). Da confermare su baseline git pulita.
5. **Refactor modulare G1-b completato** (§9 del report): parità API/test verificata; restano da fare i confronti visivi a parità di seed e le misure FPS reali.
6. **G2–G9 completi** richiedono: GPU/browser reali (PC+mobile), asset/material tuning, misure FPS/p95 e coordinamento con altri agenti sugli hotspot.
7. **npm 10.9.2:** `npm install` fallisce senza `--legacy-peer-deps` (bug `edgesOut`); usare npm 11+ o il flag.

## Protocollo suggerito per gli agenti
- Prima di modificare: dichiarare intento in questo file + identificare owner/lock soft del file.
- Commit/patch piccoli e tematici; mai includere modifiche altrui non verificate.
- Non modificare `simulation/biology|ecology|evolution|core` rules, formati salvataggio, né introdurre dipendenze architetturali importanti senza decisione registrata.
- Ogni risultato di test/benchmark deve indicare comando, ambiente, commit e esito reale.
