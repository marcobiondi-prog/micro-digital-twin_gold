import { useSyncExternalStore } from "react";
import { applyVineMix, vineMixOf } from "./vine-interventions";
import { vineModel, type Pheno } from "./data";
import { piazzaEstimate, vineZones } from "./scenarios";

export type Loc = { label: string; lat: number; lng: number };
export type VineZoneState = { temperature: number; moisture: number; wind: number; rain: boolean };
export type LabState = {
  savedAt?: number | null;
  syncedAt?: number | null;
  syncedTargets?: string[] | null;
  urban: { trees: number; permeable: number; shade: number; location: Loc; treeCells: number[] | null; permeableCells: number[] | null; shadeCells: number[] | null; realTemp?: number | null };
  vineyard: { zones: VineZoneState[]; phase: Pheno; selected: number; allZones: boolean; location: Loc; irrigation?: number; shade?: number; windbreak?: number };
};

const KEY = "micro-digital-twin-lab";
const defaults = (): LabState => ({
  urban: { trees: 6, permeable: 20, shade: 15, location: { label: "Piazza Vittorio Emanuele II · Campobasso · Molise", lat: 41.55837, lng: 14.659698 }, treeCells: null, permeableCells: null, shadeCells: null },
  vineyard: { zones: vineZones.map((z) => ({ temperature: z.temp, moisture: z.moist, wind: z.wind, rain: false })), phase: "Invaiatura" as Pheno, selected: 2, allZones: false, location: { label: "Colline del Molise", lat: 41.83, lng: 14.98 } },
});

const serverState = defaults();
let state = serverState;
let loaded = false;
const listeners = new Set<() => void>();

/** The pre-fix default (Palazzo San Giorgio, 41.5603, 14.6627) saved on devices is moved to the real piazza; any place the user chose is kept. */
export function upgradeUrbanLocation(location: Loc | undefined, fallback: Loc): Loc {
  if (!location) return fallback;
  const oldDefault = Math.abs(location.lat - 41.5603) < 1e-4 && Math.abs(location.lng - 14.6627) < 1e-4;
  return oldDefault ? fallback : location;
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) { const d = defaults(), p = JSON.parse(raw) as Partial<LabState>; state = { ...state, urban: { ...d.urban, ...p.urban, location: upgradeUrbanLocation(p.urban?.location, d.urban.location) }, vineyard: { ...d.vineyard, ...p.vineyard }, syncedAt: p.syncedAt ?? null, syncedTargets: p.syncedTargets ?? null }; }
  } catch { /* ignore */ }
  window.addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { try { state = JSON.parse(e.newValue); listeners.forEach((l) => l()); } catch { /* ignore */ } } });
}

export function setUrban(patch: Partial<LabState["urban"]>) { state = { ...state, urban: { ...state.urban, ...patch } }; emit("urban"); }
export function setVineyard(patch: Partial<LabState["vineyard"]> | ((v: LabState["vineyard"]) => Partial<LabState["vineyard"]>)) {
  const p = typeof patch === "function" ? patch(state.vineyard) : patch;
  state = { ...state, vineyard: { ...state.vineyard, ...p } }; emit("vineyard");
}
/** Restore the default scenario (keeps the chosen location). */
export function resetUrban() { const d = defaults().urban; state = { ...state, urban: { ...d, location: state.urban.location, realTemp: state.urban.realTemp ?? null } }; emit("urban"); }
export function resetVineyard() { const d = defaults().vineyard; state = { ...state, vineyard: { ...d, location: state.vineyard.location } }; emit("vineyard"); }
/** Urban edits refresh Urbana + Esecutivo; vineyard edits refresh Vitivinicola + Esecutivo. */
const SYNC_TARGETS = { urban: ["Urbana", "Esecutivo"], vineyard: ["Vitivinicola", "Esecutivo"] } as const;
function emit(target: keyof typeof SYNC_TARGETS) {
  const now = Date.now();
  state = { ...state, savedAt: now, syncedAt: now, syncedTargets: [...SYNC_TARGETS[target]] };
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!loaded) { load(); queueMicrotask(() => listeners.forEach((x) => x())); }
  return () => listeners.delete(l);
}

export function useLab() { return useSyncExternalStore(subscribe, () => state, () => serverState); }

