# PLANET RISK REGISTER — EvoWorld Planet Engine

Registro rischi aggiornato al 2026-11-20. Probabilità/Impatto: `bassa`, `media`, `alta`. Stato: `APERTO`, `MITIGATO`, `MONITORATO`, `BLOCKED`.

| ID | Rischio | Prob. | Impatto | Evidenza | Mitigazione | Trigger | Stato |
|---|---|---|---|---|---|---|---|
| R01 | Conflitto con sviluppo parallelo GENOME su tipi/contratti condivisi | media | alta | Branch `milestone/genome/gen0-audit`; `GENOMA-v1.11.0.md`; `types/index.ts` contiene tipi biologia | Nuovi tipi in `simulation/planetEngine/contracts.ts`; nessuna modifica a `simulation/biology/**` o `types/index.ts` in M1-M4; revisione diff prima di ogni commit | Conflitto su `types/index.ts` o su file biology | APERTO |
| R02 | Approssimazioni presentate come modello fisico | alta | alta | `seasons.ts:45-47`, `terrainNoise.ts:77-95`, `hydrology.ts:23-40` sono euristici | Tag obbligatori nei commenti di modulo; documentazione che distingua PHYSICAL_MODEL/APPROXIMATION/HEURISTIC/VISUAL_EFFECT; review Pandora | Nuovo modulo senza tag o con costanti non derivate | APERTO |
| R03 | Causalità rotta da parametri indipendenti | alta | alta | `water` fBm separato, sole fisso, cloud wind costante | Grafo delle dipendenze in `PLANET_ARCHITECTURE.md`; test di monotonicità e conservation; rimozione progressiva delle soglie legacy | Aggiunta di un parametro climatico senza dipendenza da stella/atmosfera/idrosfera | APERTO |
| R04 | Determinismo non riproducibile tra runtime Node | media | media | `E1_3_SCIENTIFIC_INTEGRITY_REPORT.md:84,131-134`: Node 22 vs 26 divergono | Pin Node 22 nella validazione; wrapper trigonometrico controllato; `engineVersion` nello snapshot | Test determinism fallisce su Node diverso | MONITORATO |
| R05 | Timeout test load-dependent confusi con regressioni | alta | media | Baseline 14 fail con carico parallelo; riverifica planetaria 76/76 pass | Riveriche mirate senza carico; `--testTimeout=30000`; registrare contesto ambientale | Nuovo timeout in test planetari a carico normale | MITIGATO |
| R06 | Fallimenti preesistenti non risolti | alta | media | `LEGGIMI.txt:11`, baseline: 5 noti (`fauna180`, `reproduction`, `vibeGenomeV1110`) | Non toccare; confrontare conteggio prima/dopo ogni milestone; segnalare a Pandora | Aumento del numero di fallimenti oltre 14 | MONITORATO |
| R07 | Viewport obsoleto dopo reset/cambio pianeta | media | alta | `useMultiverse.ts:119-122,293-295`: nessun correlation id; `Planet3DView.tsx:671,997-1004` | Aggiungere request id e validazione tick/planet in M6; test risposta tardiva | Cambio pianeta in modalità follow/free con texture vecchia | APERTO |
| R08 | Promise pending dopo terminate/reset worker | media | media | `useMultiverse.ts:199-209,269-271,361-363` | M6: rigettare tutte le pending su reset; test dedicato | Timeout 8 s su snapshot dopo reset | APERTO |
| R09 | Persistence schema incompatibile | media | alta | Nessun `schemaVersion`; `WorldSnapshot` con chunk legacy e `cells?` opzionale (`types/index.ts:300-333`) | `PlanetEngineSchemaVersion=2`; migrazione da v1; non sovrascrivere vecchi save | Save v1 non caricabile dopo M6 | APERTO |
| R10 | Nessun chunk eviction => memoria crescente | media | media | `scripts/worldScale.benchmark.ts:33-50` | M7 LRU deterministico; benchmark memoria | Crescita RSS/materialized chunks senza limite | APERTO |
| R11 | Costo CPU del motore blocco UI | media | alta | Modello attuale in worker; nuovi campi aumentano lavoro per chunk | `PlanetEngine.step()` puro e chunk-scheduler; misurare prima di collegare al loop; nessuna innovazione nel main thread | `tick` p95 oltre il budget misurato | APERTO |
| R12 | Mancanza misure GPU/FPS/mobile | alta | media | `G3_PERFORMANCE_REPORT.md:93-98`, `G3_FINAL_LIMITATIONS.md:22-29` | Riportare `UNVERIFIED`; non dichiarare FPS; validazione solo Node finché non ci sono device | Richiesta di performance "reali" senza browser/device | BLOCKED |
| R13 | Torus→sfera non fedele | alta | media | `sphereProjection.ts:1-16`, `Planet3DView.tsx:127-130` | Dichiarare BLOCKED; non risolvere con shader; pianificare griglia sferica separate | Richiesta di correzione geometria globale | BLOCKED |
| R14 | Oceano visivo non coerente con acqua simulata | alta | media | `Planet3DView.tsx:315-333` sfera fissa; `Cell.water` assente da viewport | M2 calcolo sea level; M5 canale opzionale + maschera; fallback invariante | Coastline visiva non corrisponde a `seaLevelM` | APERTO |
| R15 | Nuvole/sole non guidati dal modello | alta | media | `sky.ts:9-13`, `sun.ts:3,24-30` | M3 campi vento/umidità; M5 drag light/cloud da dati; mantenere sprite come VISUAL_EFFECT | Nuvole presenti con umidità 0 o sole fisso dopo M5 | APERTO |
| R16 | Over-engineering scientifico senza validazione | media | alta | Nessun dataset di calibrazione o unità SI oggi | Milestone incrementali; ogni formula con test di monotonicità; dichiarare approssimazioni; non aggiungere micro-fisica non misurabile | Modulo con >3 costanti empiriche non documentate | APERTO |
| R17 | Scope creep dentro rendering | media | media | `Planet3DView.tsx` già molto grande; G3 reports doc drift | Modifiche additive e test transfer function; nessuna riscrittura mesh/shader in M1-M4 | Diff >200 righe in `Planet3DView.tsx` | APERTO |
| R18 | Diff non rivisto / commit non atomici | bassa | alta | Regola esplicita del brief | `git diff --stat` e `git diff` prima di ogni commit; una milestone per commit; messaggio con milestone/test | Commit che mescola docs e codice o GENOME e planet | MITIGATO |
| R19 | Documentazione obsoleta anche dopo l'audit | media | media | `planet.ts:198-201`, `types/index.ts:130-131`, `G_FINAL_PERFORMANCE_REPORT.md:45` | Segnalare i difetti in `PLANET_CURRENT_STATE.md`; correggerli solo in commit dedicati e non funzionali | Nuova doc che contraddice i codici sorgente | APERTO |
| R20 | Build/lint non verificati | media | media | Audit non ha eseguito `next build` né ESLint | Eseguire `npx tsc --noEmit`, `npm run lint`, `npm run build` prima dell'integrazione | Errore build su modulo planetario | APERTO |

## Priorità di mitigazione

1. R01, R02, R03: vincoli architetturali, da trattare in M1 prima di scrivere il modello.
2. R07, R08, R09: robustezza integrazione, da chiudere in M6.
3. R04, R05, R06: igiene della validazione, da mantenere in ogni milestone.
4. R10, R11, R12, R13: performance e limiti noti, da non trasformare in claiming.
5. R14, R15, R17: rendering, da affrontare solo dopo che i dati sono validati.

## Segnalazioni a Pandora

- Serve conferma prima di toccare `types/index.ts` in modo condiviso (M5).
- Serve device/browser per sbloccare R12.
- Serve autorizzazione per qualsiasi merge e per l'integrazione M5/M6 nel ramo principale.
- I 5 fallimenti preesistenti restano fuori dal perimetro Planet Engine.
