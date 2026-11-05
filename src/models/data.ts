export const phases = [
  { n: "01", t: "Empatia", d: "Interviste, territorio, pratiche e criticità.", p: 100 },
  { n: "02", t: "Definizione", d: "Bisogni, utenti e problema decisionale.", p: 100 },
  { n: "03", t: "Ideazione", d: "Alternative, benchmark e concept.", p: 80 },
  { n: "04", t: "Prototipo", d: "Una dimostrazione limitata e testabile.", p: 45 },
  { n: "05", t: "Test", d: "Confronto con utenti e misure reali.", p: 10 },
];

export const hmw =
  "Come potremmo aiutare tecnici e gestori a diagnosticare lo stress microclimatico locale e confrontare, con stime trasparenti, l’efficacia di differenti interventi prima di realizzarli?";

export const insights = [
  { t: "I dati sono frammentati", d: "Radar, satelliti, centraline, sensori e mappe operano spesso in ecosistemi separati." },
  { t: "Il dato non è una decisione", d: "Il tecnico deve trasformare indicatori e previsioni in priorità operative comprensibili." },
  { t: "Serve una scala locale", d: "Le mappe generali individuano il rischio; lo spazio circoscritto richiede dati e geometrie specifiche." },
  { t: "Confrontare, non promettere", d: "Le simulazioni devono mostrare stime, intervalli e compromessi, non certezze assolute." },
  { t: "La semplicità è decisiva", d: "Piccoli Comuni e aziende agricole hanno bisogno dell’informazione utile, non della complessità tecnica." },
  { t: "Urbano e agricolo condividono il motore", d: "Dati, modello, scenario e DSS possono alimentare applicazioni diverse." },
];

