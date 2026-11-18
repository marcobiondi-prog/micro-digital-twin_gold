/**
 * One loader for Google's Maps JavaScript API, shared by the 3D view (maps3d) and the 2D map's base (maps), so the
 * two maps show the very same imagery with the same browser key. A refused key calls window.gm_authFailure, which the
 * views read through onKeyRejected.
 */
type GoogleNs = { maps: { importLibrary: (name: string) => Promise<unknown> } };
let loader: Promise<GoogleNs> | undefined;
let keyRejected = false;
const rejectedSubs = new Set<() => void>();
if (typeof window !== "undefined") {
  (window as typeof window & { gm_authFailure?: () => void }).gm_authFailure = () => { keyRejected = true; rejectedSubs.forEach((f) => f()); };
}
export const isKeyRejected = () => keyRejected;
export function onKeyRejected(f: () => void): () => void { rejectedSubs.add(f); return () => { rejectedSubs.delete(f); }; }

export function loadGoogleMaps(key: string): Promise<GoogleNs> {
  loader ??= new Promise<GoogleNs>((resolve, reject) => {
    const w = window as typeof window & { google?: GoogleNs; __mdtMapsReady?: () => void };
    if (w.google?.maps?.importLibrary) { resolve(w.google); return; }
    w.__mdtMapsReady = () => resolve(w.google!);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&language=it&region=IT&loading=async&callback=__mdtMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Maps JavaScript API non raggiungibile"));
    document.head.appendChild(script);
  }).catch((error) => { loader = undefined; throw error; });
  return loader;
}
