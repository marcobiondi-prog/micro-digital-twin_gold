import { useContext, useEffect, useState, type ReactNode } from "react";
import { comparison, nextPhase, prototypeChoice } from "@/models/scenarios";
import { UNIT_COST, grouped } from "@/models/intervention-cost";
import { VINE_UNIT_COST } from "@/models/vine-interventions";
import { introSeen } from "@/lib/intro-seen";
import { useSignedIn } from "@/lib/use-signed-in";
import { Check, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import { openAccount } from "@/lib/camera-dock";
import { cn } from "@/lib/utils";
import { Faq, InfoCard, InfoNav, InfoPage, PageLink } from "./InfoPage";
import { AI_STANDBY } from "@/lib/ai-standby";
import { GNSS } from "@/models/gnss";
import { LIBRARIES, SERVICES } from "@/models/credit-logos";
import { LogoTiles } from "./LogoTiles";

const eur = (n: number) => `${grouped(n)} €`;
const level = (id: string) => comparison.find((l) => l.id === id)!;

/** Domande frequenti: the old "Costi e tempi" table, opened up into plain questions and answers. */
export function FaqPage() {
  const [zero, mvp, full] = [level("zero"), level("mvp"), level("roadmap")];
  return (
    <InfoPage title="Domande frequenti" intro="Costi, tempi e cosa si impara con i tre livelli di intervento, in poche risposte.">
      <div className="space-y-2">
        <Faq q="Che cosa simula l'app?">
          <p>Due luoghi: una piazza, dove alberi, prato e ombra tolgono gradi al calore percepito, e un vigneto, dove irrigazione, teli d'ombra e frangivento tolgono sete alle viti. Muovi il punto bianco sull'arco o i comandi sotto e vedi subito l'effetto e quanto costa.</p>
        </Faq>
        <Faq q="Cosa vogliono dire i tre livelli?">
          <ul>
            <li><b>{zero.s}</b>: {zero.def}</li>
            <li><b>{mvp.s}</b>: {mvp.def}</li>
            <li><b>{full.s}</b>: {full.def}</li>
          </ul>
        </Faq>
        <Faq q="Quanto costa ogni livello?">
          <ul>
            <li><b>{zero.s}</b>: {zero.cost}, si usano i dati che ci sono già.</li>
            <li><b>{mvp.s}</b>: una spesa contenuta per pochi sensori nei punti giusti.</li>
            <li><b>{full.s}</b>: un budget importante e continuo (misure, droni, modello 3D).</li>
          </ul>
          <p>Gli interventi hanno poi il loro costo, stimato nelle simulazioni (IVA esclusa, solo come ordine di grandezza):</p>
          <ul>
            <li>Piazza: albero {grouped(UNIT_COST.tree.lo)}–{eur(UNIT_COST.tree.hi)} l'uno, prato {UNIT_COST.lawnM2.lo}–{UNIT_COST.lawnM2.hi} €/m², ombra {UNIT_COST.shadeM2.lo}–{UNIT_COST.shadeM2.hi} €/m².</li>
            <li>Vigneto, all'ettaro: irrigazione a goccia {grouped(VINE_UNIT_COST.irrigation.lo)}–{eur(VINE_UNIT_COST.irrigation.hi)}, teli d'ombra {grouped(VINE_UNIT_COST.shade.lo)}–{eur(VINE_UNIT_COST.shade.hi)}, frangivento {grouped(VINE_UNIT_COST.windbreak.lo)}–{eur(VINE_UNIT_COST.windbreak.hi)}.</li>
          </ul>
        </Faq>
        <Faq q="Quanto tempo serve?">
          <ul>
            <li><b>{zero.s}</b>: {zero.time.toLowerCase()}.</li>
            <li><b>{mvp.s}</b>: {mvp.time.toLowerCase()}.</li>
            <li><b>{full.s}</b>: {full.time.toLowerCase()}.</li>
          </ul>
        </Faq>
        <Faq q="Quanto è precisa la stima?">
          <ul>
            <li><b>{zero.s}</b>: {zero.prec.toLowerCase()}.</li>
            <li><b>{mvp.s}</b>: {mvp.prec.toLowerCase()}.</li>
            <li><b>{full.s}</b>: {full.prec.toLowerCase()}.</li>
          </ul>
          <p>I risultati sono indicativi e non sostituiscono modelli fisici calibrati.</p>
        </Faq>
        <Faq q="Cosa si impara nella piazza?">
          <ul>{comparison.map((l) => <li key={l.id}><b>{l.s}</b>: {l.test.urban}</li>)}</ul>
        </Faq>
        <Faq q="Cosa si impara nel vigneto?">
          <ul>{comparison.map((l) => <li key={l.id}><b>{l.s}</b>: {l.test.vineyard}</li>)}</ul>
        </Faq>
        <Faq q="Da quale livello conviene partire?">
          <p>{prototypeChoice}</p>
          <p>{nextPhase}</p>
        </Faq>
        <Faq q="Da dove vengono i dati?">
          <p>Il calore e la temperatura di ogni stagione e ora sono la media dell'ultimo anno nel luogo scelto; la superficie viene misurata sulla forma del luogo disegnata sulla mappa. Quando un dato reale non è disponibile l'app lo dice e usa una stima. Le fonti sono elencate in <PageLink to="/legale/licenze">Licenze</PageLink>.</p>
        </Faq>
        <Faq q="I miei dati vengono salvati?">
          <p>Come ospite le simulazioni, le foto e i video restano su questo dispositivo. Con un account vengono salvati nel tuo spazio personale, visibile solo a te. I dettagli sono nell'<PageLink to="/privacy/informativa">Informativa sulla privacy</PageLink>.</p>
        </Faq>
      </div>
    </InfoPage>
  );
}

const DRAFT = "Testo di esempio da completare e far verificare prima della pubblicazione. Le parti tra parentesi quadre vanno sostituite.";

export function CookiePage() {
  return (
    <InfoPage title="Informativa sui cookie" intro={DRAFT}>
      <InfoCard title="Niente cookie di profilazione">
        <p>L'app non usa cookie di profilazione né di pubblicità e non traccia la tua navigazione per altri scopi.</p>
      </InfoCard>
      <InfoCard title="Cosa salviamo sul dispositivo">
        <p>Per funzionare l'app salva alcune informazioni tecniche nella memoria del browser (non sono cookie di terze parti):</p>
        <ul>
          <li>la sessione di accesso, se hai un account;</li>
          <li>il tema scelto e se hai già visto il tutorial;</li>
          <li>lo stato delle simulazioni e le scansioni della fotocamera AI della sessione;</li>
          <li>le foto e i video caricati come ospite;</li>
          <li>una copia dell'app per usarla anche senza rete.</li>
        </ul>
        <p>Puoi cancellare tutto in <PageLink to="/privacy/preferenze">Preferenze privacy</PageLink>.</p>
      </InfoCard>
      <InfoCard title="Mappe">
        <p>Quando apri una mappa interattiva, il servizio che la fornisce può usare propri cookie tecnici, secondo la sua informativa.</p>
      </InfoCard>
    </InfoPage>
  );
}

export function PrivacyPage() {
  return (
    <InfoPage title="Informativa sulla privacy" intro={DRAFT}>
      <InfoCard title="Chi tratta i dati">
        <p>Titolare del trattamento: [nome e indirizzo], contatto: [email]. Per ogni richiesta sui tuoi dati puoi scrivere a questo indirizzo.</p>
      </InfoCard>
      <InfoCard title="Quali dati">
        <ul>
          <li><b>Account</b>: email e, se accedi con un account esterno, nome e immagine del profilo.</li>
          <li><b>Simulazioni</b>: i valori scelti, il luogo e il registro degli interventi.</li>
          <li><b>Foto e video</b> che carichi o scatti, con le loro didascalie.</li>
          <li><b>Posizione</b>, solo se tocchi «La mia posizione» per cercare un luogo.</li>
        </ul>
      </InfoCard>
      <InfoCard title="Perché e su quale base">
        <ul>
          <li>Per farti usare l'app e salvare il tuo lavoro (esecuzione del servizio richiesto).</li>
          <li>Per riconoscere piante e terreno nelle foto della fotocamera AI: la foto viene inviata a un servizio di intelligenza artificiale solo quando avvii una scansione.</li>
          <li>Per mostrare meteo, mappe e superfici dei luoghi: ai servizi esterni vengono inviate solo le coordinate del luogo scelto.</li>
        </ul>
      </InfoCard>
      <InfoCard title="Dove e per quanto">
        <p>Come ospite i dati restano sul tuo dispositivo. Con un account sono conservati nel tuo spazio personale, accessibile solo a te, finché non li cancelli o chiudi l'account. Fornitori dei servizi: [elenco dei responsabili del trattamento e paesi].</p>
      </InfoCard>
      <InfoCard title="I tuoi diritti">
        <p>Puoi chiedere di vedere, correggere, esportare o cancellare i tuoi dati, opporti al trattamento e reclamare al Garante per la protezione dei dati personali.</p>
      </InfoCard>
    </InfoPage>
  );
}

/** Real controls on what stays on this device: the tutorial at the next opening, and wiping the device's saved data. */
export function PrivacyPrefsPage() {
  const [tutorial, setTutorial] = useState(() => typeof window !== "undefined" && !introSeen());
  const [confirm, setConfirm] = useState(false);
  const wipe = async () => {
    try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* storage blocked */ }
    try {
      const dbs = (await indexedDB.databases?.()) ?? [];
      await Promise.all(dbs.map((d) => (d.name ? new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null); }) : null)));
    } catch { /* not supported */ }
    window.location.assign("/");
  };
  const row = "flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 text-left";
  return (
    <InfoPage title="Preferenze privacy" intro="Quello che l'app tiene su questo dispositivo, e come cancellarlo.">
      <InfoCard title="Tutorial">
        <label className={row}>
          <span className="min-w-0 flex-1">Mostra il tutorial alla prossima apertura</span>
          <input type="checkbox" className="size-6 accent-current" checked={tutorial}
            onChange={(e) => { setTutorial(e.target.checked); try { if (e.target.checked) window.localStorage.removeItem("mdt-intro-seen"); else window.localStorage.setItem("mdt-intro-seen", "1"); } catch { /* storage blocked */ } }} />
        </label>
      </InfoCard>
      <InfoCard title="Dati su questo dispositivo">
        <p>Cancella simulazioni, preferenze, foto e video salvati come ospite e la sessione di accesso su questo dispositivo. I dati del tuo account online non vengono toccati.</p>
        {confirm ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirm(false)} className="h-12 flex-1 rounded-full bg-foreground/[0.08] font-semibold">Annulla</button>
            <button type="button" onClick={() => void wipe()} className="h-12 flex-1 rounded-full bg-danger font-semibold text-white">Cancella tutto</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="h-12 w-full rounded-full bg-foreground/[0.08] font-semibold">Cancella i dati sul dispositivo</button>
        )}
      </InfoCard>
    </InfoPage>
  );
}