export type Tag = "Calore" | "Digital Twin" | "Verde e acqua" | "Italia" | "Vitivinicolo";
export type CaseStudy = {
  city: string;
  country: string;
  project: string;
  claim: string;
  period: string;
  evidence: "Misurato" | "Monitorato" | "Simulato";
  metrics: { value: string; label: string }[];
  sourceLabel: string;
  sourceUrl: string;
  tags: Tag[];
};
export const cases: CaseStudy[] = [
  {
    city: "Siviglia", country: "Spagna", project: "CartujaQanat", period: "Monitoraggio 2023", evidence: "Misurato",
    claim: "Il raffrescamento bioclimatico combina ombra, qanat, acqua e dissipazione notturna in uno spazio pubblico aperto.",
    metrics: [{ value: "≈10 °C", label: "riduzione termica rilevata" }, { value: "0", label: "consumo energetico netto dichiarato" }],
    sourceLabel: "Urban Innovative Actions · Journal 3", sourceUrl: "https://uia.urban-initiative.eu/en/news/cartujaqanat-journal-3-10degc-reduction-zeronet-energy-consumption-open-spaces-possible", tags: ["Calore", "Verde e acqua"],
  },
  {
    city: "Barcellona", country: "Spagna", project: "Rifugi climatici scolastici", period: "Valutazione 2018–2022", evidence: "Monitorato",
    claim: "La trasformazione di cortili scolastici con acqua, verde e ombra è stata valutata sul campo e con gli utilizzatori.",
    metrics: [{ value: "11", label: "scuole trasformate" }, { value: "76", label: "utenti intervistati" }],
    sourceLabel: "International Journal of Public Health", sourceUrl: "https://www.ssph-journal.org/journals/international-journal-of-public-health/articles/10.3389/ijph.2025.1608083/full", tags: ["Calore", "Verde e acqua"],
  },
  {
    city: "Parigi", country: "Francia", project: "Cours OASIS", period: "Campagne 2021–2023", evidence: "Monitorato",
    claim: "Cortili depavimentati e rinverditi sono stati analizzati con misure microclimatiche fisse e mobili durante il caldo.",
    metrics: [{ value: "10", label: "cortili pilota" }, { value: "4", label: "variabili microclimatiche rilevate" }],
    sourceLabel: "Université Paris Cité · LIEPP", sourceUrl: "https://www.sciencespo.fr/liepp/fr/actualites/evaluation-de-limpact-thermique-des-cours-decole-oasis/", tags: ["Calore", "Verde e acqua"],
  },
  {
    city: "Padova", country: "Italia", project: "3D City Digital Twin", period: "Studio pubblicato nel 2024", evidence: "Monitorato",
    claim: "Un modello urbano 3D integra sensori di temperatura e umidità per localizzare il rischio e confrontare soluzioni verdi e blu.",
    metrics: [{ value: "2", label: "variabili ambientali in campo" }, { value: "3D", label: "modello urbano integrato" }],
    sourceLabel: "ISPRS Archives 2024", sourceUrl: "https://isprs-archives.copernicus.org/articles/XLVIII-4-W11-2024/129/2024/isprs-archives-XLVIII-4-W11-2024-129-2024.pdf", tags: ["Digital Twin", "Italia", "Verde e acqua"],
  },
  {
    city: "Campobasso", country: "Italia", project: "Monitoraggio climatico del capoluogo", period: "Serie 1981–2024", evidence: "Misurato",
    claim: "Le osservazioni meteorologiche ufficiali mostrano un riscaldamento recente marcato e quantificano l’evoluzione climatica della città.",
    metrics: [{ value: "+0,8 °C", label: "media 2015–2024 rispetto al clima 1991–2020" }, { value: "+2,2 °C", label: "anomalia del 2024, massimo della serie" }],
    sourceLabel: "ISPRA · Stato dell’ambiente urbano 2026", sourceUrl: "https://www.isprambiente.gov.it/files2026/pubblicazioni/rapporti/rapporto-capoluoghi-regione-103_2026.pdf", tags: ["Calore", "Italia"],
  },
  {
    city: "Termoli", country: "Italia", project: "AdriaClim · rischio costiero", period: "Progetto 2019–2022", evidence: "Simulato",
    claim: "Il sito pilota della costa molisana combina monitoraggio meteomarino e scenari climatici per valutare erosione e vulnerabilità degli habitat.",
    metrics: [{ value: "133,4 m", label: "arretramento della riva atteso entro il 2100" }, { value: "31 ha", label: "habitat colpiti dall’incendio del 2021" }],
    sourceLabel: "AdriaClim · Costa molisana", sourceUrl: "https://termolionline.it/2022/06/attualita/cambiamenti-climatici-e-rischi-sulla-costa/", tags: ["Verde e acqua", "Italia"],
  },
  {
    city: "Isernia", country: "Italia", project: "ECO SMART DATA", period: "Monitoraggio attivo dal 2025", evidence: "Monitorato",
    claim: "Una rete territoriale con dashboard pubblica raccoglie in tempo reale dati climatici, atmosferici e del suolo per supportare le decisioni ambientali.",
    metrics: [{ value: "21", label: "stazioni in 19 comuni" }, { value: "60.000 ha", label: "territorio monitorato" }],
    sourceLabel: "Consorzio Isernia–Venafro", sourceUrl: "https://www.consorzioiserniavenafro.it/news/attiva-e-consultabile-la-nuova-dashboard-ambientale-in-tempo-reale/", tags: ["Digital Twin", "Verde e acqua", "Italia"],
  },
  {
    city: "Singapore", country: "Singapore", project: "Digital Urban Climate Twin", period: "Risultati 2024", evidence: "Simulato",
    claim: "Il gemello climatico combina osservazioni e modelli per confrontare strategie di raffrescamento alla scala dell’isola.",
    metrics: [{ value: "0,13 °C", label: "raffrescamento medio potenziale" }, { value: "06–08", label: "ore di massimo effetto" }],
    sourceLabel: "Cooling Singapore 2.0", sourceUrl: "https://www.worldcitiessummit.com.sg/qql/slot/u337/Programme/SOC/2024/Posters/P9.%20Cooling%20Singapore%202.0.pdf", tags: ["Digital Twin", "Calore"],
  },
  {
    city: "Cluj-Napoca", country: "Romania", project: "URBREATH · Living Lab Someș", period: "Fasi 2025–2026", evidence: "Monitorato",
    claim: "Quattro aree residue lungo il Someș sono state co-progettate con cittadini e studenti e piantate in due fasi, come siti di prova per il gemello digitale urbano del progetto.",
    metrics: [{ value: "129", label: "alberi messi a dimora" }, { value: "1.600+", label: "piante basse in 4 siti" }],
    sourceLabel: "URBREATH · Pilot 4 Cluj-Napoca", sourceUrl: "https://urbreath.eu/pilots/pilot-4-continental-climatic-zone/", tags: ["Calore", "Verde e acqua"],
  },
  {
    city: "Salgesch", country: "Svizzera", project: "IrriSalgesch", period: "Prova in campo 2022", evidence: "Misurato",
    claim: "Due settori di vigneto sono stati confrontati per verificare consumo irriguo, stress della vite e resa.",
    metrics: [{ value: "−20%", label: "acqua irrigua" }, { value: "+6%", label: "resa in peso" }],
    sourceLabel: "IrriSalgesch Report 2022", sourceUrl: "https://news.aqua4d.com/wp-content/uploads/2022/12/IrriSalgesch-Report-2022-EN-1.pdf", tags: ["Vitivinicolo", "Verde e acqua"],
  },
  {
    city: "Napa e Central Valley", country: "Stati Uniti", project: "Irrigazione guidata da sensori", period: "Campagne 2013–2014", evidence: "Misurato",
    claim: "Il monitoraggio diretto delle piante ha guidato l’irrigazione durante la siccità in più vigneti californiani.",
    metrics: [{ value: "−60%", label: "acqua media utilizzata" }, { value: "+20%", label: "resa in un sito con −75% acqua" }],
    sourceLabel: "ICP · Fruition Sciences", sourceUrl: "https://www.bewaterwise.com/assets/2013icp-fruitionsciences.pdf", tags: ["Vitivinicolo", "Calore"],
  },
  {
    city: "Trentino", country: "Italia", project: "IRRITRE · irrigazione intelligente", period: "Aggiornamento dicembre 2025", evidence: "Monitorato",
    claim: "La piattaforma integra sensori IoT, immagini satellitari e modelli di intelligenza artificiale per calibrare l’irrigazione sulle esigenze reali delle colture.",
    metrics: [{ value: "3", label: "nuove aree territoriali coinvolte" }, { value: "Migliaia", label: "dati integrati dalla piattaforma" }],
    sourceLabel: "Trentino Digitale · IRRITRE", sourceUrl: "https://www.trentinodigitale.it/2025/12/11/irritre-lintelligenza-innova-lagricoltura/", tags: ["Vitivinicolo", "Digital Twin", "Italia"],
  },
  {
    city: "Penedès", country: "Spagna", project: "Digital twin irriguo Familia Torres", period: "Campagne 2021–2022", evidence: "Misurato",
    claim: "Il gemello digitale ha assimilato dati Sentinel-2 e misure di potenziale idrico per programmare l’irrigazione.",
    metrics: [{ value: "3", label: "settori irrigui sperimentali" }, { value: "5 giorni", label: "rivisitazione Sentinel-2" }],
    sourceLabel: "Water 2023 · IRTA", sourceUrl: "https://www.mdpi.com/2073-4441/15/14/2506", tags: ["Vitivinicolo", "Digital Twin"],
  },
  {
    city: "Napa Valley", country: "Stati Uniti", project: "Ombreggiamento della zona grappolo", period: "Studio pubblicato nel 2017", evidence: "Misurato",
    claim: "Quattro reti con proprietà ottiche diverse sono state confrontate con grappoli non ombreggiati.",
    metrics: [{ value: "−3,7 °C", label: "temperatura grappolo nelle ore calde" }, { value: "40%", label: "fattore d’ombra della rete nera" }],
    sourceLabel: "Journal of Agricultural and Food Chemistry", sourceUrl: "https://pubs.acs.org/doi/10.1021/acs.jafc.7b04163", tags: ["Vitivinicolo", "Calore"],
  },
];


