import type { Pheno } from "./data";
import type { LabState } from "./lab-store";
import { vineMetrics } from "./lab-store";
import { vineMixOf, zoneMixOf, type VineMix } from "./vine-interventions";

/**
 * What the vineyard simulation says to do, instead of a cost: plain advice zone by zone, the water the vines need and
 * the need of intervention over the coming days. All indicative, from the same numbers as the arc.
 */

export type AdviceTone = "urgent" | "soon" | "ok";
export type Advice = { tone: AdviceTone; text: string };
type ZoneNow = { need: number; moisture: number; temp: number; wind: number; rain: boolean; mix: VineMix };

const PHASE_CHECK: Record<Pheno, string> = {
  Germogliamento: "Germogli: controlla le gelate tardive nelle notti fredde.",
  Fioritura: "Fioritura: caldo e siccità riducono l'allegagione, tieni il terreno umido.",
  Invaiatura: "Invaiatura: guarda gli acini esposti al sole del pomeriggio, rischiano scottature.",
  Maturazione: "Maturazione: riduci l'acqua nelle due settimane prima della vendemmia.",
};

/** "Zona 2", "Zone 1 e 3", "Zone 1, 2 e 3". */
const zonesText = (ids: number[]) => {
  const n = ids.map((i) => i + 1);
  return n.length === 1 ? `Zona ${n[0]}` : `Zone ${n.slice(0, -1).join(", ")} e ${n.at(-1)}`;
};

/**
 * Advice for the vineyard: first how it is and where to start, then each action once for all the zones that need it
 * (dry soil, heat, wind, rain), the most urgent first, then one line on the vine's phase.
 */
export function vineAdvice(zones: ZoneNow[], phase: Pheno): Advice[] {
  const out: Advice[] = [];
  if (!zones.length) return out;
  const worstI = zones.reduce((b, z, i) => (z.need > zones[b]!.need ? i : b), 0), worst = zones[worstI]!;
  const avg = zones.reduce((t, z) => t + z.need, 0) / zones.length;
  if (worst.need < 35) out.push({ tone: "ok", text: `Il vigneto sta bene adesso (${Math.round(avg)}/100): nessuna urgenza, solo qualche attenzione.` });
  else out.push({ tone: worst.need >= 65 ? "urgent" : "soon", text: `Comincia dalla Zona ${worstI + 1}: è quella che ne ha più bisogno (${Math.round(worst.need)}/100).` });
  const pick = (test: (z: ZoneNow) => boolean) => zones.map((z, i) => (test(z) ? i : -1)).filter((i) => i >= 0);
  const rainy = pick((z) => z.rain);
  const dry = pick((z) => !z.rain && z.moisture < 25 && z.mix.irrigation < 12);
  const hot = pick((z) => !z.rain && z.temp >= 32 && z.mix.shade < 50);
  const windy = pick((z) => !z.rain && z.wind >= 15 && z.mix.windbreak < 50);
  const items: Array<Advice & { rank: number }> = [];
  if (dry.length) { const m = Math.min(...dry.map((i) => zones[i]!.moisture)); items.push({ rank: 30 - m, tone: m < 18 ? "urgent" : "soon", text: `${zonesText(dry)}: terreno asciutto (${dry.map((i) => `${Math.round(zones[i]!.moisture)} %`).join(", ")}), irriga a goccia nelle prime ore del mattino.` }); }
  if (hot.length) { const t = Math.max(...hot.map((i) => zones[i]!.temp)); items.push({ rank: t - 20, tone: t >= 36 ? "urgent" : "soon", text: `${zonesText(hot)}: fino a ${Math.round(t)} °C, stendi i teli d'ombra nelle ore più calde.` }); }
  if (windy.length) { const w = Math.max(...windy.map((i) => zones[i]!.wind)); items.push({ rank: w / 2, tone: "soon", text: `${zonesText(windy)}: vento a ${Math.round(w)} km/h che asciuga le foglie, rinforza il frangivento.` }); }
  if (rainy.length) items.push({ rank: 0, tone: "ok", text: `${zonesText(rainy)}: piove, sospendi l'irrigazione.` });
  out.push(...items.sort((a, b) => b.rank - a.rank).map(({ tone, text }) => ({ tone, text })));
  out.push({ tone: "ok", text: PHASE_CHECK[phase] });
  return out;
}

