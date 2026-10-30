/**
 * The time at a place: the world time (the device clock corrected against the server's) read in the place's own
 * time zone, so a simulation of a faraway square follows that square's hour, not the phone's.
 */
export type PlaceTime = { month: number; hour: number; minute: number };

/** The device's own time zone (the fallback while the place's is not known). */
export const deviceTimeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

/** A time zone the browser knows, else null. */
export const validTimeZone = (tz: unknown): string | null => {
  if (typeof tz !== "string" || !tz) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
};

/** Month (0–11), hour (0–23) and minute of the instant `ms` in the time zone `tz`. */
export function placeTime(ms: number, tz: string): PlaceTime {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { month: get("month") - 1, hour: get("hour") % 24, minute: get("minute") };
}

/** "UTC+1", "UTC−5", "UTC+5:30", "UTC" for the zone at that instant (summer time included). */
export function utcOffsetText(ms: number, tz: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return "UTC";
  return `UTC${m[1] === "-" ? "−" : "+"}${Number(m[2])}${m[3] && m[3] !== "00" ? `:${m[3]}` : ""}`;
}

/** The zone's name in plain Italian ("Ora dell'Europa centrale"), else its city ("Tokyo"). */
export function zoneName(ms: number, tz: string): string {
  try {
    const n = new Intl.DateTimeFormat("it-IT", { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value;
    if (n && !/^GMT|^UTC/.test(n)) return n.charAt(0).toUpperCase() + n.slice(1);
  } catch { /* older engines */ }
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

/** Whether two zones show the same hour at that instant. */
export const sameClock = (ms: number, a: string, b: string): boolean => utcOffsetText(ms, a) === utcOffsetText(ms, b);

/** How far the device clock is behind the world time, from a server reading taken between `sent` and `got` (device ms). */
export const clockOffset = (server: number, sent: number, got: number): number => server - (sent + got) / 2;

/** Minutes ahead of UTC for the zone at that instant. */
export function offsetMinutes(ms: number, tz: string): number {
  const m = /UTC([+−])(\d+)(?::(\d{2}))?/.exec(utcOffsetText(ms, tz));
  return m ? (m[1] === "−" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/**
 * Ora solare or ora legale at that instant, and when it next changes (within a year): "nessuna" for a zone that keeps
 * one time all year.
 */
export type SummerTime = { kind: "legale" | "solare" | "nessuna"; next: { at: number; to: "legale" | "solare" } | null };
export function summerTime(ms: number, tz: string): SummerTime {
  const DAY = 864e5, year = new Date(ms).getUTCFullYear();
  const jan = offsetMinutes(Date.UTC(year, 0, 1), tz), jul = offsetMinutes(Date.UTC(year, 6, 1), tz);
  if (jan === jul) return { kind: "nessuna", next: null };
  const standard = Math.min(jan, jul), now = offsetMinutes(ms, tz);
  const kind = now > standard ? "legale" : "solare";
  // Day by day to the change, then to the minute it happens.
  for (let d = 1; d <= 366; d++) {
    if (offsetMinutes(ms + d * DAY, tz) === now) continue;
    let lo = ms + (d - 1) * DAY, hi = ms + d * DAY;
    while (hi - lo > 60_000) { const mid = Math.floor((lo + hi) / 2); if (offsetMinutes(mid, tz) === now) lo = mid; else hi = mid; }
    let at = Math.floor(hi / 60_000) * 60_000;
    if (offsetMinutes(at, tz) === now) at += 60_000;
    return { kind, next: { at, to: kind === "legale" ? "solare" : "legale" } };
  }
  return { kind, next: null };
}
