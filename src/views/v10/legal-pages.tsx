import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { comparison, nextPhase, prototypeChoice } from "@/models/scenarios";
import { UNIT_COST, grouped } from "@/models/intervention-cost";
import { VINE_UNIT_COST } from "@/models/vine-interventions";
import { introSeen } from "@/lib/intro-seen";
import { useSignedIn } from "@/lib/use-signed-in";
import { Check } from "lucide-react";
import { Faq, InfoCard, InfoPage } from "./InfoPage";

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
          <p>Il calore e la temperatura di ogni stagione e ora sono la media dell'ultimo anno nel luogo scelto; la superficie viene misurata sulla forma del luogo disegnata sulla mappa. Quando un dato reale non è disponibile l'app lo dice e usa una stima. Le fonti sono elencate in <Link to="/legale/licenze" className="font-semibold underline underline-offset-4">Licenze</Link>.</p>
        </Faq>
        <Faq q="I miei dati vengono salvati?">
          <p>Come ospite le simulazioni, le foto e i video restano su questo dispositivo. Con un account vengono salvati nel tuo spazio personale, visibile solo a te. I dettagli sono nell'<Link to="/privacy/informativa" className="font-semibold underline underline-offset-4">Informativa sulla privacy</Link>.</p>
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
        <p>Puoi cancellare tutto in <Link to="/privacy/preferenze" className="font-semibold underline underline-offset-4">Preferenze privacy</Link>.</p>
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

const LIBS: Array<[string, string]> = [
  ["React", "MIT"], ["TanStack Router, Start e Query", "MIT"], ["Tailwind CSS", "MIT"], ["Radix UI", "MIT"], ["Lucide", "ISC"],
  ["Recharts", "MIT"], ["MapLibre GL JS", "BSD-3-Clause"], ["three.js", "MIT"], ["D3", "ISC"], ["jsPDF", "MIT"], ["JSZip", "MIT"],
  ["PDF.js", "Apache-2.0"], ["Supabase JS", "MIT"], ["Zod", "MIT"], ["date-fns", "MIT"], ["Sonner", "MIT"], ["Vaul", "MIT"],
  ["class-variance-authority", "Apache-2.0"], ["React Hook Form", "MIT"], ["Embla Carousel", "MIT"],
];

export function LicensesPage() {
  return (
    <InfoPage title="Licenze" intro="Il software aperto e i dati che rendono possibile l'app, con le loro licenze.">
      <InfoCard title="Dati">
        <ul>
          <li>Dati cartografici © contributori di OpenStreetMap, licenza ODbL.</li>
          <li>Dati meteo di Open-Meteo, licenza CC BY 4.0.</li>
          <li>Contiene dati Copernicus Sentinel modificati.</li>
          <li>Dati climatici del progetto NASA POWER.</li>
          <li>Dati dei sensori di Sensor.Community, licenza DbCL/ODbL.</li>
          <li>Foto di riferimento delle piante: autore e licenza indicati sotto ogni foto (Royal Botanic Gardens, Kew; GBIF).</li>
        </ul>
      </InfoCard>
      <InfoCard title="Software">
        <ul>{LIBS.map(([n, l]) => <li key={n}>{n} — {l}</li>)}</ul>
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

type Plan = { id: string; name: string; who: string; price: string; items: string[] };
const PLANS: Plan[] = [
  { id: "base", name: "Base", who: "Per provare", price: "Gratis", items: ["Simulazione della piazza e del vigneto", "Mappa 2D e ricerca dei luoghi", "Foto e video salvati sul dispositivo"] },
  { id: "premium", name: "Premium", who: "Con un account", price: "Gratis con la registrazione", items: ["Tutto il piano Base", "Fotocamera AI che riconosce piante e terreno", "Mappa 3D e dati da satellite", "Dove mettere i sensori", "Lavoro salvato online e report da esportare"] },
  { id: "comune", name: "Business · Comuni", who: "Per uffici tecnici e amministrazioni", price: "Su richiesta", items: ["Tutto il piano Premium", "Più piazze e quartieri nello stesso spazio", "Dashboard con stato degli interventi e approvazioni", "Esportazione dei dati per i sistemi del comune", "Prova sul posto con pochi sensori e assistenza"] },
  { id: "agri", name: "Business · Agricoltura", who: "Per aziende agricole, cantine e cooperative", price: "Su richiesta", items: ["Tutto il piano Premium", "Più vigneti e zone per ogni vigneto", "Quaderno di campagna, sonde e avvisi di sete", "Invio dei dati all'agronomo", "Prova sul campo con pochi sensori e assistenza"] },
];

/** Plans: what each level of the app offers; the signed-in user's one is marked. */
export function PlansPage() {
  const { signedIn } = useSignedIn();
  const mine = signedIn ? "premium" : "base";
  return (
    <InfoPage title="Piani e business" intro="Le simulazioni sono gratuite. Per comuni, aziende agricole e cooperative ci sono piani su misura, con più luoghi, sensori e assistenza.">
      <div className="space-y-3">
        {PLANS.map((p) => (
          <section key={p.id} className={`space-y-3 rounded-3xl p-5 ${p.id === mine ? "bg-foreground/[0.08] shadow-[0_0_0_2px_var(--foreground)]" : "bg-foreground/[0.05]"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="text-sm text-muted-foreground">{p.who}</p>
              </div>
              {p.id === mine && <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">Il tuo piano</span>}
            </div>
            <p className="font-display text-2xl font-light">{p.price}</p>
            <ul className="space-y-1.5">
              {p.items.map((it) => <li key={it} className="flex items-start gap-2 text-[15px]"><Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />{it}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <InfoCard title="Richiedi un piano business">
        <p>Scrivi a [email commerciale] indicando l'ente o l'azienda, i luoghi da seguire e il numero di zone: prepariamo una proposta con costi e tempi.</p>
      </InfoCard>
    </InfoPage>
  );
}
