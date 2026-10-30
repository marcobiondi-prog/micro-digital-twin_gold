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

const AREA: Record<string, string> = {
  Europe: "Europa", America: "America", Asia: "Asia", Africa: "Africa", Australia: "Australia", Pacific: "Pacifico",
  Atlantic: "Atlantico", Indian: "Oceano Indiano", Antarctica: "Antartide", Arctic: "Artico",
};
/** A few zones for engines that cannot list them all. */
const FALLBACK_ZONES = ["UTC", "Europe/London", "Europe/Lisbon", "Europe/Rome", "Europe/Athens", "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Pacific/Honolulu", "Africa/Cairo", "Africa/Johannesburg"];

export type ZoneOption = { tz: string; label: string; offset: number };
/**
 * Every time zone the browser knows (cities only: no Etc/ aliases), as "UTC+1 · Rome (Europa)", ordered by offset at
 * that instant, then by name.
 */
export function zoneOptions(ms: number): ZoneOption[] {
  let all: string[];
  try { all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES; } catch { all = FALLBACK_ZONES; }
  const list = all.filter((tz) => tz === "UTC" || (tz.includes("/") && AREA[tz.split("/")[0]!] !== undefined));
  if (!list.includes("UTC")) list.unshift("UTC");
  return list
    .map((tz) => {
      const parts = tz.split("/"), city = (parts[parts.length - 1] ?? tz).replace(/_/g, " ");
      const place = tz === "UTC" ? "Tempo universale" : `${city} (${AREA[parts[0]!]})`;
      return { tz, offset: offsetMinutes(ms, tz), label: `${utcOffsetText(ms, tz)} · ${place}` };
    })
    .sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label, "it"));
}

/** The hour in zone `to` when it is `hour` in zone `from` (whole hours; half-hour zones round down). */
export function shiftHour(hour: number, ms: number, from: string, to: string): number {
  const d = Math.floor((offsetMinutes(ms, to) - offsetMinutes(ms, from)) / 60);
  return (((hour + d) % 24) + 24) % 24;
}

/** The zone's ora solare and ora legale offsets that year (minutes), or null where it keeps one time all year. */
export function zoneOffsets(ms: number, tz: string): { solare: number; legale: number } | null {
  const year = new Date(ms).getUTCFullYear();
  const jan = offsetMinutes(Date.UTC(year, 0, 1), tz), jul = offsetMinutes(Date.UTC(year, 6, 1), tz);
  return jan === jul ? null : { solare: Math.min(jan, jul), legale: Math.max(jan, jul) };
}

/** Ora solare or legale by hand: "auto" follows the calendar. */
export type DstMode = "auto" | "solare" | "legale";
/** Minutes to add to the zone's clock to read it in the chosen ora (0 on "auto" or in a zone without ora legale). */
export function dstShift(ms: number, tz: string, mode: DstMode): number {
  const o = mode === "auto" ? null : zoneOffsets(ms, tz);
  return o ? o[mode as "solare" | "legale"] - offsetMinutes(ms, tz) : 0;
}

/** The hands at a change: the time the clocks show just before it and the one they jump to ("03:00" → "02:00"). */
export function changeHands(at: number, tz: string): { from: string; to: string } {
  const before = placeTime(at - 60_000, tz), after = placeTime(at, tz);
  const total = (before.hour * 60 + before.minute + 1) % 1440;
  const two = (n: number) => String(n).padStart(2, "0");
  return { from: `${two(Math.floor(total / 60))}:${two(total % 60)}`, to: `${two(after.hour)}:${two(after.minute)}` };
}

/**
 * What to tell about the change of ora around now: from 36 hours before it ("Stanotte torna l'ora solare…") to 12
 * hours after ("Stanotte è tornata…"), with a key so each change is told once; null otherwise.
 */
export function changeNotice(ms: number, tz: string): { key: string; at: number; text: string; ahead: boolean } | null {
  const H = 3_600_000;
  const past = summerTime(ms - 12 * H, tz).next;
  if (past && past.at <= ms) {
    const h = changeHands(past.at, tz);
    return { key: `${tz}@${past.at}`, at: past.at, ahead: false, text: `Stanotte ${past.to === "solare" ? "è tornata l'ora solare" : "è arrivata l'ora legale"}: le lancette sono passate dalle ${h.from} alle ${h.to}. L'ora dell'app è già giusta.` };
  }
  const next = summerTime(ms, tz).next;
  if (!next || next.at - ms > 36 * H) return null;
  const h = changeHands(next.at, tz);
  const when = next.at - ms <= 24 * H ? "Stanotte" : "Domani notte";
  return { key: `${tz}@${next.at}`, at: next.at, ahead: true, text: `${when} ${next.to === "solare" ? "torna l'ora solare" : "arriva l'ora legale"}: alle ${h.from} le lancette vanno alle ${h.to}.` };
}

/** A calendar file with a reminder the evening before the change (the alarm rings 6 hours before it). */
export function changeCalendar(at: number, to: "solare" | "legale", hands: { from: string; to: string }, now = Date.now()): string {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const title = to === "solare" ? "Torna l'ora solare" : "Arriva l'ora legale";
  const note = `Alle ${hands.from} le lancette vanno alle ${hands.to}.`;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Micro Digital Twin//Cambio ora//IT", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:cambio-ora-${at}@micro-digital-twin`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(at)}`, `DTEND:${stamp(at + 60_000)}`,
    `SUMMARY:${title}`, `DESCRIPTION:${note}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${title}. ${note}`, "TRIGGER:-PT6H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
