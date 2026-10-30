/**
 * History of the interventions made, shown on the Benvenuto page.
 * Free users keep it on this device (localStorage); signed-in users keep it in their account (see lib/use-history).
 */
import { SEASONS, SEASON_LABEL, type Season } from "./season-climate";
import { clockText } from "./sim-when";

export type HistoryFlow = "piazza" | "vigneto";
/** What was set when the entry was recorded, so "Riapri" can put it back (older entries have none). */
export type HistoryMix = (
  | { kind: "piazza"; trees: number; permeable: number; shade: number }
  | { kind: "vigneto"; zones: Array<{ irrigation: number; shade: number; windbreak: number }>; allZones: boolean; selected: number }
) & {
  /** A copy of the simulated season and hour, for an account table that lacks their own columns. */
  when?: { season: string; hour: number; minute?: number } | null;
};
/** The season and hour the simulation was set to when the intervention was made (older entries have none). */
export type HistoryWhen = { season: Season; hour: number; minute?: number };
export type HistoryEntry = { id: string; at: string; flow: HistoryFlow; place: string; text: string; mix?: HistoryMix | null; season?: Season | null; hour?: number | null; minute?: number | null };
/** Where an entry is kept: in the account (recorded signed in) or on this device (recorded without signing in). Not saved, worked out when read. */
export type HistorySource = "account" | "device";
export type SourcedEntry = HistoryEntry & { source: HistorySource };

export const MAX_HISTORY = 500;
export const MAX_TEXT = 300;
const KEY = "mdt-history-v1";

/** A UUID, as the account's table expects (its id column is a uuid); a random v4-shaped one where crypto lacks it. */
function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

export function newEntry(flow: HistoryFlow, text: string, place: string, now: Date = new Date(), mix: HistoryMix | null = null, when: HistoryWhen | null = null): HistoryEntry {
  return { id: uuid(), at: now.toISOString(), flow, place: place.trim(), text: text.trim().slice(0, MAX_TEXT), mix: mix && when ? { ...mix, when } : mix, season: when?.season ?? null, hour: when?.hour ?? null, minute: when?.minute ?? null };
}

const isSeason = (v: unknown): v is Season => typeof v === "string" && (SEASONS as readonly string[]).includes(v);
const isHour = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23;
const isMinute = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 59;
/** The entry's simulated season and hour, when both were recorded (in their own fields, else the copy kept in the mix). */
export const whenOf = (e: HistoryEntry): HistoryWhen | null => {
  const w = e.mix?.when;
  // The minutes: the entry's own (on this device), else the mix's copy (the account table keeps whole hours).
  const m = isMinute(e.minute) ? e.minute : w && isMinute(w.minute) && (!isHour(e.hour) || e.hour === w.hour) ? w.minute : null;
  const minute = m === null ? {} : { minute: m };
  if (isSeason(e.season) && isHour(e.hour)) return { season: e.season, hour: e.hour, ...minute };
  return w && isSeason(w.season) && isHour(w.hour) ? { season: w.season, hour: w.hour, ...minute } : null;
};
/** "15:42" for an entry's simulated time ("15:00" when only the hour was recorded). */
export const whenClock = (w: HistoryWhen): string => clockText(w.hour, w.minute);
/** "Estate, ore 15:42", or "" for an entry without them. */
export const whenLabel = (e: HistoryEntry): string => { const w = whenOf(e); return w ? `${SEASON_LABEL[w.season]}, ore ${whenClock(w)}` : ""; };

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
/** A mix that can be put back: the right numbers for its kind. */
export const isHistoryMix = (v: unknown): v is HistoryMix => {
  if (!v || typeof v !== "object") return false;
  const m = v as { kind?: unknown; trees?: unknown; permeable?: unknown; shade?: unknown; zones?: unknown; allZones?: unknown; selected?: unknown };
  if (m.kind === "piazza") return num(m.trees) && num(m.permeable) && num(m.shade);
  if (m.kind !== "vigneto" || !Array.isArray(m.zones) || m.zones.length === 0) return false;
  return typeof m.allZones === "boolean" && num(m.selected) && m.zones.every((z: unknown) => {
    const zone = z as { irrigation?: unknown; shade?: unknown; windbreak?: unknown } | null;
    return !!zone && num(zone.irrigation) && num(zone.shade) && num(zone.windbreak);
  });
};

export const sortNewestFirst = <E extends HistoryEntry>(entries: readonly E[]): E[] =>
  [...entries].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