const GNSS_TILES = GNSS.map((g) => ({ id: g.id, name: g.name, sub: g.country, articles: g.articles }));

export function LicensesPage() {
  return (
    <InfoPage title="Licenze" intro="Il software aperto e i dati che rendono possibile l'app, con le loro licenze.">
      <InfoCard title="Servizi usati dall'app">
        <p>I servizi da cui arrivano mappe, meteo, dati e intelligenza artificiale.</p>
        <LogoTiles items={SERVICES} cacheKey="mdt-service-logo-v1" label="Servizi" />
        <p className="text-sm text-muted-foreground">I loghi sono di Simple Icons (licenza CC0) o di Wikimedia Commons; i marchi appartengono ai rispettivi titolari e sono mostrati solo come riconoscimento.</p>
      </InfoCard>
      <InfoCard title="Dati">
        <ul>
          <li>Dati cartografici © contributori di OpenStreetMap, licenza ODbL.</li>
          <li>Dati meteo di Open-Meteo, licenza CC BY 4.0.</li>
          <li>Contiene dati Copernicus Sentinel modificati.</li>
          <li>Dati climatici del progetto NASA POWER.</li>
          <li>Dati dei sensori di Sensor.Community, licenza DbCL/ODbL.</li>
          <li>Foto di riferimento delle piante: autore e licenza indicati sotto ogni foto (Royal Botanic Gardens, Kew; GBIF).</li>
          <li>Immagini satellitari della mappa 2D © Esri, Maxar, Earthstar Geographics.</li>
          <li>Posizione del telefono (tasto GPS della mappa): i sistemi di navigazione satellitare GPS (Stati Uniti), Galileo (Unione europea), GLONASS (Russia), BeiDou (Cina), QZSS (Giappone) e NavIC (India), secondo quelli che il telefono riceve. L'app legge solo la posizione che il telefono le passa, con il tuo permesso.
            <LogoTiles items={GNSS_TILES} cacheKey="mdt-gnss-logo-v1" label="Sistemi satellitari" />
          </li>
          <li>Elenco dei comuni italiani: dati ISTAT (2020) da comuni-json di Matteo Contrini, licenza MIT.</li>
          <li>Stemmi dei comuni e delle regioni e loghi dei sistemi satellitari da Wikimedia Commons (trovati tramite Wikidata): autore e licenza nella pagina di ogni file. I loghi appartengono ai rispettivi titolari e sono mostrati solo come riconoscimento.</li>
        </ul>
      </InfoCard>
      <InfoCard title="Permessi del telefono">
        <p>L'app usa queste funzioni del telefono solo con il tuo permesso, e solo mentre la usi:</p>
        <ul>
          <li>Posizione: per trovare il luogo sulla mappa e per il GPS che ti segue. La posizione arriva dai sistemi satellitari qui sopra e non viene condivisa con altri.</li>
          <li>Fotocamera e microfono: per scattare foto, lo scatto multiplo e i video con l'audio. Foto e video restano nella tua simulazione, sul telefono o nel tuo account.</li>
          <li>Notifiche: per avvisarti del cambio dell'ora, anche con l'app in sottofondo.</li>
        </ul>
        <p>Il permesso vero lo dà e lo toglie il telefono. Posizione e fotocamera le puoi revocare anche dentro l'app, in qualsiasi momento, in <PageLink to="/privacy/autorizzazioni">Autorizzazioni</PageLink>: lì trovi anche dove toglierle dalle impostazioni del telefono.</p>
      </InfoCard>
      <InfoCard title="Software">
        <p>Le librerie open source con cui è fatta l'app, con la loro licenza.</p>
        <ul>{LIBRARIES.map((l) => <li key={l.id}>{l.name} — {l.sub}</li>)}</ul>
      </InfoCard>
    </InfoPage>
  );
}

