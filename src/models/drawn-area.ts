import { ringAreaM2, type Ring } from "./place-area";

/**
 * An area drawn with pins on the map of a simulation: its corners ([lat, lng]) and the place it was drawn for. It is
 * kept with the simulation and counts only while that same place is chosen; its surface then replaces the measured
 * (or reference) one in costs and benefits.
 */
export type DrawnArea = { lat: number; lng: number; ring: Ring };

export const MAX_PINS = 40;
const SAME_PLACE = 1e-4; // about 10 m

/** The area, when it was drawn for this place and has at least three pins. */
export function drawnAreaFor(area: DrawnArea | null | undefined, place: { lat: number; lng: number }): DrawnArea | null {
  if (!area || !Array.isArray(area.ring) || area.ring.length < 3) return null;
  return Math.abs(area.lat - place.lat) < SAME_PLACE && Math.abs(area.lng - place.lng) < SAME_PLACE ? area : null;
}

/** The surface of a ring of pins in m², rounded. */
export const pinsM2 = (ring: Ring) => (ring.length < 3 ? 0 : Math.round(ringAreaM2(ring)));

/** The surface drawn for this place, or null. */
export function drawnM2(area: DrawnArea | null | undefined, place: { lat: number; lng: number }): number | null {
  const a = drawnAreaFor(area, place);
  return a ? pinsM2(a.ring) : null;
}

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