export const sources: { t: string; items: ({ label: string; url?: string } | string)[] }[] = [
  { t: "Rischio e protezione civile", items: [
    { label: "CLIMAAX Toolbox", url: "https://toolbox.climaax.eu/" },
    { label: "CLIMol", url: "https://www.regione.molise.it/climol" },
    { label: "Dewetra", url: "https://www.protezionecivile.gov.it/it/approfondimento/la-gestione-degli-scenari-di-rischio-il-sistema-dewetra/" },
    { label: "Radar-DPC", url: "https://radar.protezionecivile.it/" },
    { label: "RISICO", url: "https://risico.it/" },
    { label: "PROPAGATOR", url: "https://cimafoundation.github.io/propagator_sim/" },
    { label: "Copernicus EMS", url: "https://emergency.copernicus.eu/" },
    { label: "EFAS", url: "https://www.efas.eu/" },
    { label: "EFFIS", url: "https://effis.jrc.ec.europa.eu/" },
    { label: "European Drought Observatory", url: "https://edo.jrc.ec.europa.eu/" },
    { label: "Risk Data Hub", url: "https://drmkc.jrc.ec.europa.eu/risk-data-hub" },
    { label: "IdroGEO", url: "https://idrogeo.isprambiente.it/" },
    { label: "Sistema nazionale ondate di calore", url: "https://www.salute.gov.it/portale/caldo/homeCaldo.jsp" },
    { label: "IT-alert", url: "https://www.it-alert.gov.it/" },
  ] },
  { t: "Clima urbano", items: [
    { label: "CartujaQanat · Siviglia", url: "https://uia.urban-initiative.eu/en/news/cartujaqanat-journal-3-10degc-reduction-zeronet-energy-consumption-open-spaces-possible" },
    { label: "Rifugi climatici · Barcellona", url: "https://www.ssph-journal.org/journals/international-journal-of-public-health/articles/10.3389/ijph.2025.1608083/full" },
    { label: "Cours OASIS · Parigi", url: "https://www.sciencespo.fr/liepp/fr/actualites/evaluation-de-limpact-thermique-des-cours-decole-oasis/" },
    { label: "Digital Twin · Padova", url: "https://isprs-archives.copernicus.org/articles/XLVIII-4-W11-2024/129/2024/isprs-archives-XLVIII-4-W11-2024-129-2024.pdf" },
    { label: "Monitoraggio climatico · Campobasso", url: "https://www.isprambiente.gov.it/files2026/pubblicazioni/rapporti/rapporto-capoluoghi-regione-103_2026.pdf" },
    { label: "AdriaClim · Termoli", url: "https://termolionline.it/2022/06/attualita/cambiamenti-climatici-e-rischi-sulla-costa/" },
    { label: "ECO SMART DATA · Isernia", url: "https://www.consorzioiserniavenafro.it/news/attiva-e-consultabile-la-nuova-dashboard-ambientale-in-tempo-reale/" },
    { label: "Cooling Singapore 2.0", url: "https://www.worldcitiessummit.com.sg/qql/slot/u337/Programme/SOC/2024/Posters/P9.%20Cooling%20Singapore%202.0.pdf" },
    { label: "URBREATH · Cluj-Napoca", url: "https://urbreath.eu/pilots/pilot-4-continental-climatic-zone/" },
  ] },
  { t: "Agricoltura", items: [
    { label: "IrriSalgesch · Svizzera", url: "https://news.aqua4d.com/wp-content/uploads/2022/12/IrriSalgesch-Report-2022-EN-1.pdf" },
    { label: "Fruition Sciences · California", url: "https://www.bewaterwise.com/assets/2013icp-fruitionsciences.pdf" },
    { label: "IRRITRE · Trentino", url: "https://www.trentinodigitale.it/2025/12/11/irritre-lintelligenza-innova-lagricoltura/" },
    { label: "Digital twin Familia Torres · Penedès", url: "https://www.mdpi.com/2073-4441/15/14/2506" },
    { label: "Ombreggiamento grappoli · Napa", url: "https://pubs.acs.org/doi/10.1021/acs.jafc.7b04163" },
  ] },
];