export function TermsPage() {
  return (
    <InfoPage title="Termini di servizio" intro={DRAFT}>
      <InfoCard title="Il servizio">
        <p>Micro Digital Twin è uno strumento dimostrativo per simulare interventi di adattamento al clima in una piazza e in un vigneto. È offerto da [titolare] così com'è, senza garanzie di disponibilità continua.</p>
      </InfoCard>
      <InfoCard title="I risultati">
        <p>Temperature, sete delle viti, costi e superfici sono stime indicative: non sostituiscono rilievi, progetti o il parere di un tecnico o di un agronomo. Le decisioni prese a partire dall'app restano di chi le prende.</p>
      </InfoCard>
      <InfoCard title="Il tuo account e i tuoi contenuti">
        <p>Sei responsabile delle credenziali e dei contenuti che carichi (foto, video, note): devi averne i diritti e non devono ritrarre persone senza il loro consenso. Puoi cancellarli in qualsiasi momento.</p>
      </InfoCard>
      <InfoCard title="Uso corretto">
        <p>Non usare l'app per scopi illeciti né per sovraccaricare i servizi. In caso di abuso l'accesso può essere sospeso.</p>
      </InfoCard>
      <InfoCard title="Modifiche e legge applicabile">
        <p>I termini possono cambiare: la versione aggiornata è sempre su questa pagina. Si applica la legge italiana; foro competente: [città].</p>
      </InfoCard>
    </InfoPage>
  );
}