/** The vine's crop coefficient by phase (share of the reference evapotranspiration it uses). */
const KC: Record<Pheno, number> = { Germogliamento: 0.35, Fioritura: 0.55, Invaiatura: 0.7, Maturazione: 0.6 };
/** Litres per m² for one point of soil moisture over the roots (0,5 m deep). */
export const L_PER_POINT = 5;
/** The soil moisture a vine is comfortable at (%). */
export const MOISTURE_OK = 30;

/**
 * The water for one zone: what the vines drink a day (a temperature-based evapotranspiration, 0,13 mm per °C over 6 °C,
 * at most 7 mm, times the phase's coefficient), what brings the soil back to 30 % and what the irrigation set gives —
 * in litres over the zone's m².
 */
export function vineWater(z: { moisture: number; temp: number; rain: boolean; irrigation: number }, phase: Pheno, m2: number) {
  const et = Math.min(7, Math.max(0, 0.13 * (z.temp - 6))) * KC[phase];
  return {
    perDay: z.rain ? 0 : et * m2,
    refill: Math.max(0, MOISTURE_OK - z.moisture) * L_PER_POINT * m2,
    given: Math.max(0, z.irrigation) * L_PER_POINT * m2,
  };
}

/** Litres in plain words: "850 l", "12,4 m³". */
export const waterText = (l: number) => (l < 1000 ? `${Math.round(l)} l` : `${(l / 1000).toLocaleString("it-IT", { maximumFractionDigits: l < 100_000 ? 1 : 0 })} m³`);

export type ForecastDay = { date: string; tmax: number; wind: number; rain: number };

/**
 * The need of intervention on each forecast day: every zone keeps its soil, its interventions and its difference in air
 * from the others, while the day brings its highest temperature, its strongest wind and its rain (2 mm or more).
 */
export function forecastNeed(vine: LabState["vineyard"], days: ForecastDay[]): Array<ForecastDay & { need: number }> {
  const legacy = vineMixOf(vine);
  const avgT = vine.zones.reduce((t, z) => t + z.temperature, 0) / Math.max(1, vine.zones.length);
  return days.map((d) => {
    const zones = vine.zones.map((z) => ({ ...z, ...zoneMixOf(z, legacy), temperature: d.tmax + (z.temperature - avgT), wind: d.wind, rain: d.rain >= 2 }));
    const r = vineMetrics({ ...vine, zones }).results;
    return { ...d, need: r.reduce((t, x) => t + x.s, 0) / Math.max(1, r.length) };
  });
}

/** The next 7 days at the place (highest temperature, strongest wind in km/h, rain in mm); null when it does not answer. */
const forecasts = new Map<string, Promise<ForecastDay[] | null>>();
export function loadForecast(lat: number, lng: number): Promise<ForecastDay[] | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  let p = forecasts.get(key);
  if (!p) {
    p = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,wind_speed_10m_max,precipitation_sum&forecast_days=7&timezone=auto`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { daily?: { time?: string[]; temperature_2m_max?: number[]; wind_speed_10m_max?: number[]; precipitation_sum?: number[] } } | null) => {
        const d = j?.daily;
        if (!d?.time?.length) return null;
        return d.time.map((date, i) => ({ date, tmax: d.temperature_2m_max?.[i] ?? 0, wind: d.wind_speed_10m_max?.[i] ?? 0, rain: d.precipitation_sum?.[i] ?? 0 }));
      })
      .catch(() => null);
    void p.then((v) => { if (!v) forecasts.delete(key); });
    forecasts.set(key, p);
  }
  return p;
}
