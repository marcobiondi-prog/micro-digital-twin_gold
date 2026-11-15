import type { FixInput } from "@/models/field-finds";

/**
 * Where the phone is and where it points, for «Aggiungi al progetto»: one GPS fix (high accuracy, at most `timeoutMs`)
 * and the compass heading (Android: deviceorientationabsolute, iPhone: webkitCompassHeading), read for a moment.
 * Either can be missing: the caller falls back to the place's point. Uses the app's own geolocation guard, so a
 * position revoked inside the app answers no fix.
 */
export function readHeading(waitMs = 900): Promise<number | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("deviceorientationabsolute", onAbs as EventListener, true);
      window.removeEventListener("deviceorientation", onRel, true);
      resolve(v);
    };
    const onAbs = (e: DeviceOrientationEvent) => { if (e.alpha !== null) finish((360 - e.alpha) % 360); };
    const onRel = (e: DeviceOrientationEvent) => {
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof ios === "number" && Number.isFinite(ios)) finish(ios);
      else if (e.absolute && e.alpha !== null) finish((360 - e.alpha) % 360);
    };
    window.addEventListener("deviceorientationabsolute", onAbs as EventListener, true);
    window.addEventListener("deviceorientation", onRel, true);
    window.setTimeout(() => finish(null), waitMs);
  });
}

export function readFix(timeoutMs = 6000): Promise<FixInput> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  const pos = new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 });
  });
  return Promise.all([pos, readHeading()]).then(([p, heading]) =>
    p ? { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null, heading } : null,
  );
}

/** A small JPEG (longest side `px`) of a data URL, for the find's thumbnail; null when it cannot be made. */
export async function smallThumb(src: string | null, px = 160): Promise<string | null> {
  if (!src || typeof document === "undefined") return null;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const k = px / Math.max(img.naturalWidth, img.naturalHeight, 1);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * Math.min(1, k)));
    c.height = Math.max(1, Math.round(img.naturalHeight * Math.min(1, k)));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  } catch { return null; }
}