/** The two plans in a few plain lines: what Free gives, and what Premium adds on top. */
const FREE_FEATURES = [
  "Simulazione della piazza e del vigneto, con costi e benefici",
  "Stagioni e ore con il clima reale del luogo",
  "Mappa 2D e ricerca del luogo",
  "Foto e video, registro interventi e quaderno di campagna",
  "Report PDF, dati per le mappe e link di condivisione",
];
const PREMIUM_FEATURES = [
  AI_STANDBY ? "Fotocamera AI (in sviluppo, arriverà con un prossimo aggiornamento)" : "Fotocamera AI: riconosce piante e terreno",
  "Mappa 3D del luogo e dati da satellite",
  "Meteo reale come punto di partenza",
  "Piano di interventi e posizione dei sensori suggeriti dall'AI",
  "Email di approvazione agli enti e iter salvato nell'account",
  "Archivio online di foto e video",
];

function PlanCard({ name, price, lead, features, current, action }: { name: string; price: string; lead?: string; features: string[]; current: boolean; action?: ReactNode }) {
  return (
    <section aria-label={`Piano ${name}${current ? ", il tuo piano" : ""}`}
      className={cn("space-y-3 rounded-3xl p-5", current ? "bg-foreground/[0.08] ring-2 ring-foreground shadow-[0_0_24px_rgb(255_255_255/0.08)]" : "bg-foreground/[0.04] text-foreground/75")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-light tracking-tight text-foreground">{name}</h2>
          <p className="text-sm text-muted-foreground">{price}</p>
        </div>
        {current && <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">Il tuo piano</span>}
      </div>
      {lead && <p className="text-sm font-semibold text-foreground">{lead}</p>}
      <ul className="space-y-2 text-[15px] leading-snug">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5"><Check className={cn("mt-0.5 size-4 shrink-0 stroke-[3]", current ? "text-ok" : "text-muted-foreground")} aria-hidden="true" />{f}</li>
        ))}
      </ul>
      {action}
    </section>
  );
}

