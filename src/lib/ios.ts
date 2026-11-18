/** iPhone or iPad (iPadOS reads as a Mac with touch). Their browser gives WebGL little memory: the 3D maps there stay
 *  light — the realistic models froze the 3D at the first intervention. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** iPhone and iPad: the 3D's realistic models, off unless turned on by hand on this phone (a test of what Safari
 *  bears; when on they are the light version — smaller pictures, fewer leaves and pebbles, built one at a time). */
const REAL_KEY = "mdt-ios-real-3d-v1";
const listeners = new Set<() => void>();
export function iosRealModels(): boolean {
  try { return localStorage.getItem(REAL_KEY) === "on"; } catch { return false; }
}
export function setIosRealModels(on: boolean) {
  try { localStorage.setItem(REAL_KEY, on ? "on" : "off"); } catch { /* private mode */ }
  listeners.forEach((f) => f());
}
export function subscribeIosRealModels(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
