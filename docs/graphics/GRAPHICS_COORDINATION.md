# EvoWorld — Graphics Revolution: Coordinamento multiagente

> Documento di coordinamento (bozza iniziale, G0). **Aggiornare a ogni intervento significativo.**  
> Fonte audit: `GRAPHICS_AUDIT_G0.md` (2026-11-16, agente Big Pickle).  
> **Attenzione:** creato in workspace locale non-repo; se il repository viene clonato, spostare/integrare questo file nel repo (es. root o `docs/graphics/`) e allinearlo con eventuali doc di coordinamento già presenti.

## Stato fasi
| Fase | Stato | Owner | Note |
|---|---|---|---|
| G0 — Audit e baseline | **In corso (audit prodotto, baseline runtime non eseguita)** | Big Pickle (audit) | Build/test/profiling da eseguire su checkout reale |
| G1 — Architettura grafica e contratto dati | Non iniziata | — | Proposta: `CreatureVisualDescriptor` read-only + modularizzazione renderer |
| G2 — Creature e anatomia | Non iniziata | — | Dipende da G1 |
| G3 — Materiali e dettagli | Non iniziata | — | Dipende da G1/G2 |
| G4 — Animazioni | Non iniziata | — | Dipende da G2 |
| G5 — Ambiente e vegetazione | Non iniziata | — | Parallelizzabile parzialmente dopo G1 |
| G6 — Ecosistema e interazioni | Non iniziata | — | Richiede segnali reali sim |
| G7 — Interfaccia | Non iniziata | — | Parallelizzabile con attenzione a `app/page.tsx` |
| G8 — Ottimizzazione PC/mobile | Non iniziata | — | Continuativa, milestone dedicata |
| G9 — Integrazione e collaudo | Non iniziata | — | Finale |

## Baseline (da compilare con risultati reali)
- **Commit/branch:** _sconosciuto in questa sessione (nessun checkout locale)_
- **Build (`next build`):** _non eseguita_
- **Typecheck (`tsc --noEmit`):** _non eseguita_
- **Test (`vitest run`):** _non eseguiti_ (atteso da maintainer v1.11.0: 680/685 pass, 5 fail noti — non verificato)
- **Benchmark/profiling:** _non eseguito_
- **Carichi target misurati (100/500/1500/3000):** _no_
- **Piattaforme verificate (PC/mobile):** _no_

## File hotspot (coordinare prima di modificare)
- `components/simulation/Planet3DView.tsx` — **caldo** (renderer principale, monolitico)
- `app/page.tsx` — **caldo** (wiring viste/camera/quality/UI)
- `lib/qualityProfile.ts`, hook qualità — impatto trasversale
- `components/simulation/PlanetCanvas.tsx`, `localScene.ts`, `lib/bodyAnimation.ts`, `lib/animationLod.ts`, `lib/motionInterpolation.ts`, `lib/livingBehavior.ts`
- `types/index.ts`, `simulation/core/renderFrame.ts` — **solo modifiche additive/approvate**

## Attività in corso
| Agente | Attività | File/area | Inizio | Stato |
|---|---|---|---|---|
| Big Pickle | Audit G0 + doc coordinamento/descriptor (bozza) | `GRAPHICS_AUDIT_G0.md`, `GRAPHICS_COORDINATION.md` | 2026-11-16 | Completato (deliverable locale) |

## Attività completate
- 2026-11-16 — **Big Pickle:** audit tecnico G0 basato su repo remoto; proposta `CreatureVisualDescriptor` read-only; mappa rischi/priorità.

## Decisioni architetturali (ADR-lite)
| ID | Decisione | Motivazione | Stato |
|---|---|---|---|
| D-001 | Separazione rigorosa sim biologica / rendering | Vincolo di progetto; evitare regressioni evolutive | **Confermata** |
| D-002 | Introdurre `CreatureVisualDescriptor` read-only come boundary | Coerenza visiva, testabilità, niente duplicazione logica sim | **Proposta (G1)** |
| D-003 | Evoluzione incrementale con LOD/quality tiers, no riscrittura big-bang | Sostenibilità PC/mobile e lavoro parallelo | **Proposta** |

## Dipendenze e conflitti
- **Dipendenze:** G2–G4 dipendono da G1 (descriptor/moduli); G8/G9 richiedono baseline e strumentazione.
- **Conflitti noti:** nessuno rilevato (workspace vuoto). Verificare in repo reale prima di edit.

## Problemi aperti
1. Baseline build/test/profiling non eseguita in questa sessione.
2. Presenza/assenza di altri branch, PR o doc di coordinamento remoti non verificata.
3. Dettaglio componenti UI/HUD e `localScene` non completamente auditato a runtime.
4. 5 test dichiarati falliti in v1.11.0 (preesistenti/incoerenze) da confermare su baseline attuale.

## Protocollo suggerito per gli agenti
- Prima di modificare: dichiarare intento in questo file + identificare owner/lock soft del file.
- Commit/patch piccoli e tematici; mai includere modifiche altrui non verificate.
- Non modificare `simulation/biology|ecology|evolution|core` rules, formati salvataggio, né introdurre dipendenze architetturali importanti senza decisione registrata.
- Ogni risultato di test/benchmark deve indicare comando, ambiente, commit e esito reale.
