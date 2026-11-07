# Piano · Progetti condivisi

Stato: **da fare** (piano scritto il 07/11/2026, messo da parte per un altro giorno).
Bozza grafica: `docs/progetti-condivisi/mock.html` (aprila nel browser: 5 schermate).

## L'idea in una riga

Più persone lavorano sulla **stessa piazza o sullo stesso vigneto**, ognuna dal suo telefono o PC,
e vedono le stesse cose: mappa, area e zone, interventi, cronologia, foto e video.

Non è avere tanti account sullo stesso telefono: ognuno usa il suo account, e il progetto è condiviso.

## Cosa c'è oggi (punto di partenza)

| Cosa | Dove sta oggi | Condivisibile così com'è? |
|---|---|---|
| Leve, area disegnata, zone, luoghi (lab-store) | **solo sul dispositivo** (localStorage `mdt-lab-…`) | No: prima va portato nell'account |
| Cronologia interventi | tabella `intervention_history`, per `user_id` (RLS del solo proprietario) | No: legata alla persona |
| Foto e video | bucket `lab-media`, cartella `<user>/…` | No: legata alla persona |
| Archivio, "fuori dalla simulazione" | file `<user>/meta/*.json` | No |
| Registro / approvazioni piazza | `urban_dashboard_state`, `external_approval_requests` | No |
| Chi ha registrato (ufficio, ruolo) | `intervention_history.by` | Sì, si riusa |

Quindi il lavoro è: **dare a ogni progetto un suo posto nel cloud**, e far leggere e scrivere lì
tutte le persone invitate.

## Le fasi

### Fase 0 · La simulazione nell'account (prerequisito)
Oggi cambiando telefono non ritrovi la piazza disegnata. Serve comunque, anche senza condivisione.
- Tabella `projects` (id, owner, kind `piazza|vigneto`, name, place {label, lat, lng}, state jsonb, updated_at, updated_by).
- `state` = la parte del lab-store di quel progetto (leve, area con zone ed edits, mix delle zone del vigneto).
- Il lab-store scrive nel progetto 1 s dopo l'ultima modifica e lo rilegge all'apertura e al ritorno nell'app.
- Al primo accesso: il progetto viene creato da ciò che c'è sul telefono (nessun dato perso).
- Ospiti: tutto resta sul telefono come oggi.

### Fase 1 · Condividere (la più importante)
- Tabelle `project_members` (project_id, user_id, role `owner|editor|viewer`, added_at) e
  `project_invites` (project_id, email, role, token, invited_by, created_at, accepted_at).
- Regole di accesso (RLS): vede il progetto chi ne è membro; modifica solo owner/editor;
  solo l'owner invita, cambia ruoli e toglie persone.
- Pulsante **Condividi** accanto al titolo della simulazione, con le foto dei membri (schermata 1).
- Pannello **Condividi la piazza / il vigneto** (schermata 2): email, "Può modificare | Solo visione",
  "Invia invito", "Link", elenco "Chi ha accesso" con ruolo modificabile e inviti "In attesa".
- Invio dell'invito: email con link `/invito/<token>` (server function con la service key, come le approvazioni).
- Pagina **invito** (schermata 5): "Marco ti ha invitato…", Accetta e apri / Non ora; se non hai fatto
  l'accesso, prima l'accesso (Google o email) e poi torna lì da sola.
- **Benvenuto** (schermata 4): "I miei progetti" e "Condivisi con me", "+ Nuovo progetto".
- Solo visione: leve, disegno e foto in sola lettura (avviso "Solo visione: chiedi a Marco di poter modificare").

### Fase 2 · Cronologia, foto e video del progetto
- `intervention_history` riceve `project_id` (e l'autore c'è già in `user_id` + `by`):
  RLS "membro del progetto" invece di "proprietario".
- Filtri della cronologia per persona: Tutti · Miei · <nome> (schermata 3); ogni riga con foto e nome.
- Foto e video in `lab-media/projects/<project_id>/…` con regole di accesso ai membri.
  I file già caricati restano dove sono e vengono collegati al progetto (nessuno spostamento pesante).
- Archivio e "fuori dalla simulazione" diventano del progetto (`projects/<id>/meta/*.json`).

### Fase 3 · In diretta
- Supabase Realtime sulla riga del progetto e sulla cronologia: quando un collega salva,
  gli altri si aggiornano da soli con un avviso ("Laura ha aggiunto 3 alberi").
- "In diretta · Laura sta modificando la mappa" e i pallini con i nomi sulla mappa (Realtime Presence).
- Conflitti: vince l'ultima modifica, per pezzo (leve, area, ogni zona separata), così due persone
  su zone diverse non si cancellano a vicenda.

### Fase 4 · Commenti (facoltativa)
- Commento su un intervento o su una zona (es. la Soprintendenza: "no sul lato della fontana"),
  in cronologia con l'icona del fumetto.

## Cosa semplificare insieme
Con i progetti condivisi la collaborazione passa dal progetto, non dagli account sul telefono:
- un account per persona, con **Cambia account** nel pannello (scelta dell'account Google);
- il carosello dei profili resta solo come "account usati su questo telefono", senza le regole speciali
  tra account e settori;
- da valutare se togliere la regola "un account, un settore" (un agronomo esterno potrebbe seguire
  sia un vigneto sia una piazza).

## Costi e limiti da tenere d'occhio
- Piano gratuito Supabase: 5 GB di traffico al mese, già superati una volta (31/10). Con più persone sullo
  stesso progetto le foto si scaricano più volte: tenere le miniature leggere (già fatto) e i link stabili (già fatto).
- Realtime nel piano gratuito: fino a 200 connessioni contemporanee, bastano.
- Email degli inviti: servono un mittente e un servizio di invio (lo stesso delle richieste di approvazione).

## Come lo proveremo
Da qui non si raggiunge Supabase né il vero Google: si usa il metodo già provato sull'accesso,
cioè Playwright con le risposte di Supabase simulate (`oauth*.cjs` nello scratchpad), più due browser
aperti insieme per vedere gli aggiornamenti in diretta. Poi la prova vera sul telefono e sul PC.

## Domande aperte (da decidere quel giorno)
1. I pallini con i nomi sulla mappa servono, o basta "Laura sta modificando"?
2. I commenti (fase 4) servono subito?
3. Un invitato in "Solo visione" può scattare foto?
4. La regola "un account, un settore" resta?
5. Gli enti (Soprintendenza…) entrano come "Solo visione" al posto dell'email di approvazione, o in aggiunta?

## Ordine consigliato
Fase 0 → Fase 1 → Fase 2 → Fase 3 → (Fase 4). Ogni fase è utilizzabile da sola e va pubblicata e provata
prima della successiva.
