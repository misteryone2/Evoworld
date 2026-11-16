# EvoWorld — Piano tecnico grafico G1–G9 (bozza post-audit)

Basato su `GRAPHICS_AUDIT_G0.md`. Obiettivo: trasformazione grafica **realistica, massimo dettaglio, PC+mobile** mantenendo separazione sim/render e prestazioni sostenibili.

## Vincoli invarianti
- **Read-only verso la simulazione:** nessuna modifica a genetica, mutazioni, selezione, riproduzione, metabolismo, energia, comportamento, predazione/ecologia, regole evolutive.
- **Nessun evento visivo fittizio:** animazioni/interazioni visive solo da stati/dati reali.
- **Nessun cambio distruttivo:** salvataggi/formati e funzionalità esistenti preservati salvo decisione esplicita approvata.
- **Incrementale e misurabile:** ogni fase con verifica e metriche.

## G1 — Architettura grafica e contratto dati
**Obiettivi**
- Definire `CreatureVisualDescriptor` (tipi, sorgenti, normalizzazioni, cache, determinismo).
- Mappare boundary: `RenderFrame/ViewportFrame (+detail fetch read-only)` → descriptor → renderer.
- Modularizzare `Planet3DView.tsx` (estrazioni non comportamentali): `TerrainSystem`, `OceanSkyAtmosphere`, `CreatureRenderer`, `AnimationSystem`, `CameraSystem`, `LocalSceneController`, `Picking/Selection`, `PerfTelemetry`.

**Deliverable**
- `docs/graphics/visual-descriptor.md` (o equivalente), moduli/lib con API stabili, nessun cambio visivo intenzionale.
**Verifica**
- Build/test baseline invariati; frame output funzionalmente equivalente (golden screenshots dove possibile).

## G2 — Creature e anatomia
**Obiettivi**
- Anatomia più credibile: segmentazione corpo (torso/bacino/petto), collo/testa, arti articolati, coda, dettagli sensoriali proporzionati ai dati biologici.
- Variabilità individuo/specie da descriptor (scala, proporzioni, ornamentazione) mantenendo leggibilità.
- Pipeline LOD geometrico: high (vicino/follow), mid, low/impostor-like semplificato per folle distanti.

**Verifica**
- Corrispondenza tratto→visuale documentata; 100/500/1500/3000 creature senza rotture instancing.

## G3 — Materiali e dettagli
**Obiettivi**
- Material tiers: PBR ricco (alto), standard ottimizzato (medio), Lambert/semplice (basso/2D equivalente informativo).
- Palette/specie + pattern procedurali; texture/normal ove il budget lo consente (atlas condivise).
- Superfici terreno/rocce/acqua differenziate per bioma con parametri coerenti.

**Verifica**
- Budget memoria texture; qualità scalata senza popping evidente.

## G4 — Animazioni
**Obiettivi**
- Consolidare locomozione (idle/walk/run/turn) con blending naturale e contatto al suolo migliore (procedurale/IK leggero dove fattibile).
- Comportamenti visivi: feeding, resting/sleep, alert/flee/attack cues **solo se supportati da dati reali**.
- Micro-movimenti (respiro, sguardo, coda/orecchie) coerenti con LOD animazione esistente.

**Verifica**
- Niente slittamento evidente, niente compenetrazioni gravi; transizioni fluide.

## G5 — Ambiente e vegetazione
**Obiettivi**
- Terreno: dettaglio forme/materiali, transizioni bioma, rocce, variabilità locale.
- Vegetazione stratificata per bioma/densità/scala (istanze efficienti, wind leggero su tier alti).
- Acqua/illuminazione/atmosfera: mare più credibile, cielo/fog/luci/ombre scalabili; effetti avanzati solo tier alti.

**Verifica**
- Coerenza con dati ambientali esistenti; costo frame in follow e orbit.

## G6 — Ecosistema e interazioni visive
**Obiettivi**
- Rendere leggibili predazione, foraggiamento, fuga, riposo, raggruppamenti se e solo se emergono dalla sim.
- Indicatori opzionali non invasivi nell’inspector/HUD (non nel mondo come “fake VFX”).

**Verifica**
- Audit manuale: ogni cue visiva tracciabile a un segnale/dato.

## G7 — Interfaccia
**Obiettivi**
- HUD/pannelli/inspector/schede creatura moderni e leggibili (desktop+mobile).
- Visualizzazione genetica, tratti, storia/evoluzione popolazioni, statistiche con gerarchia chiara.
- Accessibilità/touch (target, contrasto, layout immersivo/sheet).

**Verifica**
- Usabilità su schermi piccoli e grandi; nessuna perdita di funzionalità.

## G8 — Ottimizzazione PC/mobile
**Obiettivi**
- Profiling mirato: CPU update istanze, GPU draw/fill-rate, memoria, caricamenti.
- Tuning LOD, culling, batching/instancing, qualità adattiva, refresh viewport/terreno.
- Scenari obbligatori: **100, 500, 1500, 3000 organismi** (se supportati), per livello qualità.

**Deliverable**
- `docs/graphics/performance-report.md` con metodo, hardware, numeri, screenshot/grafici.

## G9 — Integrazione e collaudo
**Obiettivi**
- Regressione visiva/funzionale, coerenza sim↔render, stabilità sessioni lunghe e salvataggi esistenti.
- Verifica finale PC e mobile (reale o emulata documentata), acceptance criteria del brief.

**Verifica**
- Checklist completa, test documentati con risultati reali, nessuna regressione biologica.

## Metriche da tracciare (fin da G1)
- FPS medio/p95, ms update creature, ms terrain/viewport update, draw calls/triangoli/istanze attive, memoria JS/texture/buffer (ove misurabile), tempi worker→frame.
- Correttezza: selezione/picking, conteggi popolazione rappresentati, nessuna mutazione stato sim (hash/snapshot comparativo su seed fisso, se praticabile).
