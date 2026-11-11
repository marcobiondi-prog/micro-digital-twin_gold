# Report · Test dei componenti e del tocco su telefono simulato

*11/11/2026 · build di produzione di main (commit 18929b8 e precedenti) · nessuna modifica all'app, solo test*

## In breve
**I tocchi arrivano sempre all'app: il touch del telefono funziona.** Tutti i problemi trovati sono del frontend:

1. **Una barra in basso "morta" sotto quella vera (grave).** In ogni pagina, da ospite, ci sono **due** barre in basso e **due** note a piè di pagina. Quando la barra vera scende (si scorre la pagina, o si tocca uno spazio vuoto), resta in vista la copia morta. Toccandola si sente il clic, perché il suono è globale, ma **non succede niente**. È esattamente "scatta e non risponde".
2. **Il primo tocco dopo l'apertura va perso.** Lo schermo scuro di caricamento, mentre si dissolve (0,25–0,5 s), resta sopra la pagina e prende il tocco. Su Android e iPhone simulati il primo tocco su "Entra come ospite" non ha fatto niente; il secondo sì.
3. **Gli avvisi in alto coprono i pulsanti dell'intestazione.** Finché un avviso è visibile (per esempio "La posizione ora è bloccata", o quelli del GPS), i pulsanti account, "i" e tema non ricevono il dito.
4. **Su un telefono lento la risposta è tarda, ma arriva.** Con la CPU rallentata 6 volte ogni tocco su una leva impiega 0,3–0,6 s per vedersi, perché il frontend resta occupato fino a 0,6 s. Nessun tocco però si perde: 5 su 5.
5. **Alcuni comandi sono più piccoli di 44 px**: l'intestazione (36 × 36), i livelli (36 di altezza), le stagioni in dashboard (36), l'ⓘ (28 × 28).

## Cosa ho creato
| Suite | Dove | Come si lancia | Test |
|---|---|---|---|
| Unit dei componenti | `src/test/components/ui-primitives.test.tsx`, `src/test/components/console-controls.test.tsx` | `npm test` | 23 |
| Integrazione | `src/test/integration/touch-pipeline.test.tsx` | `npm test` | 9 |
| Telefono simulato (touch) | `tests/touch/touch.spec.ts`, `tests/touch/touch-helpers.ts`, `playwright.touch.config.ts` | `npm run build` poi `npm run test:touch` | 12 scenari × 3 telefoni = 36 |

**Unit**, sui componenti condivisi: Button (click, disabilitato, varianti, asChild), Badge, Switch (accensione, disabilitato), Input + Label, Tabs (si attiva alla pressione); e sui comandi dell'app:
- TabRow: scheda aperta, tocco, altezza 44 px;
- Panels: un pannello alla volta, quelli già visti restano montati;
- PageHero e HeroButton;
- Lever: + e −, limiti, percentuale, pulsanti da 48 px;
- Gauge, il semicerchio: valori per i lettori di schermo, frecce, Home/End, Pagina giù;
- comfortClass.

**Integrazione**: l'ascoltatore globale del tocco (il suono dei pulsanti), messo insieme a pulsanti veri. Verifica che il click non venga mai annullato:
- con un tocco fermo;
- con un tocco che si è mosso;
- dopo un pointercancel;
- se il pulsante cambia tra la pressione e il rilascio;
- con penna e mouse;
- con pulsanti disabilitati o esclusi.

Verifica anche le schede della simulazione con il loro stato e i pannelli, e che 10 tocchi veloci su "Più alberi" diano 10.

**Telefono simulato**. Tre telefoni: *android* (Pixel 7), *iphone* (schermo e user agent di iPhone 13, su Chromium perché WebKit non è installato qui) e *android-lento* (Pixel 7 con la CPU rallentata 6 volte, come un telefono economico).

Ogni tocco passa per la vera catena del dito (touchstart → touchend → pointer → click), al centro del comando, senza nessun aiuto da Playwright: se qualcosa copre il comando, il dito finisce lì come su un telefono. Per ogni tocco la suite registra **dove si perde**:

| Campo | Domanda | Se è no |
|---|---|---|
| hit | Sotto il dito c'è il comando? | Qualcosa di invisibile lo copre (frontend) |
| touch | La pagina ha ricevuto il tocco? | Il tocco non arriva (telefono/touch) |
| click | Il browser l'ha trasformato in un click? | Il tocco non è diventato un tocco "valido" |
| prevented | L'app ha annullato il tocco o il click? | Il frontend lo inghiotte |
| response | Quanti ms dal sollevamento del dito al primo cambiamento sullo schermo | Il frontend è lento |
| longTask | Blocco più lungo del frontend intorno al tocco | Il frontend era occupato |

