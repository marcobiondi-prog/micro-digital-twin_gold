/**
 * History of the interventions made, shown on the Benvenuto page.
 * Free users keep it on this device (localStorage); signed-in users keep it in their account (see lib/use-history).
 */
export type HistoryFlow = "piazza" | "vigneto";
export type HistoryEntry = { id: string; at: string; flow: HistoryFlow; place: string; text: string };

export const MAX_HISTORY = 500;
export const MAX_TEXT = 300;
const KEY = "mdt-history-v1";

export function newEntry(flow: HistoryFlow, text: string, place: string, now: Date = new Date()): HistoryEntry {
  const id = `h-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, at: now.toISOString(), flow, place: place.trim(), text: text.trim().slice(0, MAX_TEXT) };
}

export const sortNewestFirst = (entries: readonly HistoryEntry[]): HistoryEntry[] =>
  [...entries].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

/** Newest first, no duplicate ids (the first occurrence wins), at most MAX_HISTORY. */
export const mergeHistory = (...lists: ReadonlyArray<readonly HistoryEntry[]>): HistoryEntry[] => {
  const seen = new Set<string>();
  return sortNewestFirst(lists.flat().filter((e) => !seen.has(e.id) && !!seen.add(e.id))).slice(0, MAX_HISTORY);
};

export const isHistoryEntry = (v: unknown): v is HistoryEntry => {
  const e = v as Partial<HistoryEntry> | null;
  return !!e && typeof e.id === "string" && typeof e.at === "string" && !Number.isNaN(Date.parse(e.at))
    && (e.flow === "piazza" || e.flow === "vigneto") && typeof e.place === "string" && typeof e.text === "string";
};

/** Entries grouped by month, newest first: "ottobre 2026". */
export function groupByMonth(entries: readonly HistoryEntry[]): { key: string; label: string; items: HistoryEntry[] }[] {
  const groups: { key: string; label: string; items: HistoryEntry[] }[] = [];
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
export const subscribeLocalHistory = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const serverLocalHistory = (): HistoryEntry[] => EMPTY;
/** Test hook: forget the in-memory copy so the next read goes back to storage. */
export const resetLocalHistory = () => { local = null; };
