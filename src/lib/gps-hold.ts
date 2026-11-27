/**
 * Progetti condivisi: bring the map back to the project's area. A colleague's change to a shared project (lib/project-sync)
 * calls focusProjectArea: the map's GPS is put on pause on the project's place (it keeps sending where the person is, but
 * no longer moves the map nor the place) and the 2D map frames the area of intervention again.
 */
export const GPS_PAUSE_KEY = "mdt-gps-paused-v1";
export const FOCUS_AREA_EVENT = "mdt-focus-area";

export function focusProjectArea() {
  try { localStorage.setItem(GPS_PAUSE_KEY, "1"); } catch { /* storage unavailable */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FOCUS_AREA_EVENT));
}
