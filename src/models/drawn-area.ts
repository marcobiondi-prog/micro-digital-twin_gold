import { ringAreaM2, type Ring } from "./place-area";
import type { LayoutEdits } from "./area-layout";

/**
 * An area drawn with pins on the map of a simulation: its corners ([lat, lng]) and the place it was drawn for. It is
 * kept with the simulation and counts only while that same place is chosen; its surface then replaces the measured
 * (or reference) one in costs and benefits.
 */
/**
 * A smaller area drawn inside the big one: left free (a fountain, a road: no interventions there and its surface taken
 * off the costs), given one intervention (trees, lawn or pergola go there first) or a lot (a part of the project with
 * its own surface and share of the cost).
 */
export type ZoneKind = "libera" | "alberi" | "prato" | "ombra" | "lotto";
export type SubArea = { id: string; kind: ZoneKind; ring: Ring; name?: string };
export const ZONE_LABEL: Record<ZoneKind, string> = { libera: "Da lasciare libera", alberi: "Alberi", prato: "Prato", ombra: "Pergolato", lotto: "Lotto" };
/** Which kinds each simulation offers: the vineyard has no trees, lawn or pergolas. */
export const ZONE_KINDS = { piazza: ["libera", "alberi", "prato", "ombra", "lotto"], vigneto: ["libera", "lotto"] } as const;

/** `edits`: the simulation's elements moved by hand inside it (models/area-layout); a new outline starts them afresh. `zones`: the smaller areas inside it. */
export type DrawnArea = { lat: number; lng: number; ring: Ring; edits?: LayoutEdits; zones?: SubArea[] };

export const MAX_PINS = 40;
const SAME_PLACE = 1e-4; // about 10 m

/** The area, when it was drawn for this place and has at least three pins. */
export function drawnAreaFor(area: DrawnArea | null | undefined, place: { lat: number; lng: number }): DrawnArea | null {
  if (!area || !Array.isArray(area.ring) || area.ring.length < 3) return null;
  return Math.abs(area.lat - place.lat) < SAME_PLACE && Math.abs(area.lng - place.lng) < SAME_PLACE ? area : null;
}

/** The surface of a ring of pins in m², rounded. */
export const pinsM2 = (ring: Ring) => (ring.length < 3 ? 0 : Math.round(ringAreaM2(ring)));

/** The surface drawn for this place, minus the zones left free, or null. */
export function drawnM2(area: DrawnArea | null | undefined, place: { lat: number; lng: number }): number | null {
  const a = drawnAreaFor(area, place);
  return a ? usableM2(a) : null;
}

const zonesOf = (a: DrawnArea) => (Array.isArray(a.zones) ? a.zones.filter((z) => Array.isArray(z.ring) && z.ring.length >= 3) : []);
/** The surface of the zones left free (counted once even when they overlap little: just summed, capped at the area). */
export const freeM2 = (a: DrawnArea) => Math.min(pinsM2(a.ring), zonesOf(a).filter((z) => z.kind === "libera").reduce((s, z) => s + pinsM2(z.ring), 0));
/** The surface that takes interventions: the area minus its free zones. */
export const usableM2 = (a: DrawnArea) => Math.max(0, pinsM2(a.ring) - freeM2(a));

/** The lots of the project ("Lotto A", "Lotto B"…), each with its surface and its share of the usable surface. */
export function lotsOf(a: DrawnArea | null): Array<{ id: string; name: string; m2: number; share: number }> {
  if (!a) return [];
  const usable = usableM2(a) || 1;
  return zonesOf(a).filter((z) => z.kind === "lotto").map((z, i) => ({ id: z.id, name: z.name ?? `Lotto ${String.fromCharCode(65 + i)}`, m2: pinsM2(z.ring), share: Math.min(1, pinsM2(z.ring) / usable) }));
}

/** The next zone's name: "Lotto C" after two lots, else the kind. */
export function zoneName(a: DrawnArea, kind: ZoneKind): string {
  if (kind !== "lotto") return ZONE_LABEL[kind];
  return `Lotto ${String.fromCharCode(65 + zonesOf(a).filter((z) => z.kind === "lotto").length)}`;
}

export const zonesOfArea = zonesOf;

/** "3.250 m²", or "2,4 ha" from one hectare up. */
export function surfaceText(m2: number): string {
  // Thousands always grouped with a dot, as elsewhere in the app ("5.399", not "5399").
  return m2 >= 10_000 ? `${(m2 / 10_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} ha` : `${String(Math.round(m2)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} m²`;
}

/** Where a surface comes from, in words for each flow. */
export type SurfaceSource = "drawn" | "measured" | "reference";
export function surfaceSource(drawn: number | null, measured: number | null): SurfaceSource {
  return drawn !== null ? "drawn" : measured !== null ? "measured" : "reference";
}

/**
 * The inner zones in words, for the dashboard and the report: the surface left free and each lot with its surface and
 * its share of the cost ("Lotto A" · "1.200 m² · 25–60 mila €"); nothing without zones.
 */
export function zoneSummaryRows(area: DrawnArea | null | undefined, place: { lat: number; lng: number }, cost: { lo: number; hi: number }, empty: boolean, money: (c: { lo: number; hi: number }) => string): Array<[string, string]> {
  const a = drawnAreaFor(area, place);
  if (!a) return [];
  const rows: Array<[string, string]> = [];
  const free = freeM2(a), nFree = zonesOf(a).filter((z) => z.kind === "libera").length;
  if (free > 0) rows.push(["Zone libere", `${nFree} · ${surfaceText(free)} esclusi dai costi`]);
  for (const kind of ["alberi", "prato", "ombra"] as const) {
    const zs = zonesOf(a).filter((z) => z.kind === kind);
    if (zs.length) rows.push([`Zone ${ZONE_LABEL[kind].toLowerCase()}`, `${zs.length} · ${surfaceText(zs.reduce((t, z) => t + pinsM2(z.ring), 0))}`]);
  }
  for (const l of lotsOf(a)) rows.push([l.name, `${surfaceText(l.m2)}${empty ? "" : ` · ${money({ lo: cost.lo * l.share, hi: cost.hi * l.share })}`}`]);
  return rows;
}