/** Piani: Free and Premium as two cards, the user's own one highlighted. */
export function PlansPage() {
  const { signedIn } = useSignedIn();
  const nav = useContext(InfoNav);
  // Inside the account panel the sign-in is on the list the back arrow returns to; elsewhere the panel opens.
  const signIn = () => (nav ? nav.back() : openAccount());
  return (
    <InfoPage title="Free e Premium" intro="Premium è gratis: basta registrarsi.">
      <div className="space-y-3">
        <PlanCard name="Free" price="Senza registrazione" features={FREE_FEATURES} current={!signedIn} />
        <PlanCard name="Premium" price="Gratis con la registrazione" lead="Tutto di Free, più:" features={PREMIUM_FEATURES} current={signedIn}
          action={!signedIn && <button type="button" onClick={signIn} className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring">Accedi per passare a Premium</button>} />
        <p className="px-1 text-xs text-muted-foreground">Proposta di suddivisione delle funzioni, da validare con i test di usabilità.</p>
      </div>
    </InfoPage>
  );
}

/**
 * Contatti: who to write to and how. The addresses are left to fill in (like the legal drafts); while one is empty its
 * row says so instead of opening a link that leads nowhere.
 */
const CONTACTS = {
  email: "",
  phone: "",
  address: "",
};
const CONTACT_ROWS: Array<{ icon: LucideIcon; label: string; value: string; href: (v: string) => string; empty: string }> = [
  { icon: Mail, label: "Email", value: CONTACTS.email, href: (v) => `mailto:${v}`, empty: "[indirizzo email del progetto]" },
  { icon: Phone, label: "Telefono", value: CONTACTS.phone, href: (v) => `tel:${v.replace(/\s/g, "")}`, empty: "[numero di telefono]" },
  { icon: MapPin, label: "Sede", value: CONTACTS.address, href: (v) => `https://maps.google.com/?q=${encodeURIComponent(v)}`, empty: "[indirizzo della sede]" },
];

export function ContactsPage() {
  const report = CONTACTS.email
    ? `mailto:${CONTACTS.email}?subject=${encodeURIComponent("Segnalazione · Micro Digital Twin")}&body=${encodeURIComponent(`\n\n—\nPagina: ${typeof window !== "undefined" ? window.location.pathname : ""}\nDispositivo: ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`)}`
    : null;
  return (
    <InfoPage title="Contatti" intro="Domande, idee o un problema con l'app: scrivici, rispondiamo appena possibile.">
      <ul className="overflow-hidden rounded-3xl bg-foreground/[0.05]">
        {CONTACT_ROWS.map(({ icon: Icon, label, value, href, empty }) => {
          const body = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground/[0.08]"><Icon className="size-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{label}</span><span className={cn("block truncate text-[15px] font-semibold", !value && "font-normal text-muted-foreground")}>{value || empty}</span></span>
            </>
          );
          return (
            <li key={label} className="border-b border-foreground/10 last:border-b-0">
              {value
                ? <a href={href(value)} target={label === "Sede" ? "_blank" : undefined} rel="noreferrer" className="flex min-h-16 items-center gap-3 px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{body}</a>
                : <div className="flex min-h-16 items-center gap-3 px-5 py-3">{body}</div>}
            </li>
          );
        })}
      </ul>
      <InfoCard title="Segnala un problema">
        <p>Scrivi cosa stavi facendo e cosa è successo: nell'email aggiungiamo da soli la pagina e il dispositivo, così è più facile capire.</p>
        {report
          ? <a href={report} className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring"><Mail className="size-4" aria-hidden="true" />Scrivi la segnalazione</a>
          : <p className="text-sm text-muted-foreground">Bozza: il pulsante compare quando c'è l'indirizzo email del progetto.</p>}
      </InfoCard>
      <p className="px-1 text-xs text-muted-foreground">Per i dati personali vedi l'<PageLink to="/privacy/informativa">informativa sulla privacy</PageLink>.</p>
    </InfoPage>
  );
}

