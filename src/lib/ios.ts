/**
 * Mobile or tablet device (Android, iPhone, iPad). Mobile browsers give WebGL limited memory:
 * the 3D maps there stay light by default (plain shapes) — realistic models freeze the 3D map
 * or crash the WebGL context on mobile devices.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Kept for backward compatibility. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Mobile devices (Android, iPhone, iPad): the 3D realistic models, off by default unless turned on by hand
 *  (when on, they run in the light version — smaller textures, low instances, built one at a time). */
const REAL_KEY = "mdt-mobile-real-3d-v1";
const LEGACY_KEY = "mdt-ios-real-3d-v1";
const listeners = new Set<() => void>();

export function mobileRealModels(): boolean {
  try {
    const val = localStorage.getItem(REAL_KEY);
    if (val !== null) return val === "on";
    return localStorage.getItem(LEGACY_KEY) === "on";
  } catch { return false; }
}

export function setMobileRealModels(on: boolean) {
  try {
    localStorage.setItem(REAL_KEY, on ? "on" : "off");
    localStorage.setItem(LEGACY_KEY, on ? "on" : "off");
  } catch { /* private mode */ }
  listeners.forEach((f) => f());
}

export const iosRealModels = mobileRealModels;
export const setIosRealModels = setMobileRealModels;
export function subscribeIosRealModels(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export const subscribeMobileRealModels = subscribeIosRealModels;