export const flows = {
  urban: {
    name: "Flusso Urbano",
    modules: [
      { t: "Isole di calore", d: "Diagnosi della superficie critica e WBGT locale." },
      { t: "Rifugi climatici", d: "Accessibilità a 5/10 minuti e copertura della popolazione." },
      { t: "Verde e depaving", d: "Alberi, suolo permeabile e ombreggiamento." },
    ],
  },
  vine: {
    name: "Flusso Vitivinicolo",
    modules: [
      { t: "Vigneto adattivo", d: "Zonazione della parcella e priorità per zona." },
      { t: "Stress idro-termico fenologico", d: "Indice di stress pesato per fase della vite." },
      { t: "Cantine e gestione idrica", d: "Irrigazione di soccorso e maturità fenolica." },
    ],
  },
};

// ---- Models (dimostrativi) ----
export type UrbanInput = { trees: number; depave: number; shade: number; albedo: number; mist: boolean };
export function urbanModel(i: UrbanInput) {
  const raw = i.trees * 0.03 + i.depave * 0.018 + i.shade * 0.022 + (i.albedo - 0.2) * 1.5 + (i.mist ? 0.6 : 0);
  const dT = Math.min(5.2, raw);
  const spread = 0.25 + dT * 0.18;
  const reliability = Math.round(Math.max(30, 78 - dT * 6 - (i.mist ? 4 : 0)));
  const water = i.mist ? "alto" : i.trees > 30 ? "medio" : "basso";
  const maint = i.trees + i.shade > 60 ? "alta" : i.trees + i.shade > 25 ? "media" : "bassa";
  const time = i.depave > 35 || i.trees > 40 ? "lungo" : i.depave > 10 || i.trees > 10 ? "medio" : "breve";
  return { dT, lo: Math.max(0, dT - spread), hi: dT + spread, reliability, water, maint, time };
}

