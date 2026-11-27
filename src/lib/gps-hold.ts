/**
 * Progetti condivisi: bring the map back to the project's area. A colleague's change to a shared project (lib/project-sync)
 * calls focusProjectArea: the map's GPS is put on pause on the project's place (it keeps sending where the person is, but
 * no longer moves the map nor the place) and the 2D map frames the area of intervention again.
 */
export const GPS_PAUSE_KEY = "mdt-gps-paused-v1";
export const FOCUS_AREA_EVENT = "mdt-focus-area";

/** Whether the GPS was last asked to follow the phone (followGpsAgain) rather than to hold the project's area. */
let followWanted = false;
export const gpsFollowWanted = () => followWanted;
export function focusProjectArea() {
  followWanted = false; exploringNow = false;
  try { localStorage.setItem(GPS_PAUSE_KEY, "1"); } catch { /* storage unavailable */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FOCUS_AREA_EVENT));
}

/** The GPS follows the phone again (signed out, off the project): the pause dropped and the map's search told. */
export const FOLLOW_GPS_EVENT = "mdt-gps-follow";
export function followGpsAgain() {
  followWanted = true; exploringNow = false;
  try { localStorage.removeItem(GPS_PAUSE_KEY); } catch { /* storage unavailable */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FOLLOW_GPS_EVENT));
}

/** The person moved the map by hand (a drag, a pinch, a wheel): the GPS stops following so the map can be explored. */
export const EXPLORE_MAP_EVENT = "mdt-map-explore";
let exploringNow = false;
/** Exploring by hand right now (until the GPS follows again or the project's area is brought back). */
export const isExploring = () => exploringNow;
export const stopExploring = () => { exploringNow = false; };
export function exploringMap() { exploringNow = true; if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EXPLORE_MAP_EVENT)); }
