// The entrance (tutorial and choice) shows once, at the first access on this device: afterwards a fresh open lands on the map.
// Previews behave the same (they used to show it at every opening; dropped at the user's word).
const KEY = "mdt-intro-seen";

export function introSeen(): boolean {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function markIntroSeen() {
  try { window.localStorage.setItem(KEY, "1"); } catch { /* private mode: the entrance shows again next time */ }
}
