# G2 — Report finale

Branch: `graphics/g2-anatomy-phenotype` (locale, da `efcf7b1`). Nessun merge in `main`. Nessun file esistente modificato.

## File aggiunti (tutti nuovi)
- `lib/phenotype/{types,derive,index}.ts` — lettura dei geni morfologici con provenienza.
- `lib/anatomy/{types,util,bodyPlan,assemble,generate,lod,validate,serialize,legacyAdapter,index}.ts` — contratto, catalogo, generatore, validazione, serializzazione, LOD, adattatore.
- `tests/anatomyG2.test.ts` (23 test), `tests/phenotypeG2.test.ts` (6 test).
- `docs/graphics/G2_{AUDIT_REPORT,ARCHITECTURE,MISSING_GENETIC_DATA,FINAL_REPORT}.md`.

## Motivazioni delle scelte
- Body plan come input esplicito (o seme opzionale, spento di default): nessun gene lo codifica; attribuirlo a tratti sarebbe inventare biologia.
- Provenienza validata: il validatore rifiuta geni non morfologici in provenienza `gene-*`.
- Fingerprint canonico e serializzazione a chiavi ordinate: confronto e salvataggio stabili.
- Placche dermiche dalla corazza MOR-02: unica struttura anatomica "aggiunta" dai geni, perché il gene è la corazza dermica.

## Test eseguiti (reali)
- `tests/anatomyG2.test.ts` + `tests/phenotypeG2.test.ts`: **29/29 pass** (determinismo, validità, riferimenti segmenti/articolazioni, 13 body plan e 4 famiglie, appendici variabili, assenza di dipendenze dal renderer, round-trip, compatibilità legacy, dati mancanti, nessun gene inventato, LOD).
- `tsc --noEmit`: nessun errore nei file G2; resta l'errore preesistente in `app/layout.tsx`.
- Suite completa: 721 pass, 5 fail, 1 skip. Gli stessi 5 fail compaiono senza i file G2 (2 esecuzioni): `fauna180` (1), `reproduction` (2), `vibeGenomeV1110` (2). Non causati da G2.
- Non eseguiti: `next build`, ESLint (nessuna configurazione nel repo), qualunque verifica browser/GPU/mobile.

## Limiti residui
1. I body plan non evolvono: oggi non esiste un gene che li determini (vedi `G2_MISSING_GENETIC_DATA.md`).
2. Il fenotipo morfologico (`ext`) non raggiunge il renderer: serve il contratto additivo proposto, non implementato.
3. L'adattatore legacy produce un descriptor "estetico"; il confronto con il quadrupede nuovo segnala differenze di proporzione, non le elimina.
4. Prestazioni misurate solo su CPU Node (~291 µs/organismo a freddo; cache calda 9 ms su 3000). Nessuna misura su dispositivi.
5. Le proporzioni dei body plan sono scelte di rappresentazione, non dati biologici.
6. Il branch non è sul remoto: va caricato da Matty (da telefono) o con il pacchetto ZIP.

## Riga proposta per `GRAPHICS_COORDINATION.md` (file condiviso, non modificato)
| G2b — Anatomia e fenotipo procedurali | Moduli isolati `lib/phenotype/`, `lib/anatomy/` e test; non collegati al renderer; 29 test pass | Claude (Matty) | Distinto dal pass visuale "G2" di Big Pickle |
