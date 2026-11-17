# G2 — Rapporto di audit (17 novembre 2026)

## Stato Git
- `main` = `c35c287`. `graphics/g1-creature-visuals` = `efcf7b1` (G1-b), avanti rispetto a `main`: solo lì esistono `lib/visual/` e `components/simulation/planet3d/`.
- Branch G2 `graphics/g2-anatomy-phenotype` creato **in locale** da `efcf7b1`. Non pubblicato sul remoto. Nessun merge in `main`.
- Nessun file tracciato è stato modificato: G2 aggiunge solo file nuovi.
- Nota di nomenclatura: `GRAPHICS_COORDINATION.md` chiama "G2 — Creature e anatomia" il pass visuale 2D/3D di Big Pickle. Questo G2 (anatomia/fenotipo procedurali) è un lavoro distinto. Non ho toccato quel file condiviso: riga proposta nel report finale.

## Anatomia attuale
- `lib/creatureAnatomy.ts`: quadrupede fisso (torso ellissoidale, testa, occhi, coda, 4 zampe, orecchie, mascella, 0–3 spine), funzione pura di 5 tratti (speed, carnivory, vision, evasion, huntingSkill).
- Incorpora correlazioni estetiche: carnivoria → mascella e assenza di orecchie (>0,5); velocità → corpo, zampe e coda più lunghi; evasione → spine. `lib/visual/creatureVisualDescriptor.ts` aggiunge `materialClass` da carnivoria (`hide`) ed evasione (`carapace`).
- `creatureShape.ts`: stesso schema in forma normalizzata (2D). `creatureModel.ts`: importa Three.js (non riusabile da moduli puri).
- Il codice legacy NON è stato modificato.

## Geni morfologici realmente disponibili
33 geni in `geneRegistry.ts` (13 storici + 20 estesi). Morfologici in senso stretto: `size`, MOR-01 `furDensity`, MOR-02 `dermalArmor`, MOR-03 `bodyStature`.
**Nessun gene codifica body plan, simmetria, segmentazione, numero/tipo di arti o appendici, organi sensoriali, articolazioni.**
`expressGenome` produce solo moltiplicatori fisiologici (nessun dato anatomico).

## Dati che raggiungono il renderer
`RenderFrame` porta: id, specie, size, speed, carnivory, vision, evasion, huntingSkill, energy (+ energyGain calcolata lato render). **`ext` (furDensity, dermalArmor, bodyStature) non arriva al renderer.** Non verificato: se `speciesGenomeStats` includa `ext`.

## Dipendenze e sistemi da preservare
`creatureAnatomy`, `creatureShape`, `creatureModel`, `bodyAnimation`, `naturalMotion`, `livingBehavior`, `lib/visual/*`, `planet3d/*`, `Planet3DView.tsx`, `renderFrame.ts`, `geneRegistry.ts`, `geneExpression.ts`: tutti intatti. G2 legge solo `geneRegistry` (ids/intervalli) e la costante `STATURE_RADIUS` di `geneExpression`, in sola lettura.

## Baseline eseguita (prima di G2)
- Test mirati (anatomia, forma, modello, descriptor, animazione, genomi, persistenza): 165 pass, 2 fail (`vibeGenomeV1110`: divieto geni comportamentali; PER-03), 1 skip.
- `tsc --noEmit`: 1 errore preesistente in `app/layout.tsx` (`LayoutProps` non trovato; probabilmente tipi generati da Next mancanti, non verificato).
- Suite completa con G2: 721 pass, 5 fail, 1 skip. Gli stessi 5 fail compaiono, identici, rimuovendo i file G2 (2 esecuzioni): `fauna180` (sfumatura ventre-dorso), `reproduction` (2), `vibeGenomeV1110` (2). Sono preesistenti e non legati a G2.
- ESLint: nel repo non c'è `eslint.config.*`, quindi il lint non è eseguibile. Non eseguito.
- `next build`: non eseguito.