/**
 * Chi siamo: what the project is, why it exists and who makes it. The team and partner names are left to fill in
 * (bracketed, like the legal drafts).
 */
export function AboutPage() {
  return (
    <InfoPage title="Chi siamo" intro="Micro Digital Twin è un gemello digitale del microclima: una copia al computer di un luogo vero, dove provare gli interventi prima di farli.">
      <InfoCard title="Perché esiste">
        <p>Le estati sono sempre più calde. Nelle piazze il caldo si sente sulla pelle, nei vigneti lo sentono le viti. Spesso però si decide senza poter vedere prima cosa cambia davvero.</p>
        <p>Con l'app chi amministra un comune, chi coltiva o chi studia può provare alberi, prato, ombra, irrigazione o frangivento e vedere subito quanto si guadagna e quanto costa.</p>
      </InfoCard>
      <InfoCard title="Cosa facciamo">
        <ul>
          <li>Simuliamo una piazza e un vigneto con il clima reale del luogo, stagione per stagione.</li>
          <li>Proponiamo tre livelli di intervento, da quello che si può fare subito al progetto completo.</li>
          <li>{AI_STANDBY ? "Raccogliamo foto e video del luogo e mettiamo tutto in un report da condividere." : "Riconosciamo piante e terreno con la fotocamera e raccogliamo tutto in un report da condividere."}</li>
        </ul>
      </InfoCard>
      <InfoCard title="Dove siamo partiti">
        <p>Dal Molise: una piazza nel centro di Campobasso e un vigneto sulle colline della regione. Il metodo vale per qualunque luogo si cerchi sulla mappa.</p>
      </InfoCard>
      <InfoCard title="Il gruppo">
        <p>[Nomi e ruoli del gruppo di lavoro]</p>
        <p>[Scuola, ente o azienda di riferimento]</p>
        <p>[Partner e collaborazioni]</p>
      </InfoCard>
      <p className="px-1 text-sm text-muted-foreground">Vuoi scriverci? Trovi i recapiti nei <PageLink to="/contatti">Contatti</PageLink>.</p>
    </InfoPage>
  );
}
