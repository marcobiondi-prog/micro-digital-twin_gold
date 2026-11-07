/**
 * Signed links to the account's files kept on this device, so the same photo, video or account picture keeps the same
 * address for days: the browser then serves it from its own cache instead of downloading it again (a new link, made
 * every hour before, looked like a new file and was downloaded whole each time — the traffic Supabase counts).
 * Links are signed for 7 days (LINK_TTL_S) and reused while younger than 6 (REUSE_MS); kept in localStorage
 * mdt-signed-v1, at most 3000, the oldest dropped first.
 */
const KEY = "mdt-signed-v1";
export const LINK_TTL_S = 7 * 24 * 3600;
const REUSE_MS = 6 * 24 * 3600_000;
const MAX = 3000;
type Entry = { url: string; at: number };
let mem: Record<string, Entry> | null = null;

const load = (): Record<string, Entry> => {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>; } catch { mem = {}; }
  return mem;
};
let timer: ReturnType<typeof setTimeout> | undefined;
const save = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const all = load();
    const keys = Object.keys(all);
    if (keys.length > MAX) for (const k of keys.sort((a, b) => all[a]!.at - all[b]!.at).slice(0, keys.length - MAX)) delete all[k];
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* memory only */ }
  }, 300);
};

/** The kept link of a file, when it is still young enough to reuse. */
export function keptLink(bucket: string, path: string, now = Date.now()): string | null {
  const e = load()[`${bucket}/${path}`];
  return e && now - e.at < REUSE_MS ? e.url : null;
}
export function keepLink(bucket: string, path: string, url: string, now = Date.now()) {
  load()[`${bucket}/${path}`] = { url, at: now };
  save();
}
export function dropLink(bucket: string, path: string) {
  delete load()[`${bucket}/${path}`];
  save();
}
