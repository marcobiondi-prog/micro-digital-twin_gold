import { useEffect } from "react";
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
 * The account's cloud space in use: the photos and videos stored in the account (both projects), out of 50 GB.
 * The device's own files (a guest's, or kept offline) do not count until they are uploaded.
 */
export function useCloudUsage(enabled: boolean) {
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  useEffect(() => { if (enabled) { void currentMedia("urban"); void currentMedia("vineyard"); } }, [enabled]);
  const inCloud = [...urban, ...vineyard].filter((m) => m.path);
  const used = inCloud.reduce((s, m) => s + (m.size || 0), 0);
  return { used, quota: CLOUD_QUOTA, share: Math.min(1, used / CLOUD_QUOTA), files: inCloud.length };
}

/** The colour of the space in use: turquoise, amber past 80 %, red past 95 %. */
export const usageTone = (share: number) => (share > 0.95 ? "var(--danger, #ef4444)" : share > 0.8 ? "#f59e0b" : "var(--brand-turquoise)");
