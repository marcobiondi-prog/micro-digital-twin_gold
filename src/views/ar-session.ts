import type { LucideIcon } from "lucide-react";
import { DEPTH_INIT, depthWanted, markDepthRefused } from "@/views/ar-depth-prefs";

/**
 * Starting live AR (ARCore through WebXR), apart from the AR view itself: the AI camera asks the session inside the
 * tap with this light module, while the AR view (views/ArLive, with three.js and the realistic models) is loaded only
 * when AR is opened.
 */
/** Is live AR possible here (ARCore through WebXR)? */
export async function arLiveSupported(): Promise<boolean> {
  try {
    return typeof navigator !== "undefined" && !!navigator.xr && (await navigator.xr.isSessionSupported("immersive-ar"));
  } catch { return false; }
}

/** Asks for the AR session; call it straight from a tap (the browser wants a user gesture). */
export async function requestArSession(overlayRoot: HTMLElement): Promise<XRSession> {
  // The session is first asked while the page stays in the camera's fullscreen, so the AR view covers Android's bars
  // like the AI camera. On the user's Xperia every try was once refused in fullscreen, but the cause then turned out to
  // be the site's AR permission being blocked; if a phone still refuses every try in fullscreen, it is remembered
  // (AR_IN_FS_KEY "fail") and from then on the fullscreen is left first, as before. A refusal can spend the tap, so
  // the retry out of fullscreen may answer SecurityError: «Riprova ARCore» then starts it with a fresh tap.
  const report: string[] = [];
  const inFs = typeof document !== "undefined" && !!document.fullscreenElement;
  let fsFail = false;
  try { fsFail = localStorage.getItem(AR_IN_FS_KEY) === "fail"; } catch { /* storage off */ }
  if (inFs && !fsFail) {
    const got = await tryArConfigs(overlayRoot, report, false);
    if (got.session) { try { localStorage.setItem(AR_IN_FS_KEY, "ok"); } catch { /* storage off */ } return got.session; }
    if (!got.allUnsupported) throw new Error(report.join(" · "));
    try { localStorage.setItem(AR_IN_FS_KEY, "fail"); } catch { /* storage off */ }
    report.push("(a schermo intero rifiutata: riprovo fuori)");
  }
  // Out of fullscreen the app's portrait lock comes back, so the orientation the phone is held in is asked to stay
  // (it may be refused; then the AR opens portrait).
  if (typeof document !== "undefined" && document.fullscreenElement) {
    const held = screen.orientation?.type;
    await document.exitFullscreen().catch(() => undefined);
    const o = screen.orientation as ScreenOrientation & { lock?: (v: string) => Promise<void> };
    if (held?.startsWith("landscape")) await o.lock?.(held).catch(() => undefined);
  }
  const got = await tryArConfigs(overlayRoot, report, true);
  if (got.session) return got.session;
  throw new Error(report.join(" · "));
}

const AR_IN_FS_KEY = "mdt-ar-in-fullscreen-v1";

/** Tried in turn, each moving on only on NotSupportedError: with the HUD overlay first, then without it (Chrome shows
 *  its own close button; a tap on the floor still puts the chosen object), then the bare session. */
async function tryArConfigs(overlayRoot: HTMLElement, report: string[], markDepth: boolean): Promise<{ session?: XRSession; allUnsupported: boolean }> {
  const tries: Array<[string, XRSessionInit]> = [
    // ARCore's depth first (real walls and furniture hide the objects), on unless switched off by hand. Optional, so a
    // phone without it still starts.
    ...(depthWanted() ? [["overlay+pavimento+profondità", { requiredFeatures: ["hit-test", "dom-overlay"], optionalFeatures: ["local-floor", "camera-access", "depth-sensing", "light-estimation"], depthSensing: DEPTH_INIT, domOverlay: { root: overlayRoot } } as unknown as XRSessionInit] as [string, XRSessionInit]] : []),
    ["overlay+pavimento", { requiredFeatures: ["hit-test", "dom-overlay"], optionalFeatures: ["local-floor", "camera-access", "light-estimation"], domOverlay: { root: overlayRoot } } as XRSessionInit],
    ["overlay", { requiredFeatures: ["dom-overlay"], optionalFeatures: ["hit-test", "local-floor", "camera-access", "light-estimation"], domOverlay: { root: overlayRoot } } as XRSessionInit],
    ["pavimento", { requiredFeatures: ["hit-test"], optionalFeatures: ["local-floor", "camera-access", "light-estimation"] }],
    ["base", {}],
  ];
  for (const [name, init] of tries) {
    try { return { session: await navigator.xr!.requestSession("immersive-ar", init), allUnsupported: false }; }
    catch (e) {
      report.push(`${name}: ${e instanceof DOMException ? e.name : e instanceof Error ? e.message : String(e)}`);
      // In fullscreen a refusal may come from the fullscreen itself, so the depth is blamed only out of it.
      if (markDepth && e instanceof DOMException && e.name === "NotSupportedError" && name.includes("profondità")) markDepthRefused();
      if (!(e instanceof DOMException) || e.name !== "NotSupportedError") return { allUnsupported: false };
    }
  }
  return { allUnsupported: true };
}

/**
 * The ARCore view in fullscreen like the AI camera: the session is asked out of fullscreen (the user's Xperia refuses
 * it inside), so once it runs the overlay root asks fullscreen again, with the tap's activation still valid. If the
 * phone ends the session because of it (within 2,5 s), this phone is remembered and never asked again.
 */
const AR_FS_KEY = "mdt-ar-fullscreen-v1";
export function arFullscreen(session: XRSession, root: HTMLElement) {
  if (typeof document === "undefined") return;
  try { if (localStorage.getItem(AR_FS_KEY) === "fail") return; } catch { /* storage off */ }
  const el = root as HTMLElement & { requestFullscreen?: (o?: FullscreenOptions) => Promise<void> };
  if (!el.requestFullscreen) return;
  let ended = false;
  const ask = () => {
    if (ended) return;
    const asked = performance.now();
    const onEnd = () => { if (performance.now() - asked < 2500) { try { localStorage.setItem(AR_FS_KEY, "fail"); } catch { /* storage off */ } } };
    session.addEventListener("end", onEnd, { once: true });
    window.setTimeout(() => session.removeEventListener("end", onEnd), 2600);
    // Asked even when the overlay already counts as fullscreen: Chrome's AR overlay leaves Android's navigation bar
    // on screen, and "hide" asks it away.
    void el.requestFullscreen!({ navigationUI: "hide" }).catch(() => undefined);
  };
  ask();
  // The tap that started AR is often spent by the session itself, so the request is made again on the first tap
  // inside the AR view, which carries a fresh activation.
  const onTap = () => { window.removeEventListener("pointerup", onTap, true); ask(); };
  window.addEventListener("pointerup", onTap, true);
  session.addEventListener("end", () => { ended = true; window.removeEventListener("pointerup", onTap, true); }, { once: true });
}


export type FanItem = { key: string; label: string; Icon: LucideIcon; on: boolean; plant?: boolean; tool?: boolean; aria?: string; hint?: string; onPick: () => void };
export type FanGroup = { key: string; label: string; Icon: LucideIcon; items: FanItem[] };
