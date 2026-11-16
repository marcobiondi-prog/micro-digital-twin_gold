/** Open edge-to-edge without requesting browser fullscreen. */
export async function prepareArOrientation(): Promise<void> {
  setArOrientationActive(true);
}

/**
 * Native orientation policy shared by the app shell and camera lifecycle. Resolves true when the wanted lock
 * is held. Callers fire it on every resize/rotation/tap, so: an identical lock already held is not requested
 * again, and a request superseded by a newer one (AbortError) is not a refusal: it must not unlock (that
 * flashed the screen back to portrait mid-rotation) and it answers with the newer request's outcome.
 */
let heldLock: { target: ScreenOrientation; value: string; fullscreen: boolean } | null = null;
let latestSync: Promise<boolean> = Promise.resolve(false);
export function syncAppOrientation(): Promise<boolean> {
  const run: Promise<boolean> = applyAppOrientation().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError" && latestSync !== run) return latestSync;
    return false;
  });
  latestSync = run;
  return run;
}
async function applyAppOrientation(): Promise<boolean> {
  const active = document.documentElement.hasAttribute("data-ar-camera");
  const videoLandscape = document.documentElement.hasAttribute("data-home-video-landscape");
  const mobile = navigator.maxTouchPoints > 0 || Math.min(screen.width, screen.height) <= 639;
  if (!active && !mobile) return false;
  const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
  if (!orientation?.lock) return false;
  // AR rotates freely; a phone home video turns the screen landscape; otherwise portrait.
  const value = active ? "any" : videoLandscape ? "landscape" : "portrait-primary";
  const fullscreen = Boolean(document.fullscreenElement);
  if (heldLock && heldLock.target === orientation && heldLock.value === value && heldLock.fullscreen === fullscreen) return true;
  try {
    await orientation.lock(value);
    heldLock = { target: orientation, value, fullscreen };
    // A portrait request already in flight must not relock a newly opened camera.
    if (active !== document.documentElement.hasAttribute("data-ar-camera")) return syncAppOrientation();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    heldLock = null;
    // Release runtime portrait locking; manifest/APK overrides need host support.
    if (active && document.documentElement.hasAttribute("data-ar-camera")) {
      try { orientation.unlock(); } catch { /* Unsupported host. */ }
    }
    return false;
  }
}

/**
 * Forgets the lock we think we hold and asks again. An AR session (WebXR) takes the screen's orientation for
 * itself and, when it ends, Chrome puts back the manifest's portrait without telling the page: the cached lock
 * then still read "any", so it was never asked again and the camera stayed portrait-locked (drawn turned by CSS,
 * the page letterboxed) after leaving AR.
 */
export function resetAppOrientation(): Promise<boolean> {
  heldLock = null;
  return syncAppOrientation();
}

/** Phone home videos play landscape; hosts that refuse the lock fall back to the CSS-rotated surface. */
export function setHomeVideoLandscape(active: boolean) {
  document.documentElement.toggleAttribute("data-home-video-landscape", active);
  void syncAppOrientation();
}

/** Camera-only exception to the app's portrait lock. */
export function setArOrientationActive(active: boolean) {
  document.documentElement.toggleAttribute("data-ar-camera", active);
  void syncAppOrientation();
  window.dispatchEvent(new Event("ar-orientation-change"));
}

/** Project gravity onto screen-down without Euler swaps or full spins. */
export function cameraViewport(width: number, height: number, angle: number, beta: number | null, gamma: number | null, previousRotation = 0, type?: string) {
  // Native resize wins. Only rotate the inner camera surface when a portrait
  // WebView refuses free orientation without browser fullscreen.
  let rotation = 0;
  if (width < height) {
    const normalized = ((angle % 360) + 360) % 360;
    // Landscape-natural tablets (Surface, many Windows/Android tablets) report 90/270 while
    // genuinely portrait: the system already rotated the screen and its gesture/task bar,
    // so the controls stay with it instead of turning sideways.
    if ((normalized === 90 || normalized === 270) && type?.startsWith("portrait")) rotation = 0;
    else if (normalized === 90 || normalized === 270) rotation = normalized === 90 ? 90 : -90;
    else if (normalized === 0 && beta != null && gamma != null) {
      // Screen-plane gravity separates an actual quarter turn from camera pitch.
      // When nearly flat or between cardinal directions, keep the last orientation.
      const b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
      const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b);
      rotation = previousRotation;
      if (Math.hypot(x, y) >= 0.45) {
        const bearing = Math.atan2(x, y) * 180 / Math.PI;
        const cardinal = Math.round(bearing / 90) * 90;
        if (Math.abs(bearing - cardinal) <= 25) rotation = cardinal === -180 ? 180 : cardinal || 0;
      }
    }
  }
  const sideways = Math.abs(rotation) === 90;
  return { width: sideways ? height : width, height: sideways ? width : height, rotation, landscape: width > height || sideways };
}

/** Project gravity onto screen-down without Euler swaps or full spins. */
export function groundTilt(beta: number, gamma: number, angle: number) {
  const b = beta * Math.PI / 180;
  const g = gamma * Math.PI / 180;
  const a = angle * Math.PI / 180;
  const x = -Math.cos(b) * Math.sin(g);
  const y = Math.sin(b);
  const z = Math.cos(b) * Math.cos(g);
  const down = y * Math.cos(a) - x * Math.sin(a);
  const pitch = Math.atan2(Math.abs(z), Math.abs(down)) * 180 / Math.PI;
  return { beta: 90 - Math.max(15, Math.min(40, pitch)), gamma: 0 };
}

export const isGroundPoint = (ny: number) => ny >= 0.48 && ny <= 1;
/** Follow the shortest turn, including crossing ±180°. */
export function shortestRotationDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}
