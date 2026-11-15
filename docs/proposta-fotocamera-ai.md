# Fotocamera AI · proposta di riprogettazione

Stato: proposta, nessuna riga di codice cambiata. Data: 15/11/2026.

## 1. In una frase

La fotocamera AI diventa **due strumenti in uno**, scelti con un interruttore in alto:

- **Rileva**: inquadri quello che c'è (alberi, suolo, viti) e l'app lo riconosce e lo **mette nel progetto**.
- **Prova**: vedi sul posto, in realtà aumentata, **l'intervento che stai simulando** (alberi, pergolati, aiuole, nebulizzatori; nel vigneto teli d'ombra, frangivento, irrigazione) in scala vera.

Le due modalità lavorano sugli stessi dati della simulazione: quello che **rilevi** entra nella mappa e nei calcoli, quello che **provi** viene dalla mappa e dalle leve.

## 2. Da dove partiamo (oggi)

| Parte | Stato | Cosa ne facciamo |
|---|---|---|
| Riconoscimento con l'AI (specie, suolo, foglia, parete, interfilare) | Funziona, verifica su Catalogue of Life / GBIF, foto di riferimento Kew/GBIF | **Tenere**, è il cuore di Rileva |
| Mirino che segue il verde | Funziona | Tenere |
| Esito, elenco delle scansioni, didascalie nelle foto, report PDF | Funziona | Tenere, semplificare la vista |
| Bilancia termica (esemplari → raffrescamento) | Stima dalla chioma | Spostare il calcolo nella simulazione (vedi §3.4) |
| Ritaglio della pianta "piantato" sulla griglia | Griglia guidata dai sensori di inclinazione, non ancorata | **Sostituire** con Prova (ARCore vero) |
| ARCore (`src/lib/arcore.ts`) | Scritto e testato, **mai avviato**: il pulsante "AR Core" mostra solo la griglia | **Accendere davvero** in Prova |
| Interfaccia | Molti strumenti in poco spazio (sezioni, Esito, Analisi, AR, bilancia, singolo/multiplo, zoom) | Riordinare per modalità |
| Disponibilità | Solo app installata, con accesso; ora "in sviluppo" | Invariata |

## 3. Modalità RILEVA

### 3.1 Flusso
1. Scegli **cosa rilevare** (come oggi): Piazza → *Albero*, *Suolo*; Vigneto → *Foglia*, *Parete*, *Interfilare*.
2. Inquadri, il mirino aggancia, tocchi **Scansiona**.
3. Esito in una scheda unica: foto tua + foto di riferimento, nome, quanto è sicura l'AI, 2–3 righe di "perché".
4. Un solo pulsante principale: **«Aggiungi al progetto»**.

### 3.2 Cosa vuol dire «Aggiungi al progetto» (la novità)
Ogni scansione diventa un **dato con una posizione** (GPS + direzione della bussola + distanza):

- **Albero** → un punto sulla mappa con specie e chioma stimata. Entra tra gli oggetti «Già nell'area» (oggi presi solo da OpenStreetMap): gli interventi non ci vanno sopra e la sua ombra **conta già** nella temperatura di partenza.
- **Suolo** → il tipo di superficie (asfalto, lastricato, terra) sulla zona inquadrata: aggiorna la permeabilità di partenza e suggerisce dove fare aiuole.
- **Foglia / Parete / Interfilare** → lo stato della zona del vigneto in cui ti trovi: stress visibile, densità della chioma, suolo nudo o inerbito. Alimenta le stesse grandezze che oggi si regolano a mano (umidità, ombra, vento) con l'etichetta «da foto».

Sulla mappa ogni rilevamento è un segnaposto con la miniatura; toccandolo si apre l'esito. Si può spostare o eliminare.

### 3.3 Misurare quando si può
Con ARCore (Android compatibili) Rileva può anche **misurare**: distanza dall'albero, altezza del tronco, larghezza della chioma, così l'ombra non è più "da chioma tipica" ma misurata. Senza ARCore resta la stima di oggi, dichiarata come tale.

### 3.4 La bilancia termica
Il "quanti esemplari / quanto fresco" esce dalla fotocamera e va nella **simulazione**: gli alberi rilevati diventano alberi esistenti, e il fresco lo calcola l'arco come per tutto il resto. Nella fotocamera resta solo una riga: «Questo albero fa circa 30 m² d'ombra».

## 4. Modalità PROVA (realtà aumentata)

