/**
 * What each simulation had at every place it was used: when the place changes, the interventions and the area drawn
 * (with its zones and hand arrangements) of the place left are kept, and those of the place reached come back — so
 * changing place, or coming back to one, never loses anything. Pure: the store calls it on every location change.
 */
export type PlaceSnap<T> = { lat: number; lng: number; label?: string; snap: T };
/** About 30 m: the same place even when searched again or reached by the GPS a little aside. */
export const NEAR_PLACE = 3e-4;
const MAX_PLACES = 30;

export const samePlace = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.abs(a.lat - b.lat) < NEAR_PLACE && Math.abs(a.lng - b.lng) < NEAR_PLACE;

/**
 * Leaving `from` for `to`: `from`'s snapshot replaces any earlier one of that place, and `to`'s snapshot (if any) is
 * returned to be put back. The list keeps the 30 most recent places.
 */
export function movePlace<T>(places: PlaceSnap<T>[] | undefined, from: { lat: number; lng: number; label?: string; pending?: boolean }, snap: T, to: { lat: number; lng: number }): { places: PlaceSnap<T>[]; back: T | null } {
  const rest = (places ?? []).filter((p) => !samePlace(p, from));
  // No place chosen yet: nothing to keep for it.
  const kept = from.pending ? rest : [{ lat: from.lat, lng: from.lng, ...(from.label ? { label: from.label } : {}), snap }, ...rest].slice(0, MAX_PLACES);
  const found = kept.find((p) => samePlace(p, to) && !samePlace(p, from)) ?? null;
  return { places: kept, back: found ? found.snap : null };
}

/** The last place left before `now` (the most recent other one kept), to go back to it in one tap; null when none. */
export function lastPlace<T>(places: PlaceSnap<T>[] | undefined, now: { lat: number; lng: number }): { label: string; lat: number; lng: number } | null {
  const p = (places ?? []).find((q) => !samePlace(q, now));
  return p ? { label: p.label ?? `Posizione (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`, lat: p.lat, lng: p.lng } : null;
}
