import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MediaKind = "urban" | "vineyard";
export type MediaItem = { id: string; name: string; size: number; url: string; kind: "image" | "video"; path?: string | undefined };
export const MEDIA_BUCKET = "lab-media";

/** Lab media kept at module level so switching tabs/sections never loses uploaded files. */
const state: Record<MediaKind, MediaItem[]> = { urban: [], vineyard: [] };
const loadedFor: Record<MediaKind, string | null> = { urban: null, vineyard: null };
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
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600);
    account = (signed ?? []).map((s, i) => ({ s, f: files[i]!, p: paths[i]! })).filter((x) => x.s.signedUrl).map(({ s, f, p }) => ({
      id: p, path: p, url: s.signedUrl ?? "", name: f.name.replace(/^\d+-/, ""), size: Number(f.metadata?.size ?? 0),
      kind: isVideo(f.name, f.metadata?.mimetype) ? "video" : "image",
    }));
  }
  state[k] = [...account, ...device];
  emit();
  return state[k];
}

export async function currentMedia(k: MediaKind) {
  const { data } = await supabase.auth.getUser();
  return ensureMedia(k, data.user?.id ?? null);
}