export const phenoPhases = ["Germogliamento", "Fioritura", "Invaiatura", "Maturazione"] as const;
export type Pheno = (typeof phenoPhases)[number];
export type VineInput = { moisture: number; temp: number; wind: number; phase: Pheno; rain: boolean };
const phaseW: Record<Pheno, number> = { Germogliamento: 0.7, Fioritura: 1.15, Invaiatura: 1.2, Maturazione: 1.0 };
/**
 * Where the vines' thirst comes from, in points: dry soil ((35 − moisture %) × 1,6), heat above 24 °C (× 3) and wind
 * (km/h × 0,55), weighed by the vine's phase, less 15 with rain — the same sum vineModel turns into the 0–100 index.
 */
export const PHASE_WEIGHT = phaseW;
export function vineThirstParts(i: VineInput) {
  const soil = Math.max(0, 35 - i.moisture) * 1.6, heat = Math.max(0, i.temp - 24) * 3, wind = i.wind * 0.55;
  return { soil, heat, wind, weight: phaseW[i.phase], rain: i.rain ? 15 : 0 };
}
export function vineModel(i: VineInput) {
  const base = Math.max(0, 35 - i.moisture) * 1.6 + Math.max(0, i.temp - 24) * 3 + i.wind * 0.55;
  const s = Math.round(Math.max(0, Math.min(100, base * phaseW[i.phase] - (i.rain ? 15 : 0))));
  const risk = s < 35 ? "basso" : s < 65 ? "moderato" : "elevato";
  const priority =
    risk === "elevato"
      ? i.moisture < 25 ? "Irrigazione di soccorso nelle zone critiche entro 24 h" : "Riduzione carico termico: ombreggiamento e gestione chioma"
      : risk === "moderato" ? "Monitorare sonde 20/50 cm e ripianificare in 48 h" : "Nessuna azione urgente, proseguire monitoraggio";
  return { s, risk, priority };
}

// deterministic pseudo-noise
export function noise(x: number, y = 0) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
