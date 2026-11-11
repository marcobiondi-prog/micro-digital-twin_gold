# Piano · Revisione UI/UX (proposta di design)

*11/11/2026 · stato: **proposta, da non implementare** finché non viene approvata*

Il canvas di design è qui: https://claude.ai/artifact/HvKysx9AtTXXkS9FxS75G2 (è privato: si condivide dal menu Condividi).
Il brief di partenza è in `docs/design-handoff.md`.

## Principi
- Partiamo dallo stile di oggi (tela scura da console, turchese di Twin, pulsanti bianchi) e lo semplifichiamo: niente nuovi colori di marca.
- Una sola azione principale per schermata, sempre una pillola bianca. Le azioni secondarie hanno un bordo, le distruttive sono rosse e tenui.
- Ogni area di tocco misura almeno 44 px. Il contrasto è almeno 4,5:1 sia nel tema chiaro sia in quello scuro.
- Animazioni solo con transform e opacity, ferme con movimento ridotto (come oggi).

## 1. Selettori (`src/views/v10/SectorGate.tsx`, `src/views/v10/intro.tsx` per /scegli)
Proposta (artboard "Proposta · Selettori"):
- Un indicatore "Passo 1 di 2" con due trattini: 1 è il settore, 2 è chi sei (carosello dei profili o modulo).
- Il titolo diventa "Dove lavori?", al posto di "Da dove vuoi usarmi?". Una riga sotto: "Scegli il settore. Poi ti identifichi e si apre la tua simulazione."
- Due schede, **Piazza** e **Vigneto**, con un'icona in un riquadro colorato (cielo per la piazza, smeraldo per il vigneto) e una riga che dice per chi è e a cosa serve.
- In fondo, "Ho già un account · Accedi" come pulsante bianco e "Prova come ospite" con il bordo. Sotto, la nota "Da ospite non si salvano la cronologia né i report."
- L'etichetta BETA resta accanto a "Micro Digital Twin".

Da decidere: se "Accedi" debba diventare il pulsante principale anche per chi entra per la prima volta.

## 2. Simula piazza (`src/views/v8/SimShell.tsx`, `src/views/v9c/UrbanThermometer.tsx`, `src/views/v10/SimMap.tsx`)
Proposta (artboard "Proposta · Simula piazza"):
- Intestazione compatta: in piccolo "Piazza · città", sotto il nome del luogo come titolo, a destra il ⋮. Le schede Mappa · Simula · Sensori diventano un controllo segmentato a tutta larghezza.
- **Il risultato in alto**, al posto dell'anteprima della mappa:
  - nella stessa riga il chip "Estate · ore 15:00" (apre il selettore) e l'etichetta del comfort colorata;
  - il semicerchio, con la lettura grande al centro e sotto "−2,4° rispetto a senza interventi";
  - sotto l'arco, gli estremi: "Minimo" a sinistra, "Media stagionale" a destra;
  - i tre livelli come pillole: Leggeri · Medi · Completo, quello in uso bianco.
- **Interventi**: una riga compatta per ogni leva (pallino del suo colore, nome, nota, − valore +). Spariscono le dieci tacche.
- **Cosa ottieni**: tre riquadri in fila (CO₂, pioggia trattenuta, posti all'ombra). Il testo delle ipotesi si apre a richiesta.
- **Foto e video**: una riga piegata con il conteggio, che si apre a richiesta.
- L'anteprima della mappa si toglie da Simula (oggi è un solo punto in SimShell: `{tab === "simula" && <SimMap kind={kind} preview />}`). La mappa resta nella sua scheda.

Da decidere: se tenere comunque una mappa piccola sotto il risultato.

## 3. Simula vigneto (`src/views/v10/VineThirst.tsx`)
Stessa struttura della piazza:
- in alto il risultato (bisogno di intervento con le fasce verde, ambra e rosso) e le zone come pillole "Tutte · Zona 1 · 2 · 3";
- poi le leve compatte (Irrigazione, Teli d'ombra, Frangivento);
- poi la fisarmonica di oggi (Cosa fare adesso, Acqua necessaria, Prossimi 7 giorni).

Artboard ancora da fare.

## 4. Componenti (`src/styles.css`, `src/components/ui/*`)
Proposta (artboard "Proposta · Componenti"):
- **Colori scuri**: pagina #0b0f17, scheda #121826, rilievo #1e2534, testo #e6eaf2, Twin #2dd4bf, azione #ffffff. Servono anche i corrispondenti chiari.
- **Scala del calore** in 5 passi: #38bdf8, #2dd4bf, #fbbf24, #fb923c, #ef4444.
- **Tipografia**: numeri e titoli in carattere display sottile (56 / 32 px), titoli di scheda 18 px semibold, testo 15 px, note 12 px.
- **Pulsanti**: principale bianco 52 px, secondario con bordo 48 px, distruttivo rosso tenue, segmentato con l'opzione attiva in rilievo.
- **Etichette**: BETA (turchese con bordo), In sviluppo (ambra), lucchetto "Solo con profilo" (grigio), Salvato (verde).
- **Avviso**: la pillola ardesia di oggi, invariata.

## 5. Ancora da disegnare
- Identificazione (passo 2: carosello dei profili e modulo) e la pagina "Un account, un settore".
- Mappa: raccogliere AreaBar, SimBar e ZonesBar in un unico foglio dal basso con le schede Area · Zone · Disposizione.
- Dashboard: un riepilogo leggibile in 5 secondi.
- Cronologia e Pannello account.
- Il tema chiaro di tutte le proposte.

## 6. Quando si implementerà (non ora)
1. Prima i token e i componenti (punto 4), senza cambiare le pagine.
2. Poi i selettori, che toccano poco codice.
3. Poi Simula piazza e Simula vigneto, una alla volta, con le prove su telefono, chiaro e scuro e movimento ridotto.
4. Per ogni passo:
   - `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build`;
   - una riga in AGENTS.md;
   - prima di toccare le pagine in comune (SectorGate, SimShell), controllare main: un'altra sessione ci lavora.
