import { vineModel } from "./data";

/** Piazza-scale estimate calibrated on the video (6 alberi + 20% permeabile ≈ −2/−4 °C). */
export function piazzaEstimate(trees: number, depave: number, shade: number) {
  const dT = Math.min(5.2, trees * 0.25 + depave * 0.04 + shade * 0.03);
  return { dT, lo: dT * 0.7, hi: Math.min(5.5, dT * 1.3) };
}

export const places = {
  piazza: { name: "Piazza Vittorio Emanuele II", sub: "Campobasso · Molise", lat: 41.55837, lng: 14.659698 },
  vigneto: { name: "Vigneto", sub: "Colline del Molise", lat: 41.83, lng: 14.98 },
};

export const problem = [
  { key: "piazza" as const, q: ["Perché la piazza è insopportabile d'estate?", "Dove manca l'ombra?", "Cosa conviene fare prima?"], tags: ["Isola di calore", "Stress termico", "Mancanza d'ombra"] },
  { key: "vigneto" as const, q: ["Le viti stanno soffrendo?", "Quale zona irrigare per prima?", "Quando chiamare l'agronomo?"], tags: ["Terreno asciutto", "Foglie stanche", "Stress termico"] },
];

export const zeroSources = [
  { t: "Meteo pubblico", d: "Temperature, umidità, vento e previsioni da servizi aperti." },
  { t: "Copernicus / Sentinel", d: "Dati satellitari gratuiti: temperatura di superficie e indici di vegetazione." },
  { t: "Osservazioni a mano", d: "Note di campo, foto e rilievi semplici fatti sul posto." },
];

export const vineZones = [
  { z: "Zona 1", temp: 34, moist: 30, wind: 8, attn: false },
  { z: "Zona 2", temp: 36, moist: 24, wind: 6, attn: false },
  { z: "Zona 3", temp: 38, moist: 17, wind: 4, attn: true },
];

export const futureTech = ["Digital Twin 3D", "Telemetria continua", "Rilievi con droni", "LiDAR", "Rete densa di sensori"];

export type PrototypeLevel = {
  id: "zero" | "mvp" | "roadmap";
  s: string;
  dt: string;
  def: string;
  cost: string;
  prec: string;
  time: string;
  test: { urban: string; vineyard: string };
  chosen?: boolean;
};

/** Three prototyping levels framed with Design Thinking terminology. */
export const comparison: PrototypeLevel[] = [
  {
    id: "zero", s: "Subito, gratis", dt: "Con i dati che ci sono già",
    def: "Dati aperti, meteo e osservazioni a mano: si capisce subito se l’idea serve, prima di comprare strumenti.",
    cost: "0 €", prec: "Bassa (±3 °C)", time: "Subito",
    test: {
      urban: "L’informazione è davvero utile al tecnico comunale per scegliere dove intervenire?",
      vineyard: "L’agricoltore capisce e usa l’allerta per decidere quale zona irrigare?",
    },
  },
  {
    id: "mvp", s: "Pochi sensori", dt: "Una prova sul posto", chosen: true,
    def: "Pochi sensori messi nei punti giusti: si impara molto spendendo poco, in poche settimane.",
    cost: "€€", prec: "Media (±1 °C)", time: "Settimane",
    test: {
      urban: "Alberi, suolo permeabile e ombra riducono davvero di −2/−4 °C la piazza misurata?",
      vineyard: "Umidità e temperatura per zona anticipano lo stress delle viti in invaiatura?",
    },
  },
  {
    id: "roadmap", s: "Progetto completo", dt: "Su tutta la città o il territorio",
    def: "Misure continue, droni e modello 3D: da fare solo dopo che la prova con pochi sensori ha funzionato.",
    cost: "€€€€", prec: "Alta (±0,3 °C)", time: "Mesi / anni",
    test: {
      urban: "Il modello validato regge su più luoghi della città e nella gestione continua?",
      vineyard: "Il modello si estende a più vigneti e cooperative del territorio?",
    },
  },
];

export type PrototypeId = PrototypeLevel["id"];

/** Cost semantics with app tokens: green = free, turquoise = chosen MVP, orange = sustained budget. */
export const levelTone: Record<PrototypeId, { border: string; sel: string; dot: string; value: string }> = {
  zero: { border: "border-ok/60", sel: "bg-ok/10 ring-1 ring-ok/40", dot: "bg-ok", value: "text-ok" },
  mvp: { border: "border-brand-turquoise/70", sel: "bg-brand-turquoise/10 ring-1 ring-brand-turquoise/40", dot: "bg-brand-turquoise", value: "text-brand-turquoise" },
  roadmap: { border: "border-warn/60", sel: "bg-warn/10 ring-1 ring-warn/40", dot: "bg-warn", value: "text-warn" },
};

/** The prototyping card currently in evidence, so the panels show the same numbers as Confronta. */
export function prototypeLevel(id: PrototypeId): PrototypeLevel {
  return comparison.find((l) => l.id === id) ?? comparison[1]!;
}

export const prototypeChoice =
  "Conviene partire con pochi sensori: si verifica sul posto che gli interventi funzionano, con spese contenute e in poco tempo, e poi si può crescere.";

export const nextPhase = "Prossimo passo: la prova sul posto a Campobasso e nelle vigne, con chi userà l’app.";

export type AreaKind = "albero" | "permeabile" | "ombra" | "parcella";
export type Pt = { lat: number; lng: number };
export type Area = { id: string; kind: AreaKind; name: string; pts: Pt[]; m2: number };

export const kindLabel: Record<AreaKind, string> = { albero: "Albero", permeabile: "Suolo permeabile", ombra: "Pergola / ombra", parcella: "Sotto-parcella vigneto" };
export const kindColor: Record<AreaKind, string> = { albero: "#197651", permeabile: "#007D88", ombra: "#BB5B21", parcella: "#7A2E8E" };

/** Area in m² with the shoelace formula on a local equirectangular projection. */
export function polygonArea(pts: Pt[]) {
  if (pts.length < 3) return 0;
  const R = 6371000, lat0 = (pts[0]!.lat * Math.PI) / 180;
  const xy = pts.map((p) => [((p.lng * Math.PI) / 180) * R * Math.cos(lat0), ((p.lat * Math.PI) / 180) * R]);
  let s = 0;
  for (let i = 0; i < xy.length; i++) { const [x1 = 0, y1 = 0] = xy[i] ?? [], [x2 = 0, y2 = 0] = xy[(i + 1) % xy.length] ?? []; s += x1 * y2 - x2 * y1; }
  return Math.abs(s / 2);
}

/** Reference square surface (m²) used to turn drawn areas into percentages. */
export const REF_AREA = 4000;

export function areasToUrbanInput(areas: Area[]) {
  const sum = (k: AreaKind) => areas.filter((a) => a.kind === k).reduce((s, a) => s + a.m2, 0);
  return {
    trees: Math.min(60, areas.filter((a) => a.kind === "albero").length),
    depave: Math.min(100, (sum("permeabile") / REF_AREA) * 100),
    shade: Math.min(100, (sum("ombra") / REF_AREA) * 100),
    albedo: 0.2,
    mist: false,
  };
}

export function simulateAreas(areas: Area[]) {
  const input = areasToUrbanInput(areas);
  const u = piazzaEstimate(input.trees, input.depave, input.shade);
  const parcels = areas.filter((a) => a.kind === "parcella").map((a, i) => {
    const z = vineZones[i % 3]!;
    return { ...a, ...vineModel({ moisture: z.moist, temp: z.temp, wind: z.wind, phase: "Invaiatura", rain: false }) };
  });
  return { input, u, parcels };
}
