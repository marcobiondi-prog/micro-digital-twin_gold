import type { LabState } from "@/models/lab-store";
import type { HistoryMix } from "@/models/intervention-history";

const avg = (n: number[]) => (n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : 0);

/** The intervention currently set in the piazza simulation, in plain words. */
export function urbanSummary(u: LabState["urban"]): string {
  return `Alberi ${u.trees} · prato ${u.permeable}% · ombra ${u.shade}%`;
}

/** The intervention currently set in the vineyard simulation: the chosen zone, or the average of all. */
export function vineyardSummary(v: LabState["vineyard"]): string {
  const zones = v.allZones ? v.zones : [v.zones[v.selected]].filter((z): z is NonNullable<typeof z> => !!z);
  const of = (k: "irrigation" | "shade" | "windbreak") => avg(zones.map((z) => z[k] ?? v[k] ?? 0));
  const where = v.allZones ? "Tutte le zone" : `Zona ${v.selected + 1}`;
  return `${where} · irrigazione +${of("irrigation")}% · ombra ${of("shade")}% · frangivento ${of("windbreak")}%`;
}

/** The piazza's levers as they are now, to put back later. */
export const urbanMix = (u: LabState["urban"]): HistoryMix => ({ kind: "piazza", trees: u.trees, permeable: u.permeable, shade: u.shade });

/** Every zone's interventions as they are now (the older vineyard-level mix fills a zone that has none), plus the scope. */
export const vineyardMix = (v: LabState["vineyard"]): HistoryMix => ({
  kind: "vigneto",
  zones: v.zones.map((z) => ({ irrigation: z.irrigation ?? v.irrigation ?? 0, shade: z.shade ?? v.shade ?? 0, windbreak: z.windbreak ?? v.windbreak ?? 0 })),
  allZones: v.allZones, selected: v.selected,
});
