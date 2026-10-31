import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MediaKind = "urban" | "vineyard";
export type MediaItem = { id: string; name: string; size: number; url: string; kind: "image" | "video"; path?: string | undefined };
export const MEDIA_BUCKET = "lab-media";

/** Lab media kept at module level so switching tabs/sections never loses uploaded files. */
const state: Record<MediaKind, MediaItem[]> = { urban: [], vineyard: [] };
const loadedFor: Record<MediaKind, string | null> = { urban: null, vineyard: null };
/** The account files' signed links and when they were made (they last an hour). */
const signedAt = new Map<string, { url: string; at: number }>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const isVideo = (name: string, type?: string) => (type ? type.startsWith("video/") : /\.(mp4|mov|webm|3gp|m4v)$/i.test(name));
export const getMedia = (k: MediaKind) => state[k];
export function setMedia(k: MediaKind, fn: (p: MediaItem[]) => MediaItem[]) { state[k] = fn(state[k]); emit(); }
export function useLabMedia(k: MediaKind) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state[k], () => state[k]);
}

/* ============ File ospite nel database locale del dispositivo (IndexedDB) ============
 * I file degli ospiti restano sul telefono anche se la pagina si ricarica (es. il WebView
 * Android riavvia la pagina al ritorno dalla fotocamera): ogni scheda ha i suoi file. */
const DB_NAME = "micro-digital-twin-lab-media";
const STORE = "guest-files";
type GuestRecord = { key: string; mediaKind: MediaKind; item: { id: string; name: string; size: number; kind: "image" | "video" }; blob: Blob };

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-indexeddb")); return; }
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => { open.result.createObjectStore(STORE, { keyPath: "key" }); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => { resolve(req.result); db.close(); };
      req.onerror = () => { reject(req.error); db.close(); };
    };
  });
}

export async function saveGuestFile(k: MediaKind, file: Blob, item: MediaItem) {
  try {
    const rec: GuestRecord = { key: `${k}:${item.id}`, mediaKind: k, item: { id: item.id, name: item.name, size: item.size, kind: item.kind }, blob: file };
    await withStore("readwrite", (s) => s.put(rec));
  } catch { /* senza IndexedDB i file restano solo in memoria */ }
}

export async function deleteGuestFile(k: MediaKind, id: string) {
  try { await withStore("readwrite", (s) => s.delete(`${k}:${id}`)); } catch { /* ignora */ }
}

/** Deletes these photos and videos for good: from the account's storage when uploaded, from the device otherwise. */
export async function removeMedia(k: MediaKind, items: MediaItem[]) {
  const paths = items.flatMap((i) => (i.path ? [i.path] : []));
  if (paths.length) {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    if (error) throw error;
  }
  for (const i of items) if (!i.path) { URL.revokeObjectURL(i.url); await deleteGuestFile(k, i.id); }
  const gone = new Set(items.map((i) => i.id));
  setMedia(k, (p) => p.filter((x) => !gone.has(x.id)));
}

export async function deleteAllGuestFiles(k: MediaKind) {
  try {
    const recs = await withStore<GuestRecord[]>("readonly", (s) => s.getAll() as IDBRequest<GuestRecord[]>);
    await Promise.all(recs.filter((r) => r.mediaKind === k).map((r) => withStore("readwrite", (s) => s.delete(r.key))));
  } catch { /* ignora */ }
}

async function loadGuestFiles(k: MediaKind): Promise<MediaItem[]> {
  try {
    const recs = await withStore<GuestRecord[]>("readonly", (s) => s.getAll() as IDBRequest<GuestRecord[]>);
    return recs.filter((r) => r.mediaKind === k).map((r) => ({ ...r.item, url: URL.createObjectURL(r.blob) }));
  } catch { return []; }
}

/** Loads account files once per user; guests reload their device-local files. */
export async function ensureMedia(k: MediaKind, userId: string | null) {
  const key = userId ?? "guest";
  if (loadedFor[k] === key) return state[k];
  if (loadedFor[k] !== null) state[k] = [];
  loadedFor[k] = key;
  if (!userId) {
    state[k] = await loadGuestFiles(k);
    emit();
    return state[k];
  }
  const folder = `${userId}/${k}`;
  // The photos and videos taken on this device without signing in stay listed too (they live in its local store),
  // so signing in never hides them.
  const device = await loadGuestFiles(k);
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder, { sortBy: { column: "created_at", order: "desc" } });
  // A failed listing is tried again next time, instead of leaving the account's files missing until a reload.
  if (error) loadedFor[k] = null;
  const files = (data ?? []).filter((f) => f.id);
  let account: MediaItem[] = [];
  if (files.length) {
    const paths = files.map((f) => `${folder}/${f.name}`);
    // A link signed less than 50 minutes ago is kept, so a refresh does not reload pictures or restart a playing video.
    const now = Date.now();
    const fresh = (p: string) => { const l = signedAt.get(p); return l && now - l.at < 50 * 60_000 ? l.url : null; };
    const stale = paths.filter((p) => !fresh(p));
    const { data: signed } = stale.length ? await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(stale, 3600) : { data: [] };
    (signed ?? []).forEach((x, i) => { if (x.signedUrl) signedAt.set(stale[i]!, { url: x.signedUrl, at: now }); });
    account = files.map((f, i) => ({ f, p: paths[i]!, url: fresh(paths[i]!) })).filter((x) => x.url).map(({ f, p, url }) => ({
      id: p, path: p, url: url!, name: f.name.replace(/^\d+-/, ""), size: Number(f.metadata?.size ?? 0),
      kind: isVideo(f.name, f.metadata?.mimetype) ? "video" : "image",
    }));
  }
  state[k] = [...account, ...device];
  emit();
  return state[k];
}

/** Lists the account's files again (another device may have added or removed some, and the signed links last an hour). */
export async function refreshMedia(k: MediaKind) {
  const { data } = await supabase.auth.getSession();
  loadedFor[k] = null;
  return ensureMedia(k, data.session?.user.id ?? null);
}

let syncing = false;
/**
 * Signed in, the photos and videos still kept only on this device (taken before signing in) go up to the account, so
 * every device of that account sees them; each one leaves the device's store once it is safely uploaded, and its
 * archive mark follows it. Returns how many went up.
 */
export async function syncDeviceMedia(userId: string, onStart?: (n: number) => void): Promise<number> {
  if (syncing) return 0;
  syncing = true;
  let moved = 0;
  try {
    const recs = await withStore<GuestRecord[]>("readonly", (s) => s.getAll() as IDBRequest<GuestRecord[]>).catch(() => [] as GuestRecord[]);
    if (!recs.length) return 0;
    onStart?.(recs.length);
    const { moveArchived } = await import("@/models/media-archive");
    for (const r of recs) {
      const at = Number(/^(\d{12,})/.exec(r.item.id)?.[1]) || Date.now();
      const safe = r.item.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${userId}/${r.mediaKind}/${at}-${safe}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, r.blob, { ...(r.blob.type ? { contentType: r.blob.type } : {}), upsert: true });
      if (error) continue;
      await withStore("readwrite", (s) => s.delete(r.key)).catch(() => undefined);
      const flow = r.mediaKind === "urban" ? "piazza" : "vigneto";
      moveArchived(`${flow}-${r.item.id}`, `${flow}-${path}`);
      moved++;
    }
    if (moved) { await refreshMedia("urban"); await refreshMedia("vineyard"); }
    return moved;
  } finally { syncing = false; }
}

export async function currentMedia(k: MediaKind) {
  const { data } = await supabase.auth.getUser();
  return ensureMedia(k, data.user?.id ?? null);
}
