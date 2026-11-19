import { useEffect, useSyncExternalStore } from "react";
import { getGoogleUsage, subscribeGoogleUsage } from "@/models/google-usage";
import { CLOUD_QUOTA, currentMedia, useLabMedia } from "@/models/lab-media-store";

export { CLOUD_QUOTA };

/** "0 B", "350 MB", "1,2 GB", in Italian decimals. */
export function bytesText(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString("it-IT", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/**
 * The account's cloud space in use: the photos and videos stored in the account (both projects) plus the space its
 * Google account already uses (signed in with Google), out of 50 GB.
 * The device's own files (a guest's, or kept offline) do not count until they are uploaded.
 */
export function useCloudUsage(enabled: boolean) {
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  useEffect(() => { if (enabled) { void currentMedia("urban"); void currentMedia("vineyard"); } }, [enabled]);
  const inCloud = [...urban, ...vineyard].filter((m) => m.path);
  const media = inCloud.reduce((s, m) => s + (m.size || 0), 0);
  // What the Google account already holds (Gmail, Drive, Photos) counts in the same 50 GB, when signed in with Google.
  const google = useSyncExternalStore(subscribeGoogleUsage, () => getGoogleUsage()?.bytes ?? 0, () => 0);
  const used = media + google;
  return { used, media, google, quota: CLOUD_QUOTA, share: Math.min(1, used / CLOUD_QUOTA), files: inCloud.length };
}

/** The colour of the space in use: turquoise, amber past 80 %, red past 95 %. */
/** The bar's colour by how full the 50 GB are: turquoise when empty, then green, yellow and orange, red at the limit (blended between stops). */
const TONE_STOPS: Array<[number, [number, number, number]]> = [[0, [45, 212, 191]], [0.5, [132, 204, 22]], [0.72, [250, 204, 21]], [0.87, [249, 115, 22]], [1, [239, 68, 68]]];
export function usageTone(share: number): string {
  const x = Math.min(1, Math.max(0, share));
  for (let i = 1; i < TONE_STOPS.length; i++) {
    const [b, cb] = TONE_STOPS[i]!, [a, ca] = TONE_STOPS[i - 1]!;
    if (x <= b) { const t = (x - a) / (b - a); return `rgb(${ca.map((v, j) => Math.round(v + (cb[j]! - v) * t)).join(", ")})`; }
  }
  return "rgb(239, 68, 68)";
}