/** Derived indicators shared by the Decision Lab and the dashboards. */
export function urbanMetrics(u: LabState["urban"]) {
  const est = piazzaEstimate(u.trees, u.permeable, u.shade);
  return {
    est,
    cover: Math.round(Math.min(100, 12 + u.trees * 1.5)),
    heat: Math.round(Math.max(0, 72 - est.dT * 8)),
    refuges: Math.round(Math.min(100, 32 + u.shade * 0.4)),
    green: Math.round(Math.min(100, 37 + u.trees * 1.5 + u.permeable * 0.3)),
  };
}
export function vineMetrics(v: LabState["vineyard"]) {
  const offset = Math.max(-3, Math.min(3, (41.83 - v.location.lat) * 0.6));
  // The interventions (irrigation, shade cloth, windbreak) act on every zone before the vines' thirst is read.
  const zones = applyVineMix(v.zones, vineMixOf(v));
  const results = zones.map((z) => vineModel({ moisture: z.moisture, temp: z.temperature + offset, wind: z.wind, phase: v.phase, rain: z.rain }));
  const avg = (n: number[]) => n.reduce((s, x) => s + x, 0) / Math.max(1, n.length);
  return {
    results,
    moisture: Math.round(avg(zones.map((z) => z.moisture))),
    waterStress: Math.round(avg(results.map((r) => r.s))),
    heatStress: Math.round(Math.max(0, Math.min(100, ((avg(zones.map((z) => z.temperature)) + offset - 20) / 25) * 100))),
  };
}

const SITUATION_LABELS = { basso: "Situazione regolare", medio: "Da monitorare", alto: "Livello di attenzione" } as const;

export type VineSituation = { peak: number; level: "basso" | "medio" | "alto"; label: string; caption: string };

/** Sintesi del vigneto: indice massimo, livello, etichetta del bollino e didascalia da mostrare. */
export function vineyardSituation(v: LabState["vineyard"]): VineSituation {
  const metrics = vineMetrics(v);
  const peak = Math.max(...metrics.results.map((r) => r.s), metrics.heatStress);
  const level: VineSituation["level"] = peak >= 65 ? "alto" : peak >= 35 ? "medio" : "basso";
  const offset = Math.max(-3, Math.min(3, (41.83 - v.location.lat) * 0.6));
  const worst = metrics.results.reduce((best, r, i) => (r.s > (metrics.results[best]?.s ?? 0) ? i : best), 0);
  const zone = v.zones[worst];
  const drivers: Record<"acqua" | "caldo" | "vento", number> = {
    acqua: Math.max(0, 35 - (zone?.moisture ?? 35)) * 1.6,
    caldo: Math.max(0, (zone?.temperature ?? 24) + offset - 24) * 3,
    vento: (zone?.wind ?? 0) * 0.55,
  };
  const driver = (Object.keys(drivers) as (keyof typeof drivers)[]).reduce((top, key) => (drivers[key] > drivers[top] ? key : top), "acqua");
  const raining = v.zones.length > 0 && v.zones.every((z) => z.rain);
  const phase = v.phase.toLowerCase();
  let caption: string;
  if (level === "alto") {
    caption = raining
      ? `Pioggia simulata, ma lo stress resta alto in ${phase}: i sensori misurano umidità e temperatura per zona.`
      : driver === "acqua"
        ? `Terreno secco e foglie stanche in ${phase}: i sensori misurano umidità e temperatura per zona.`
        : driver === "vento"
          ? `Vento che asciuga la chioma in ${phase}: i sensori misurano umidità e temperatura per zona.`
          : `Colpo di calore in ${phase}: i sensori misurano temperatura e umidità per zona.`;
  } else if (level === "medio") {
    caption = driver === "acqua"
      ? `Umidità in calo in ${phase}: i sensori segnalano le zone da tenere d’occhio.`
      : driver === "vento"
        ? `Vento che asciuga il suolo in ${phase}: i sensori segnalano le zone da tenere d’occhio.`
        : `Caldo sopra la norma in ${phase}: i sensori segnalano le zone da tenere d’occhio.`;
  } else {
    caption = raining
      ? `Pioggia simulata in ${phase}: umidità e temperatura nella norma, i sensori confermano il controllo per zona.`
      : `Umidità e temperatura nella norma in ${phase}: i sensori confermano il controllo per zona.`;
  }
  return { peak, level, label: SITUATION_LABELS[level], caption };
}

export function splitLabel(label: string) { return label.split(/ · |, /)[0]?.trim() || label; }

export function SyncIndicatorText(savedAt: number | null | undefined) {
  return savedAt ? new Date(savedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;
}
