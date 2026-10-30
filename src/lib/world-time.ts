import { getWorldTime } from "@/controllers/world-time.functions";
import { clockOffset } from "@/models/world-clock";

/**
 * World time: the device clock corrected once per session against the server's (half the round trip taken off).
 * Until then, or offline, the device clock as it is.
 */
let offset = 0;
let pending: Promise<void> | null = null;

export const worldNow = () => Date.now() + offset;

export function syncWorldTime(): Promise<void> {
  pending ??= (async () => {
    try {
      const sent = Date.now();
      const { now } = await getWorldTime();
      const got = Date.now();
      // A slow answer says little about the time: keep the device clock then.
      if (got - sent < 5000 && Number.isFinite(now)) offset = clockOffset(now, sent, got);
    } catch { pending = null; }
  })();
  return pending;
}
