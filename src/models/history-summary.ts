import type { LabState } from "@/models/lab-store";
import type { HistoryMix } from "@/models/intervention-history";

const avg = (n: number[]) => (n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : 0);

/** The intervention currently set in the piazza simulation, in plain words. */
export function urbanSummary(u: LabState["urban"]): string {
  return `Alberi ${u.trees} · aiuole e ciottoli ${u.permeable}% · ombra ${u.shade}%${u.misters ? ` · nebulizzatori ${u.misters}` : ""}`;
}

/** The intervention currently set in the vineyard simulation: the chosen zone, or the average of all. */
export function vineyardSummary(v: LabState["vineyard"]): string {
  const zones = v.allZones ? v.zones : [v.zones[v.selected]].filter((z): z is NonNullable<typeof z> => !!z);
  const of = (k: "irrigation" | "pestAnimal" | "pestPlant") => avg(zones.map((z) => z[k] ?? v[k] ?? 0));
  const where = v.allZones ? "Tutte le zone" : `Zona ${v.selected + 1}`;
  return `${where} · irrigazione +${of("irrigation")}% · difesa parassiti animali ${of("pestAnimal")}% · vegetali ${of("pestPlant")}%`;
}

/** The piazza's levers as they are now, to put back later. */
export const urbanMix = (u: LabState["urban"]): HistoryMix => ({ kind: "piazza", trees: u.trees, permeable: u.permeable, shade: u.shade, ...(u.misters ? { misters: u.misters } : {}) });

/** Every zone's interventions as they are now (the older vineyard-level mix fills a zone that has none), plus the scope. */
export const vineyardMix = (v: LabState["vineyard"]): HistoryMix => ({
  kind: "vigneto",
  zones: v.zones.map((z) => ({ irrigation: z.irrigation ?? v.irrigation ?? 0, pestAnimal: z.pestAnimal ?? v.pestAnimal ?? 0, pestPlant: z.pestPlant ?? v.pestPlant ?? 0 })),
  allZones: v.allZones, selected: v.selected,
});
