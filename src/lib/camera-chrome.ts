// AI camera edge-to-edge: hides the white system bars while the camera is open.
// 1) Browser fullscreen (hides status and navigation bar) where the host allows it: Android/desktop
//    Chrome, needs the tap that opened the camera (transient user activation). iOS has no element
//    fullscreen, so it is skipped there.
// 2) Always, as the fallback when fullscreen is refused: a dark theme-color, so at least the status
//    bar turns dark. Both are undone on close. In fullscreen only Android rotates (cameraRotatesNatively).
// Android Back first only leaves fullscreen (no popstate): a fullscreen exit that does not follow a
// rotation is that Back and closes the camera at once, so one Back is enough (fullscreenExitIsBack). An exit
// that came with a turn (the camera stays open) goes back to fullscreen: at once, or on the next tap.

import { syncAppOrientation } from "@/lib/ar-orientation";

const CAMERA_THEME = "#000000";
let enteredFullscreen = false;
let cameraMeta: HTMLMetaElement | null = null;
// The router may re-render <head> and drop foreign tags: while the camera is open, put it back first.
let headWatch: MutationObserver | null = null;
const keepFirst = () => { if (cameraMeta && document.head.firstChild !== cameraMeta) document.head.prepend(cameraMeta); };

/** Which way the camera goes edge-to-edge on this device. */
export function cameraChromeMode(doc: Pick<Document, "fullscreenEnabled"> & { documentElement: { requestFullscreen?: unknown } }): "fullscreen" | "dark-bars" {
  return doc.fullscreenEnabled && typeof doc.documentElement.requestFullscreen === "function" ? "fullscreen" : "dark-bars";
}

/**
 * One rotation at a time. In fullscreen the screen may rotate natively (lock "any"), so the camera stops its
 * own CSS rotation and simply follows the native layout: no double turn. Outside fullscreen (refused, iOS,
 * or after leaving it) the app stays portrait and the camera surface turns by itself as before.
 */
let nativeRotation = false;
export function cameraRotatesNatively() { return nativeRotation; }
// Through the app's shared policy (not a second lock call, which would abort the shell's own request).
function allowNativeRotation() {
  void syncAppOrientation().then((held) => {
    nativeRotation = held && Boolean(document.fullscreenElement);
    window.dispatchEvent(new Event("ar-orientation-change"));
  });
}
/** While the camera is open (between enterCameraChrome and exitCameraChrome). */
let cameraOpen = false;
let regainTimer = 0;
/** The next tap anywhere, carrying the user activation fullscreen needs. */
let regainOnTap: (() => void) | null = null;
const TAP_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;
function clearRegainOnTap() {
  if (!regainOnTap) return;
  for (const t of TAP_EVENTS) document.removeEventListener(t, regainOnTap, true);
  regainOnTap = null;
}
function requestCameraFullscreen(): Promise<boolean> {
  return document.documentElement.requestFullscreen({ navigationUI: "hide" })
    .then(() => { enteredFullscreen = true; allowNativeRotation(); return true; })
    .catch(() => false);
}
/**
 * Back to fullscreen after Android dropped it while turning the phone (the camera stayed open, so it was not a
 * Back): at once when the browser allows it, else on the next tap anywhere, which carries the activation it needs.
 */
function regainFullscreen() {
  if (!cameraOpen || document.fullscreenElement || cameraChromeMode(document) !== "fullscreen") return;
  void requestCameraFullscreen().then((ok) => {
    if (ok || !cameraOpen || regainOnTap) return;
    regainOnTap = () => { clearRegainOnTap(); if (cameraOpen && !document.fullscreenElement) void requestCameraFullscreen(); };
    for (const t of TAP_EVENTS) document.addEventListener(t, regainOnTap, true);
  });
}
const onFullscreenChange = () => {
  if (document.fullscreenElement) { clearRegainOnTap(); return; }
  if (nativeRotation) {
    nativeRotation = false;
    window.dispatchEvent(new Event("ar-orientation-change"));
  }
  // A Back closes the camera at once (fullscreenExitIsBack); still open a moment later, the exit came with a turn.
  window.clearTimeout(regainTimer);
  regainTimer = window.setTimeout(regainFullscreen, ROTATION_EXIT_WINDOW_MS / 2);
};

/**
 * A screen-orientation change within this window explains a fullscreen exit. Resize is not used: leaving
 * fullscreen resizes the page by itself, so a Back would look like a rotation.
 */
export const ROTATION_EXIT_WINDOW_MS = 1000;
let lastTurn = Number.NEGATIVE_INFINITY;
const markTurn = () => { lastTurn = performance.now(); };

/** True when a fullscreen exit is the user's Back (close the camera), false when a rotation caused it. */
export function fullscreenExitIsBack(now: number, lastTurnAt: number = lastTurn) {
  return now - lastTurnAt > ROTATION_EXIT_WINDOW_MS;
}

/** Resolves true when the camera went fullscreen (Chrome shows its own notice). */
export function enterCameraChrome(): Promise<boolean> {
  cameraOpen = true;
  if (!cameraMeta) {
    cameraMeta = document.createElement("meta");
    cameraMeta.name = "theme-color";
    cameraMeta.content = CAMERA_THEME;
    cameraMeta.dataset["cameraChrome"] = "";
  }
  keepFirst();
  if (!headWatch && typeof MutationObserver !== "undefined") {
    headWatch = new MutationObserver(keepFirst);
    headWatch.observe(document.head, { childList: true });
  }
  screen.orientation?.addEventListener?.("change", markTurn);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  if (cameraChromeMode(document) !== "fullscreen" || document.fullscreenElement) return Promise.resolve(false);
  // Refused (no user activation, WebView, policy): dark bars stay.
  return requestCameraFullscreen();
}

export function exitCameraChrome() {
  cameraOpen = false;
  window.clearTimeout(regainTimer);
  clearRegainOnTap();
  headWatch?.disconnect();
  headWatch = null;
  cameraMeta?.remove();
  screen.orientation?.removeEventListener?.("change", markTurn);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  nativeRotation = false;
  if (enteredFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  enteredFullscreen = false;
}
