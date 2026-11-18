# G2 — Sistema di coordinate e convenzioni geometriche (schema v2)

## Assi e unità
- Sistema destrorso. **+Z = avanti (muso)**, **+Y = su**, **+X = lato sinistro** della creatura (guardando verso +Z).
- Creatura di taglia unitaria. Il renderer moltiplica per `proportions.sizeScale`. Tutte le lunghezze sono relative.
- Origine: `x = 0` sull'asse di simmetria; `z` centrato sull'estensione dei segmenti (layout assiale); `y` relativo all'asse del corpo. **Il terreno non è y = 0**.
- Arrotondamento: ogni coordinata è arrotondata a 1e-6 (stabilità di serializzazione e fingerprint).

## Segmenti
`center` + `halfExtents` (semiassi su X, Y, Z). Forme: `sphere` e `ellipsoid` (ellissoide); `capsule` (cilindro lungo Z con calotte di raggio ≈ max(semiasse X, Y)); `cone` (asse lungo Z, **base a +Z, apice a −Z**). Layout assiale: i segmenti sono disposti dal muso alla coda con una sovrapposizione di 0,15 della lunghezza del precedente.
Il valore `halfExtents` x/y è modulato dalla sola corporatura (MOR-03).

## Appendici
- `position`: radice sul segmento ospite, **incassata del 3 %** nella sua superficie.
- `direction`: versore unitario (il validatore lo verifica). `length`: lungo `direction`. `radius`: raggio dell'appendice.
- Punta = `position + direction × length` (**stima rettilinea**: gli angoli di piegatura delle sezioni non sono modellati).
- Laterali: `x = ±` semilarghezza della superficie del segmento alla quota e alla `z` dell'attacco (non `halfExtents.x`). Dorsali/ventrali: `y` sulla superficie. Terminali: `z` sulla punta del segmento. Radiali: sul bordo (0,95 dei semiassi). Con segmenti in posizione esplicita `x` è relativo al centro del segmento ospite.
- Un'appendice dispari su una disposizione laterale va sulla linea mediana, all'estremità posteriore della zona; mantiene l'orientamento del gruppo (una zampa punta in basso; "verso l'esterno" sulla linea mediana diventa "in alto").
- Le placche dermiche sono distribuite lungo **tutti i segmenti del corpo** (ruoli core, trunk, thorax, abdomen, lobe), mai su testa e coda.

## Simmetria
`bilateral`: ordine 2, segmenti con `x = 0`, coppie left/right speculari (stesso `y`, `z`, `|x|`, lunghezza, raggio). `radial`: ordine = **massimo comun divisore** dei conteggi dei gruppi disposti ad anello (angoli uniformi); 0 = rotazione continua (nessun anello). `spherical`: ordine 0, solo senza appendici (con appendici diventa `radial`). `none`: ordine 1.

## Estensioni e terreno (`proportions`)
- `bodyLength/Width/Height`: AABB dei soli segmenti.
- `extentLength/Width/Height` e `bounds`: AABB di segmenti + appendici (punta stimata, raggio incluso).
- **Terreno**: determinabile solo se esiste almeno una zampa d'appoggio (`kind = "leg"`, `direction.y ≤ −0,5`). `groundY` = punto più basso di quelle zampe (punta − raggio). `groundClearance` = `max(0, fondo dei segmenti − groundY)`. `heightAboveGround` = `bounds.max.y − groundY`. Altrimenti i tre valori sono `null`: non si inventa un appoggio.
- La lunghezza di una zampa **non** è usata come distanza dal terreno.
- Il LOD non cambia le proporzioni: descrivono sempre l'organismo intero.

## Limiti dichiarati
La punta è lineare; capsule e coni sono trattati con profilo semplificato; le sovrapposizioni tra appendici non sono risolte; non c'è collisione né fisica.
