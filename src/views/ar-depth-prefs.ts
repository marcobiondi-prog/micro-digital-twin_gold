/** ARCore depth: what this phone chose or refused, and what the session asks (no three.js here). */
/** Whether the depth is asked with the session, kept on this phone. */
const WANT_KEY = "mdt-ar-depth-v1", FLIP_KEY = "mdt-ar-depth-flip-v2";
// On by default (the objects must see the room around them); «Spegni profondità» keeps it off on this phone.
/** ARCore's depth asked only when wanted and not refused on this phone in the last day: a refused configuration spends
 *  the tap's activation, and the next one is then refused too ("SecurityError"), so ARCore did not start at all. */
const NA_KEY = "mdt-ar-depth-na-v1";
export function depthWanted(): boolean {
  try {
    if (localStorage.getItem(WANT_KEY) === "off") return false;
    const na = Number(localStorage.getItem(NA_KEY) ?? 0);
    return !(na && Date.now() - na < 86_400_000);
  } catch { return true; }
}
export function markDepthRefused() { try { localStorage.setItem(NA_KEY, String(Date.now())); } catch { /* private mode */ } }
export function setDepthWanted(on: boolean) { try { localStorage.setItem(WANT_KEY, on ? "on" : "off"); if (on) localStorage.removeItem(NA_KEY); } catch { /* private mode */ } }
/** How the depth map is turned against the screen, to find the right one by trying: 0…3. */
export const FLIP_MODES = 4;
// Default 1 (the framebuffer's own y): with the spec's top-left reading (0) on the user's Xperia the far part of the
// screen read the near floor's depth and everything vanished. The key moved to v2 so the old choice does not stick.
export function depthFlip(): number { try { const v = localStorage.getItem(FLIP_KEY); const n = v === null ? 1 : Number(v); return n >= 0 && n < FLIP_MODES ? n : 1; } catch { return 1; } }
export function setDepthFlip(n: number) { try { localStorage.setItem(FLIP_KEY, String(n)); } catch { /* private mode */ } }

/** The depth asked with the session: CPU-side, as Chrome on ARCore gives it. */
export const DEPTH_INIT = {
  usagePreference: ["cpu-optimized"],
  dataFormatPreference: ["luminance-alpha", "float32"],
  // The newer spelling of the same two lists.
  usage: ["cpu-optimized"],
  dataFormat: ["luminance-alpha", "float32"],
};

