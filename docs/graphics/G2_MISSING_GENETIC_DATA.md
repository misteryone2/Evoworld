# G2 — Dati genetici mancanti e proposta di contratto additivo

## Cosa non è determinabile oggi
Nessun gene codifica: body plan, simmetria, segmentazione, numero/tipo di arti e appendici, articolazioni, organi sensoriali (numero/tipo di occhi, antenne…), organi interni, strutture di sostegno, modalità di locomozione. Il sistema li tratta come `undetermined` (specificati dal body plan o dal seme), senza attribuirli a caratteristiche biologiche.

Non sono usati come fonte anatomica: speed, carnivory, vision, evasion, huntingSkill e gli altri geni estesi. Il legame "vision → occhi grandi" o "carnivoria → mascella" resta una euristica estetica legacy, non biologia.

## Dati che il renderer non riceve
`RenderFrame` non porta `ext` (furDensity, dermalArmor, bodyStature). Per usare il fenotipo morfologico nel rendering serve un contratto additivo.

## Proposta (NON implementata; richiede approvazione e coordinamento)
Campo **facoltativo** in `RenderFrame`, additivo, che non altera i campi esistenti:
```ts
organismsMorphology?: Float32Array; // 3 valori per organismo, normalizzati 0..1: [bodyStature, furDensity, dermalArmor]
```
- Riempito in `buildRenderFrame` leggendo `o.genome.ext` (assenti → NaN = "mancante", mai il valore predefinito).
- `size` è già presente (`organismsSize`).
- Compatibile con i salvataggi (non entra nello snapshot) e con la modalità senza geni estesi.
- Costo: 3 float per organismo per frame. Alternativa meno costosa: inviarli solo per gli organismi in vista, o nel dettaglio organismo/specie su richiesta.
- Il descriptor G2 è già pronto a riceverli (`derivePhenotype({ size, ext })`).

## Proposta separata per geni anatomici (solo se Matty decide di renderli evolvibili)
Un eventuale gene di "plan" o di numero di segmenti/appendici richiede: motivazione biologica, effetto sulla simulazione (costo/beneficio, altrimenti sarebbe deriva neutra), migrazione dei salvataggi e test di non regressione. Non è in questo lavoro e non è stato implementato.