### 4.1 Flusso
1. Apri Prova: l'app chiede di **muovere piano il telefono** verso il suolo finché riconosce il pavimento (ARCore).
2. Compare **l'area disegnata** sul suolo vero, con i suoi interventi, ancorata: puoi girarci attorno.
3. In basso, la barra degli oggetti: Albero, Pergolato, Aiuola, Nebulizzatore (vigneto: Telo d'ombra, Frangivento, Irrigazione). Tocchi un oggetto, tocchi il suolo, compare **a grandezza vera**.
4. Pizzica per ruotare, trascina per spostare, tieni premuto per eliminare.
5. **Scatta** foto o video dell'AR: vanno nella simulazione e nel report come le altre foto, con la scritta «Anteprima in realtà aumentata».
6. **«Riporta sulla mappa»**: gli oggetti messi a mano diventano zone/alberi della simulazione (posizione dal GPS + bussola, con un margine di qualche metro, correggibile sulla mappa 2D).

### 4.2 Come si allinea l'area alla realtà
Il GPS sbaglia di 3–10 metri, troppo per posare un pergolato preciso. Proposta semplice:
- l'app mostra l'area nella posizione GPS;
- l'utente tocca **un angolo vero** dell'area sul suolo (es. lo spigolo della piazza che ha usato come primo pin) e poi un secondo: l'app ruota e sposta l'area per farli combaciare.
Due tocchi, poi tutto resta fermo.

### 4.3 Oggetti 3D
Si riusano le forme che l'app ha già per la mappa 3D (alberi, pergolati, aiuole, nebulizzatori, teli, siepi in `three-layer` / `area-layout`), con la luce stimata da ARCore e l'ombra del sole dell'ora simulata. Niente modelli nuovi da disegnare per la prima versione.

### 4.4 Telefoni senza ARCore (iPhone, Android economici)
Safari su iPhone non offre la realtà aumentata web. Per loro Prova diventa **«Anteprima su foto»**: scatti una foto della piazza, posi gli oggetti sulla foto con la prospettiva stimata (la griglia di oggi), e salvi l'immagine. Meno precisa, ma la funzione c'è per tutti, e la scheda lo dice chiaramente.

## 5. Interfaccia

In alto: **Rileva | Prova** (interruttore unico, come Singolo | Multiplo).

| | Rileva | Prova |
|---|---|---|
| In alto | cosa rilevare (pillole) | stato ARCore («Muovi il telefono…» / «Suolo trovato») |
| Centro | mirino | area e oggetti in AR |
| In basso | Scansiona, zoom, flash | barra oggetti, Scatta, Riporta sulla mappa |
| Scheda | esito + «Aggiungi al progetto» | elenco oggetti posati |

Spariscono come pulsanti separati: «AR Core», «Analisi», la bilancia a fisarmonica. L'elenco delle scansioni resta raggiungibile dall'esito.

## 6. Dati, costi, privacy

- **Rilevamenti**: salvati come le foto (dispositivo per gli ospiti, account con l'accesso), con posizione e risultato.
- **Costi AI**: una chiamata per scansione, come oggi; Prova non usa l'AI.
- **Posizione**: usata solo mentre la fotocamera è aperta e se il permesso è attivo (pagina Autorizzazioni già esistente).
- **Onestà dei numeri**: ogni valore dice se è **misurato** (ARCore), **stimato da foto** o **di riferimento**.

## 7. Fasi di lavoro

| Fase | Cosa | Perché prima |
|---|---|---|
| 1 | Interruttore Rileva/Prova, interfaccia riordinata, bilancia spostata nella simulazione | Pulizia, nessun rischio tecnico |
| 2 | «Aggiungi al progetto» per Albero e Suolo (piazza), segnaposti sulla mappa | Il valore più visibile, riusa l'AI che funziona |
| 3 | Prova con ARCore: suolo, posa di un albero e di un pergolato, foto AR | Prova di fattibilità sul telefono vero |
| 4 | Area ancorata con i due tocchi, tutti gli oggetti, «Riporta sulla mappa» | Completa Prova |
| 5 | Vigneto: Foglia/Parete/Interfilare nelle zone; Prova con teli e frangivento | Estende al secondo settore |
| 6 | Misure con ARCore in Rileva; Anteprima su foto per iPhone | Rifinitura |

Le fasi 1–2 si possono fare e provare anche in cloud; dalla 3 in poi servono **prove su un telefono Android con ARCore** (es. un Xperia 10 recente) collegato.

## 8. Decisioni da prendere

1. «Aggiungi al progetto» è automatico dopo ogni scansione o sempre su conferma? (Proposta: su conferma.)
2. In Prova, gli oggetti posati a mano possono cambiare la simulazione o restano solo un'anteprima finché non tocchi «Riporta sulla mappa»? (Proposta: solo anteprima.)
3. Ospiti: Rileva e Prova restano solo per chi ha fatto l'accesso, come oggi la fotocamera AI? (Proposta: sì; l'Anteprima su foto potrebbe essere aperta a tutti.)
4. Quando togliere lo stato «in sviluppo»: dopo la fase 2 (solo Rileva) o dopo la fase 4?

## 9. Rischi

- **ARCore via web** funziona solo su Chrome Android compatibili; serve un piano B (Anteprima su foto), già previsto.
- **Precisione GPS** in città: risolta con l'allineamento a due tocchi, ma va provata in piazza.
- **Prestazioni**: AR + 3D scaldano il telefono; prima versione con pochi oggetti e forme semplici.
- **Riconoscimento**: l'AI può sbagliare la specie; resta sempre la percentuale di sicurezza e la correzione a mano.