## Risultati
**Unit e integrazione**: 94 file, **445 test, tutti superati**. Sono i 413 test di prima più i 32 nuovi.

**Telefono simulato**: **22 superati, 14 falliti**. Tutti i 14 fallimenti sono problemi reali dell'app, elencati sotto.

| Scenario | android | iphone | android-lento |
|---|---|---|---|
| Selettori: ogni pulsante riceve il dito | ✓ | ✓ | ✓ |
| Selettori: Settore urbano apre il modulo | ✓ | ✓ | ✓ |
| Primo tocco appena compare la pagina | ✗ (velo di caricamento) | ✗ (velo di caricamento) | ✓ |
| Benvenuto: ogni pulsante riceve il dito | ✗ (barra morta) | ✗ | ✗ |
| Barra in basso: Dashboard | ✓ | ✓ | ✓ |
| Pulsante account apre il pannello | ✓ | ✓ | ✓ |
| Piazza: schede Mappa e Simula | ✗ (avviso sopra l'intestazione) | ✗ | ✗ |
| 5 tocchi veloci su Più alberi | ✓ 5/5 | ✓ 5/5 | ✓ 5/5 |
| Lo scorrimento non preme, il tocco dopo sì | ✓ | ✓ | ✓ |
| Una sola barra e una sola nota | ✗ 2 e 2 | ✗ 2 e 2 | ✗ 2 e 2 |
| Dopo lo scorrimento la fotocamera risponde | ✗ | ✗ | ✗ |
| Vigneto e dashboard: ogni pulsante riceve il dito | ✗ (barra morta, avviso) | ✗ | ✗ |

Nota sulla riga "Piazza: schede": le due schede rispondono al tocco. Il test fallisce per i pulsanti coperti dall'avviso, che la stessa prova controlla.

**I numeri dei tocchi** (16 tocchi per telefono):

| | android | iphone | android-lento |
|---|---|---|---|
| Tocchi arrivati alla pagina | 16/16 | 16/16 | 15/15 |
| Diventati click | 16/16 | 16/16 | 15/15 |
| Annullati dall'app | 1 (il click sul link Dashboard, annullato di proposito dal router per cambiare pagina senza ricaricarla: normale) | 1 (idem) | 1 (idem) |
| Dal sollevamento del dito al click | 3 ms (mediana) | 3 ms | 27 ms |
| Dal sollevamento del dito al cambiamento sullo schermo | 38 ms (mediana), 55 ms al massimo | 37 ms, 53 ms | **318 ms, 492 ms** |
| Blocco più lungo del frontend durante un tocco | 56 ms | 54 ms | **512 ms** |

**All'apertura delle pagine** (blocco più lungo / tempo totale bloccato):

| Pagina | android | android-lento |
|---|---|---|
| Selettori | 80 ms / 30 ms | 226 ms / 513 ms |
| Piazza | 80 ms / 35 ms | **473 ms / 966 ms** |
| Vigneto | 69 ms / 37 ms | **516 ms / 944 ms** |
| Dashboard | 0 / 0 | 61 ms / 19 ms |

## I problemi, uno per uno

### 1. Barra in basso e nota a piè di pagina doppie (grave · è il "scatta e non risponde")
- **Cosa succede.** Da ospite ogni pagina ha 2 `nav.ps-nav` e 2 note "I risultati del simulatore sono indicativi…". La prima copia è quella preparata dal server: mostra "Cronologia" invece di "Ospite" e nessuno la gestisce. La seconda è quella vera.
- **Perché.** In `src/routes/__root.tsx` (righe 710 e 713) la barra e la nota si mostrano con `!(introSeen() && !getProId() && !useGuest())`. Ma:
  - `introSeen()` e `getProId()` leggono la memoria del telefono **durante il disegno**: il server dà un risultato, il telefono un altro;
  - `useGuest()` sul server vale sempre `false`.

  Il server disegna barra e nota, il primo disegno del telefono no. React 19, quando dentro `<body>` trova elementi che non si aspetta, li lascia dove sono invece di toglierli. Poi `useGuest` diventa vero e React aggiunge la barra vera: ne restano due.
- **Quando si vede.** La barra vera scende quando si scorre in giù o quando si tocca uno spazio vuoto ("Bottom bar out of the way"). La copia morta resta ferma e diventa quella in vista. Il test: dopo uno scorrimento, toccando la fotocamera il dito trova "barra 1 di 2", il tocco arriva (touch ✓, click ✓ sull'icona), il foglio della fotocamera non si apre. I link della copia morta sono link semplici: ricaricano tutta la pagina, lentamente.
- **Correzione proposta** (non applicata). Calcolare la condizione solo dopo il montaggio, con `useSyncExternalStore` e un valore del server uguale al primo disegno del telefono, oppure con un flag `mounted`. Così server e telefono disegnano la stessa cosa. In alternativa: disegnare sempre barra e nota e nasconderle con una classe.

### 2. Il velo di caricamento prende il primo tocco (alta)
- **Cosa succede.** Il primo tocco su "Entra come ospite", appena la pagina compare, finisce su `#mdt-preloader.plain.out` (opacità tra 1 e 0,05, ancora in dissolvenza). Il secondo tocco funziona.
- **Perché.** In `src/lib/preloader.ts` `.out` ha `opacity:0; visibility:hidden` con una transizione di 0,25–0,5 s. `visibility` resta "visible" fino alla fine della transizione, e intanto il velo (z-index 2147483000) riceve i tocchi.
- **Correzione proposta.** Aggiungere `pointer-events:none` a `#mdt-preloader.out`.

### 3. Gli avvisi coprono l'intestazione (media)
- **Cosa succede.** Mentre un avviso è in alto (`li.toast.app-toast`, in alto al centro), i pulsanti "Apri account", "Come funziona" e "Attiva tema chiaro" sono sotto l'avviso. Succede su piazza e vigneto, dove il GPS ne mostra spesso.
- **Correzione proposta.** Spostare gli avvisi un po' più in basso dell'intestazione (un `offset` di sonner pari all'altezza dell'intestazione), oppure farli comparire in basso sopra la barra.

### 4. Lentezza su telefoni economici (media)
- Con la CPU rallentata 6 volte:
  - ogni tocco su una leva blocca il frontend 0,35–0,6 s, perché ridisegna tutta la simulazione;
  - l'apertura di Piazza e Vigneto lo blocca per circa 1 s in tutto.
- I tocchi non si perdono, ma sembrano "non rispondere" per mezzo secondo.
- **Proposta.** Ridurre il lavoro per ogni tocco su una leva:
  - aggiornare subito il numero della leva e rimandare a dopo il calcolo pesante (`startTransition` o `useDeferredValue` per la mappa e i calcoli);
  - memorizzare le parti che non cambiano.

### 5. Comandi sotto i 44 px (bassa · accessibilità)
- Intestazione (account, "i", tema): 36 × 36.
- Livelli "Interventi leggeri / medi / completo": 80 × 36.
- Stagioni della dashboard: 67 × 36.
- "Che cos'è la temperatura percepita": 28 × 28.
- Riga del luogo "Nessun luogo scelto": 158 × 24.
- "Modifica" in dashboard: 40 di altezza.

## Altre note
- **La barra in basso copre i comandi che le passano sotto** (per esempio "Più alberi" quando è in fondo allo schermo). È normale per una barra fissa: basta scorrere. La pagina ha già lo spazio in fondo.
- **7 errori di tipo su main** (`npx tsc`), già presenti prima di questi test e arrivati con l'altra sessione:
  - `src/models/professional-id.ts`;
  - `src/views/SensorAdvisor.tsx`;
  - `src/views/account-control.tsx`;
  - `src/views/v10/Dashboard.tsx` (2);
  - `src/views/v10/SimMap.tsx`;
  - `src/views/v10/intro.tsx`.

  La build passa lo stesso, perché la build non controlla i tipi.
- **Limiti della simulazione.** Chromium al posto di Safari per l'iPhone. Il servizio account è finto (nessun accesso). Il telefono lento è solo una CPU rallentata, senza rete lenta.
- **Come provare un telefono vero.** Una pagina di diagnostica sul telefono (che disegna i tocchi e scrive dove finiscono) è il passo successivo, se il problema resta dopo le correzioni 1 e 2.

## Ordine consigliato delle correzioni
1. Barra e nota doppie (problema 1). Poi rilanciare `npm run test:touch`: i test "una sola barra" e "fotocamera dopo lo scorrimento" devono passare.
2. Il velo di caricamento con `pointer-events:none` (problema 2): il test "primo tocco" deve passare.
3. Gli avvisi sotto l'intestazione (problema 3).
4. Lentezza delle leve sui telefoni economici, poi i comandi piccoli.
