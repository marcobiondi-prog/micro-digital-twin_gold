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
  followWanted = false;
  try { localStorage.setItem(GPS_PAUSE_KEY, "1"); } catch { /* storage unavailable */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FOCUS_AREA_EVENT));
}

/** The GPS follows the phone again (signed out, off the project): the pause dropped and the map's search told. */
export const FOLLOW_GPS_EVENT = "mdt-gps-follow";
export function followGpsAgain() {
  followWanted = true;
  try { localStorage.removeItem(GPS_PAUSE_KEY); } catch { /* storage unavailable */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FOLLOW_GPS_EVENT));
}
