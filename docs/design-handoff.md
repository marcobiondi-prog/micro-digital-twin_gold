# Handoff · Revisione UI/UX di Micro Digital Twin

*11/11/2026 · versione Beta · per il processo di design in Claude*

## 1. Cos'è l'app
Micro Digital Twin è una web app installabile (PWA), pensata prima di tutto per il telefono. Serve a **provare gli interventi prima di farli** su un luogo vero:
- **Settore urbano** (funzionari del Comune): una piazza. Si scelgono alberi, aiuole e ciottoli, coperture ombreggianti e nebulizzatori. L'app stima di quanto scende il **calore percepito** e mostra cosa si ottiene: CO₂, pioggia trattenuta, posti all'ombra.
- **Settore agricolo** (agricoltori): un vigneto diviso in tre zone. Le leve sono irrigazione, teli d'ombra e frangivento. L'app misura il **bisogno di intervento** (da 0 a 100), dà i consigli, l'acqua necessaria e i prossimi 7 giorni.

Tutto il testo è in italiano, con parole semplici e senza gergo tecnico. Sullo schermo non compaiono i nomi dei fornitori di dati (fanno eccezione Licenze e i crediti).

## 2. Chi la usa e il percorso principale
1. **Apertura**: animazione di caricamento, poi il tutorial (5 schermate da scorrere, solo al primo accesso).
2. **Selettori** "Da dove vuoi usarmi?": Settore urbano o Settore agricolo, "Hai già un account? Accedi", "Entra come ospite". Poi il riconoscimento dei profili già registrati (carosello 3D) o il modulo di identificazione.
3. **Simulazione** (/urbano o /vigneto), con le schede **Mappa · Simula · Sensori AI**:
   - *Mappa*: ricerca del luogo, GPS, mappa 2D/3D, disegno dell'area con i pin, zone e lotti, "Sposta elementi", "Posizione migliore", "Solo quello disegnato".
   - *Simula*: anteprima della mappa, poi il **semicerchio** (il controllo principale: si trascina il punto bianco), il chip "quando" (stagione e ora), le leve, "Cosa ottieni", e infine foto e video.
   - *Sensori AI*: dove mettere le centraline e "I tuoi sensori".
4. **Dashboard**: il riepilogo del progetto (semicerchio in sola lettura, la giornata, cosa ottieni, cosa hai messo, registro o quaderno, Invia il progetto, strumenti Premium). C'è anche **Esporta report** (PDF, CSV, GeoJSON, foto).
5. **Cronologia / Benvenuto**: gli interventi divisi per giorno, foto e video in "pile", gli archivi.
6. **Pannello account**: profilo professionale, spazio nel cloud, dispositivi, piani e informazioni, versione.

Navigazione su telefono: una barra in basso ad arco con 5 colonne (Benvenuto/Cronologia, Urbano, fotocamera al centro, Vigneto, Dashboard). In alto ci sono il pulsante dell'account, la "i" del tutorial e il tema.

## 3. Linguaggio visivo di oggi
- **Tela scura in stile console** (l'app si apre scura): pagina blu quasi nera, schede color ardesia, pillole ardesia per le schede attive, luce ambientale colorata in base alla pagina, vetro sfocato su barre e pillole.
- **Accento turchese** (il colore di "Twin"). Un blu PS come primario. Il calore si legge su una scala a cinque passi: blu, turchese, ambra, arancio, rosso.
- Titoli grandi e sottili, numeri di lettura sottili, un carattere display per le cifre. I pulsanti principali sono pillole **bianche**.
- La mascotte **Twin**, un robot. L'ingresso ha un'aurora di sfondo con un orizzonte luminoso.
- Esiste anche il **tema chiaro**, da tenere leggibile.

## 4. Cosa chiediamo alla revisione
Obiettivo: un'app **più chiara, più calma e più coerente**, senza perdere il carattere "strumento serio".
1. **Gerarchia della pagina Simula**: oggi è lunga (anteprima mappa, semicerchio, chip "quando", leve, cosa ottieni, foto). Va resa più leggibile al primo sguardo e va capito cosa si può piegare o spostare.
2. **Ingresso e identificazione**: selettori, carosello dei profili, modulo e pagina "Un account, un settore". Il percorso è cresciuto a strati: va reso semplice e in pochi passi.
3. **Coerenza dei componenti**: pillole, schede, fogli dal basso, toast, badge (Beta, In sviluppo, lucchetti ospite), conferme "in place". Serve un piccolo sistema unico.
4. **Mappa**: i comandi sopra e sotto la mappa (AreaBar, SimBar, ZonesBar, pillole di lettura) sono tanti. Vanno raggruppati.
5. **Dashboard e report**: lettura rapida per chi non è tecnico (un funzionario, un agricoltore).
6. **Accessibilità**: contrasto nel tema chiaro e scuro, aree di tocco di almeno 44 px, movimento ridotto, testo per i lettori di schermo.

## 5. Vincoli da rispettare
- Prima di tutto il telefono (412 px di larghezza di riferimento). Tablet e desktop si adattano.
- Testo in italiano semplice. Nessun nome di fornitore sullo schermo.
- Nessuno zoom con pizzico, tranne le mappe. Niente selezione del testo sul touch.
- Animazioni con transform e opacity, ferme con movimento ridotto.
- Il semicerchio resta il controllo principale della simulazione. Mappa 2D di base, 3D solo per chi ha fatto l'accesso.
- Gli ospiti possono usare le simulazioni. Cronologia, Sensori AI, Invia ed Esporta sono bloccati con un lucchetto.

## 6. Cosa consegnare
- Le schermate riviste per il telefono: Selettori, Identificazione, Simula (piazza e vigneto), Mappa, Dashboard, Cronologia, Pannello account.
- Un mini sistema di componenti: colori (token chiaro e scuro), tipografia, pillole, schede, fogli, toast, badge.
- Note su cosa cambia nel codice. Le viste stanno in `src/views/v10/`, `src/views/v8/` e `src/views/v9c/`, gli stili in `src/styles.css`.

## 7. Riferimenti
- Schermate di oggi: caricate nell'artefatto di design (01-selettori … 06-dashboard), non nel progetto.
- Regole del progetto e storia delle scelte: `AGENTS.md`.
- Canvas di design (privato, da condividere dal menu Condividi): https://claude.ai/artifact/HvKysx9AtTXXkS9FxS75G2
