import { useSyncExternalStore } from "react";

// Simulated sign-in for previews only: the build sets __DEMO_LOGIN__ on `vite dev` and on
// Vercel preview deployments, never in production. It only unlocks the signed-in UI
// (AI camera button, 3D map) on this device; server functions still require a real account.
declare const __DEMO_LOGIN__: boolean | undefined;
export const DEMO_LOGIN_AVAILABLE = typeof __DEMO_LOGIN__ !== "undefined" && __DEMO_LOGIN__ === true;

const KEY = "mdt-demo-login";
const listeners = new Set<() => void>();

export function isDemoSignedIn(): boolean {
  if (!DEMO_LOGIN_AVAILABLE || typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setDemoSignedIn(on: boolean) {
  try { if (on) window.sessionStorage.setItem(KEY, "1"); else window.sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** True while the preview-only simulated sign-in is on. */
export function useDemoSignedIn(): boolean {
  return useSyncExternalStore(subscribe, isDemoSignedIn, () => false);
}
