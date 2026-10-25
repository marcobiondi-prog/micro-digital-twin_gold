import { DEMO_LOGIN_AVAILABLE } from "@/lib/demo-login";

// The entrance (tutorial and choice) shows once, at the first access on this device: afterwards a fresh open lands on the map.
// Previews (vite dev and preview deployments, never production) show it at every opening, to try it again and again.
const KEY = "mdt-intro-seen";

export function introSeen(): boolean {
  if (DEMO_LOGIN_AVAILABLE) return false;
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function markIntroSeen() {
  try { window.localStorage.setItem(KEY, "1"); } catch { /* private mode: the entrance shows again next time */ }
}
