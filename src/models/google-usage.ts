/**
 * The space already used in the user's Google account (Gmail, Drive, Photos together), read at a Google sign-in and
 * counted in the app's 50 GB of cloud space. Kept per user on this device (localStorage mdt-google-usage-v1) as the
 * Google token arrives only with the sign-in; dropped on sign-out. Email/password accounts have none.
 */
export type GoogleUsage = { userId: string; bytes: number; at: string };
const KEY = "mdt-google-usage-v1";
let current: GoogleUsage | null = null;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as GoogleUsage | null; if (v && typeof v.bytes === "number") current = v; } catch { /* none */ }
}
export function getGoogleUsage(): GoogleUsage | null { load(); return current; }
/** Bytes used in the Google account of the signed-in user (0 when unknown or another user). */
export function googleBytesFor(userId: string | null | undefined): number { load(); return userId && current?.userId === userId ? current.bytes : 0; }
export function setGoogleUsage(v: GoogleUsage | null) {
  current = v; loaded = true;
  try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* storage off */ }
  subs.forEach((f) => f());
}
export function subscribeGoogleUsage(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

/** Google Drive's storage quota: `usage` is the whole account's (Gmail, Drive and Photos). */
export async function fetchGoogleUsage(token: string): Promise<number | null> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { storageQuota?: { usage?: string } };
    const n = Number(j.storageQuota?.usage);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; } finally { clearTimeout(t); }
}
/** The scope asked at the Google sign-in to read that quota: only the files the app itself creates, nothing else. */
export const GOOGLE_USAGE_SCOPE = "https://www.googleapis.com/auth/drive.file";
