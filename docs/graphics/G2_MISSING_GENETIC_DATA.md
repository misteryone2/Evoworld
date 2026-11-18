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

---

# Limiti evolutivi (revisione G2): cosa NON può evolvere oggi e cosa servirebbe

Nessuna evoluzione del body plan è implementata. Con il patrimonio genetico attuale (13 geni storici + 20 estesi) evolvono solo quattro grandezze morfologiche: `size`, MOR-01 `furDensity`, MOR-02 `dermalArmor`, MOR-03 `bodyStature`. Tutto il resto dell'anatomia è fissato dal body plan scelto dall'esterno.

| Caratteristica anatomica | Evolve oggi? | Perché | Dato necessario per renderla evolvibile |
|---|---|---|---|
| Body plan (famiglia, schema generale) | No | nessun gene lo codifica | un gene (o un insieme) che selezioni/componga il piano, con regole di ereditarietà e di mutazione discreta |
| Simmetria (bilaterale, radiale, assente) | No | derivata dal body plan | un tratto discreto di simmetria e il suo ordine radiale |
| Numero e tipo di segmenti | No | dal body plan | gene del numero di segmenti, con intervallo e costo |
| Numero di zampe, braccia, tentacoli, pinne | No | dal body plan (`appendageCounts` è un input esterno) | geni di conteggio per tipo di appendice, con vincoli di parità per la simmetria |
| Lunghezza e raggio delle appendici | No (solo il raggio segue MOR-03) | dal body plan | geni di proporzione per tipo di appendice |
| Articolazioni (tipo, numero di sezioni) | No | dal body plan | geni di sezioni e tipo di giunto |
| Appendici sensoriali (numero/posizione degli occhi, antenne) | No | `vision` è una portata percettiva, non un organo | un gene morfologico distinto dalla portata; nessuna deduzione da `vision` |
| Strutture di sostegno e protettive diverse dalle placche | No | dal body plan | geni specifici, se si vogliono evolvere |
| Placche dermiche: numero | Sì, indirettamente | il numero deriva da MOR-02 (2–8 sopra soglia) | già coperto |
| Pelo e corazza (copertura), corporatura, taglia | Sì | MOR-01, MOR-02, MOR-03, `size` | già coperti |
| Locomozione (modalità) | No | conseguenza della struttura, non un gene | segue i conteggi di arti: nessun gene dedicato |
| Organi interni | No | non rappresentati | fuori ambito |

## Requisiti per qualunque futura evoluzione anatomica (non implementata)
1. Contratto fenotipico additivo che porti i dati al descriptor (vedi sopra): senza di esso il renderer non li vede.
2. Un gene anatomico deve avere un effetto sulla simulazione (costo e beneficio, per esempio metabolico), altrimenti è deriva neutra e produce solo variazione cosmetica.
3. Mutazione discreta con regole di compatibilità: un cambio di body plan non può essere una piccola perturbazione continua; serve un modello di transizione (o di moduli sviluppati) e il controllo della validità dello spec risultante (`validateBodyPlanSpec`).
4. Migrazione dei salvataggi e dei genomi senza questi geni: assenti = "non determinato", mai un valore predefinito che diventi un'affermazione biologica.
5. Test di non regressione sulla biologia esistente e sul bilanciamento (richiede una proposta approvata: il motore biologico non viene toccato da G2).
6. Parità e limiti: il tetto di 64 appendici e la parità delle coppie bilaterali vanno rispettati dall'ereditarietà.
