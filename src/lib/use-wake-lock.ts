import { useEffect } from "react";

/**
 * Keeps the screen on while `on` (the simulation's map open): the Screen Wake Lock, asked again whenever the page comes
 * back in front (the browser drops it when hidden). Where the browser has none, nothing happens.
 */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || typeof navigator === "undefined") return;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void>; released?: boolean }> } }).wakeLock;
    if (!wl) return;
    let lock: { release: () => Promise<void>; released?: boolean } | null = null, alive = true;
    const ask = () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      void wl.request("screen").then((l) => { if (alive) lock = l; else void l.release(); }).catch(() => { /* refused: battery saver */ });
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => { alive = false; document.removeEventListener("visibilitychange", ask); void lock?.release().catch(() => undefined); };
  }, [on]);
}