/** Newest first, no duplicate ids (the first occurrence wins), at most MAX_HISTORY. */
export const mergeHistory = (...lists: ReadonlyArray<readonly HistoryEntry[]>): HistoryEntry[] => {
  const seen = new Set<string>();
  return sortNewestFirst(lists.flat().filter((e) => !seen.has(e.id) && !!seen.add(e.id))).slice(0, MAX_HISTORY);
};

export const isHistoryEntry = (v: unknown): v is HistoryEntry => {
  const e = v as Partial<HistoryEntry> | null;
  return !!e && typeof e.id === "string" && typeof e.at === "string" && !Number.isNaN(Date.parse(e.at))
    && (e.flow === "piazza" || e.flow === "vigneto") && typeof e.place === "string" && typeof e.text === "string"
    && (e.mix === undefined || e.mix === null || isHistoryMix(e.mix))
    && (e.season === undefined || e.season === null || isSeason(e.season))
    && (e.hour === undefined || e.hour === null || isHour(e.hour))
    && (e.minute === undefined || e.minute === null || isMinute(e.minute));
};

/** Entries grouped by day on this device's calendar, newest first, each headed "29/10/2026". */
export function groupByDay<E extends HistoryEntry>(entries: readonly E[]): { key: string; label: string; items: E[] }[] {
  const groups: { key: string; label: string; items: E[] }[] = [];
  const two = (n: number) => String(n).padStart(2, "0");
  for (const e of sortNewestFirst(entries)) {
    const d = new Date(e.at), label = `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(e);
    else groups.push({ key: label, label, items: [e] });
  }
  return groups;
}

/** Entries grouped by month, newest first: "ottobre 2026". */
export function groupByMonth<E extends HistoryEntry>(entries: readonly E[]): { key: string; label: string; items: E[] }[] {
  const groups: { key: string; label: string; items: E[] }[] = [];
  for (const e of sortNewestFirst(entries)) {
    const d = new Date(e.at), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(e);
    else groups.push({ key, label: d.toLocaleDateString("it-IT", { month: "long", year: "numeric" }), items: [e] });
  }
  return groups;
}

// ── This device (Free) ──
let local: HistoryEntry[] | null = null;
const subs = new Set<() => void>();
const EMPTY: HistoryEntry[] = [];

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
export function localHistory(): HistoryEntry[] {
  if (local) return local;
  try {
    const saved: unknown = JSON.parse(storage()?.getItem(KEY) ?? "[]");
    local = Array.isArray(saved) ? mergeHistory(saved.filter(isHistoryEntry)) : [];
  } catch { local = []; }
  return local;
}
export function addLocalHistory(entry: HistoryEntry) {
  local = mergeHistory([entry], localHistory());
  try { storage()?.setItem(KEY, JSON.stringify(local)); } catch { /* quota or private mode: memory only */ }
  subs.forEach((f) => f());
}
/** Empties this device's history, or only one place's entries (piazza or vigneto). */
export function clearLocalHistory(flow?: HistoryFlow) {
  local = flow ? localHistory().filter((e) => e.flow !== flow) : [];
  try {
    if (local.length) storage()?.setItem(KEY, JSON.stringify(local));
    else storage()?.removeItem(KEY);
  } catch { /* nothing saved */ }
  subs.forEach((f) => f());
}
export const subscribeLocalHistory = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const serverLocalHistory = (): HistoryEntry[] => EMPTY;
/** Test hook: forget the in-memory copy so the next read goes back to storage. */
export const resetLocalHistory = () => { local = null; };

/** One line of an entry's interventions, in plain words: "Alberi" · "7". */
export type MixRow = { label: string; value: string };
/** An entry's interventions as rows to read: the piazza's levers, or the vineyard's scope and each zone's levers. */
export function mixRows(mix: HistoryMix): { title: string; rows: MixRow[] }[] {
  if (mix.kind === "piazza") {
    return [{ title: "Piazza", rows: [
      { label: "Alberi", value: String(mix.trees) },
      { label: "Prato", value: `${mix.permeable} %` },
      { label: "Ombra", value: `${mix.shade} %` },
    ] }];
  }
  const zones = mix.allZones ? mix.zones.map((z, i) => [z, i] as const) : [[mix.zones[mix.selected] ?? mix.zones[0]!, mix.selected] as const];
  return zones.map(([z, i]) => ({ title: `Zona ${i + 1}`, rows: [
    { label: "Irrigazione", value: `+${z.irrigation} %` },
    { label: "Teli d'ombra", value: `${z.shade} %` },
    { label: "Frangivento", value: `${z.windbreak} %` },
  ] }));
}
