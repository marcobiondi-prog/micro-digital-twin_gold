import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { MEDIA_BUCKET, type MediaItem, type MediaKind } from "@/models/lab-media-store";

/** done/total: preparazione in corso dopo un tocco. armed: file pronti, il browser chiede un
 * nuovo tocco ("all" = invio multiplo, altrimenti l'id del file singolo). */
export type ShareProgress = { done: number; total: number; armed?: string } | null;

/** Preparazione a livello di modulo e in anticipo: i file (e lo ZIP) vengono preparati in
 * background appena l'elenco cambia, così il tocco su «Invia» apre subito il menu
 * «Condividi» di sistema, senza avvisi intermedi dell'app. */
const state: Record<MediaKind, ShareProgress> = { urban: null, vineyard: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const getShareProgress = (k: MediaKind) => state[k];

export function useShareProgress(k: MediaKind) {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state[k],
    () => state[k],
  );
}

const setProgress = (kind: MediaKind, p: ShareProgress) => {
  state[kind] = p;
  emit();
};

type Nav = Navigator & { canShare?: (d: ShareData) => boolean };
const nav = () => navigator as Nav;

/** Oltre questa soglia i file vengono raggruppati in un unico archivio ZIP (invio multiplo). */
export const ZIP_THRESHOLD = 1;

/** Nomi univoci: un nome duplicato sovrascriverebbe la voce precedente nello ZIP. */
export function zipEntryNames(names: string[]) {
  return names.map((n, i) => `${String(i + 1).padStart(3, "0")}-${n}`);
}

/** Chiave dell'elenco: cambia se si aggiunge, rimuove o rinnova un file. */
export function shareKey(items: Pick<MediaItem, "id" | "url">[]) {
  return items.map((i) => `${i.id}@${i.url}`).join("|");
}

/* ---------------- File pronti (cache per id) ---------------- */
const fileReady = new Map<string, File>();
const fileLoading = new Map<string, Promise<File>>();

function loadFile(it: MediaItem): Promise<File> {
  const k = `${it.id}@${it.url}`;
  const ready = fileReady.get(k);
  if (ready) return Promise.resolve(ready);
  let p = fileLoading.get(k);
  if (!p) {
    p = fetch(it.url)
      .then((r) => r.blob())
      .then((blob) => {
        const f = new File([blob], it.name, {
          type: blob.type || (it.kind === "video" ? "video/mp4" : "image/jpeg"),
        });
        fileReady.set(k, f);
        return f;
      })
      .finally(() => fileLoading.delete(k));
    fileLoading.set(k, p);
  }
  return p;
}

async function buildZip(files: File[], name: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = zipEntryNames(files.map((f) => f.name));
  files.forEach((f, i) => zip.file(names[i] ?? f.name, f));
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return new File([blob], name, { type: "application/zip" });
}

/* ---------------- Invio multiplo preparato ---------------- */
type Prepared = { data: ShareData | null; zip: File; zipName: string };
type Prep = { key: string; promise: Promise<Prepared>; result?: Prepared; done: number; total: number };
const prep: Record<MediaKind, Prep | null> = { urban: null, vineyard: null };
const lastUpload: Record<MediaKind, string | null> = { urban: null, vineyard: null };
const waiting: Record<MediaKind, boolean> = { urban: false, vineyard: false };

/** ZIP nello spazio privato dell'utente con link valido 7 giorni: Chrome Android non accetta
 * allegati .zip nel pannello di condivisione, il link sì. */
async function uploadZipLink(zip: File, kind: MediaKind) {
  return uploadLink(zip, kind);
}

/** Carica un file qualsiasi nello spazio privato e restituisce un link scaricabile per 7 giorni. */
async function uploadLink(zip: File, kind: MediaKind) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const safe = zip.name.replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${data.user.id}/shares/${Date.now()}-${kind}-${safe}`;
    const up = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, zip, { contentType: zip.type || "application/octet-stream" });
    if (up.error) return null;
    const old = lastUpload[kind];
    lastUpload[kind] = path;
    if (old) void supabase.storage.from(MEDIA_BUCKET).remove([old]);
    const { data: s } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, 7 * 24 * 3600, { download: zip.name });
    return s?.signedUrl ?? null;
  } catch {
    return null;
  }
}

function startPrep(kind: MediaKind, items: MediaItem[]): Prep {
  const key = shareKey(items);
  const cur = prep[kind];
  if (cur && cur.key === key) return cur;
  const p: Prep = { key, done: 0, total: items.length, promise: Promise.resolve(null as unknown as Prepared) };
  const title = kind === "urban" ? "Foto e video della piazza" : "Foto e video del vigneto";
  const text = `${title}: ${items.length} file del sopralluogo.`;
  const zipName = kind === "urban" ? "rilievo-piazza.zip" : "rilievo-vigneto.zip";
  p.promise = (async () => {
    const files: File[] = [];
    for (const it of items) {
      files.push(await loadFile(it));
      p.done = files.length;
      if (waiting[kind] && prep[kind] === p) setProgress(kind, { done: p.done, total: p.total });
    }
    const zip = await buildZip(files, zipName);
    const n = nav();
    let data: ShareData | null = null;
    const generic = new File([zip], zipName, { type: "application/octet-stream" });
    const shareableZip = [zip, generic].find((x) => n.canShare?.({ files: [x] }));
    if (shareableZip) data = { files: [shareableZip], title, text };
    else if (typeof n.share === "function") {
      const url = await uploadZipLink(zip, kind);
      if (url) data = { title, text: `${text}\nArchivio ZIP: ${url}`, url };
      else if (n.canShare?.({ files })) data = { files, title, text };
    }
    const result = { data, zip, zipName };
    p.result = result;
    return result;
  })();
  p.promise.catch(() => {
    if (prep[kind] === p) prep[kind] = null;
  });
  prep[kind] = p;
  return p;
}

const timers: Record<MediaKind, ReturnType<typeof setTimeout> | null> = { urban: null, vineyard: null };

/** Chiamata quando l'elenco cambia: prepara file e ZIP in background (con breve attesa
 * per non ripartire a ogni file aggiunto in serie). */
export function prewarmShare(kind: MediaKind, items: MediaItem[]) {
  if (typeof window === "undefined") return;
  if (timers[kind]) clearTimeout(timers[kind]!);
  if (!items.length) {
    prep[kind] = null;
    return;
  }
  timers[kind] = setTimeout(() => {
    timers[kind] = null;
    if (items.length > ZIP_THRESHOLD) startPrep(kind, items);
    else items.forEach((it) => void loadFile(it).catch(() => undefined));
  }, 1200);
}

/** App Android installata come WebView: niente condivisione web, si passa al sistema. */
export function isAndroidWebView(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  return /Android/i.test(ua) && (/; wv\)/.test(ua) || /Version\/[\d.]+ Chrome\//.test(ua));
}

/** Intent Android «Condividi»: apre il selettore di sistema (Gmail, WhatsApp, File…) con il testo. */
export function androidShareIntent(text: string, subject: string) {
  return (
    "intent:#Intent;action=android.intent.action.SEND;type=text/plain;" +
    `S.android.intent.extra.TEXT=${encodeURIComponent(text)};` +
    `S.android.intent.extra.SUBJECT=${encodeURIComponent(subject)};end`
  );
}

type Bridges = {
  median?: { share?: { sharePage?: (o: { url?: string; text?: string }) => void } };
  gonative?: { share?: { sharePage?: (o: { url?: string; text?: string }) => void } };
  Capacitor?: { Plugins?: { Share?: { share: (o: { title?: string; text?: string; url?: string }) => Promise<unknown> } } };
  Android?: { share?: (text: string) => void };
};

/** Menu «Condividi» di sistema dall'app installata: ponti nativi noti, altrimenti intent Android. */
function systemShareLink(title: string, text: string, url: string) {
  const w = window as unknown as Bridges;
  const full = `${text}\n${url}`;
  try {
    if (w.Capacitor?.Plugins?.Share) return void w.Capacitor.Plugins.Share.share({ title, text, url });
    const m = w.median?.share?.sharePage ?? w.gonative?.share?.sharePage;
    if (m) return void m({ url, text: full });
    if (w.Android?.share) return void w.Android.share(full);
  } catch {
    /* si prova con l'intent */
  }
  const a = document.createElement("a");
  a.href = androidShareIntent(full, title);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Ripiego quando il browser non apre il menu: nell'app installata si condivide un link al file
 * (o allo ZIP) tramite il selettore di Android; altrove si salva il file. */
function deliver(kind: MediaKind, file: File, title: string, text: string) {
  const noWebShare = typeof nav().share !== "function";
  if (!noWebShare && !isAndroidWebView()) {
    setProgress(kind, null);
    return downloadBlob(file, file.name);
  }
  setProgress(kind, { done: 0, total: 1 });
  void uploadLink(file, kind).then((url) => {
    setProgress(kind, null);
    if (url) systemShareLink(title, text, url);
    else downloadBlob(file, file.name);
  });
}

/** Testo dell'avviso di download: foto, video o archivio ZIP. */
export function downloadNotice(blob: Blob, filename: string) {
  const type = blob.type || "";
  if (type === "application/zip" || /\.zip$/i.test(filename))
    return { running: "Download archivio in corso…", done: "Archivio salvato sul dispositivo" };
  if (type.startsWith("video")) return { running: "Download video in corso…", done: "Video salvato sul dispositivo" };
  return { running: "Download foto in corso…", done: "Foto salvata sul dispositivo" };
}

const DOWNLOAD_TOAST = "lab-media-download";

/** Salvataggio sul dispositivo: avvisa subito che il download è partito, poi conferma l'avvenuto salvataggio. */
export function downloadBlob(blob: Blob, filename: string) {
  const notice = downloadNotice(blob, filename);
  toast.loading(notice.running, { id: DOWNLOAD_TOAST, description: filename });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => toast.success(notice.done, { id: DOWNLOAD_TOAST, description: filename, duration: 3200 }), 900);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Condivisione già pronta in attesa di un nuovo tocco: il pulsante «Condividi» la riusa
 * così com'è, senza ripreparare nulla (il tocco resta "fresco" per il browser). */
const armedShare: Record<MediaKind, { id: string; data: ShareData; fallback: () => void } | null> = {
  urban: null,
  vineyard: null,
};

/** In un riquadro incorporato (es. anteprima) il browser può vietare del tutto la condivisione. */
function shareBlockedByPolicy() {
  try {
    if (window.self === window.top) return false;
    const fp = (document as Document & { featurePolicy?: { allowsFeature: (f: string) => boolean } }).featurePolicy;
    return fp ? !fp.allowsFeature("web-share") : false;
  } catch {
    return false;
  }
}

/** Apre direttamente il menu «Condividi» di sistema. Se il browser lo nega perché il tocco è
 * troppo lontano (preparazione lunga), il pulsante stesso diventa «Condividi»: nessun avviso.
 * Se lo nega anche con un tocco appena fatto, si salva il file sul dispositivo. */
function openSheet(kind: MediaKind, data: ShareData, armedId: string, fallback: () => void, fresh = false) {
  const n = nav();
  armedShare[kind] = null;
  if (typeof n.share !== "function" || shareBlockedByPolicy()) {
    setProgress(kind, null);
    return fallback();
  }
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  const hadActivation = ua ? ua.isActive : fresh;
  setProgress(kind, null);
  let p: Promise<void>;
  try {
    p = n.share(data);
  } catch {
    return fallback();
  }
  p.catch((e) => {
    const name = (e as DOMException)?.name;
    if (name === "AbortError") return;
    if (name === "NotAllowedError" && !hadActivation) {
      armedShare[kind] = { id: armedId, data, fallback };
      setProgress(kind, { done: 1, total: 1, armed: armedId });
    } else fallback();
  });
}

/** Secondo tocco su «Condividi»: riapre subito il menu con i dati già pronti. */
export function retryArmedShare(kind: MediaKind, id: string) {
  const a = armedShare[kind];
  if (!a || a.id !== id) return false;
  openSheet(kind, a.data, a.id, a.fallback, true);
  return true;
}

/** Invio multiplo: tutti i file in un unico ZIP nel menu «Condividi» di sistema. */
export function shareFiles(kind: MediaKind, items: MediaItem[]) {
  if (!items.length) return;
  const cur = state[kind];
  if (cur?.armed === "all" && retryArmedShare(kind, "all")) return;
  if (items.length <= ZIP_THRESHOLD) return shareOne(kind, items[0]!);
  if (cur && !cur.armed) return;
  const p = startPrep(kind, items);
  const go = (r: Prepared) => {
    const title = kind === "urban" ? "Foto e video della piazza" : "Foto e video del vigneto";
    const download = () => deliver(kind, r.zip, title, `${title}: ${items.length} file del sopralluogo.`);
    if (r.data && !isAndroidWebView()) openSheet(kind, r.data, "all", download);
    else download();
  };
  // Già pronto: condivisione sincrona nel tocco, il browser apre subito il menu.
  if (p.result) return go(p.result);
  waiting[kind] = true;
  setProgress(kind, { done: p.done, total: p.total });
  p.promise
    .then((r) => {
      if (prep[kind] === p) go(r);
    })
    .catch(() => setProgress(kind, null))
    .finally(() => {
      waiting[kind] = false;
    });
}

/** Invio singolo: il file originale, senza ZIP, nel menu «Condividi» di sistema. */
export function shareOne(kind: MediaKind, it: MediaItem) {
  const cur = state[kind];
  if (cur?.armed === it.id && retryArmedShare(kind, it.id)) return;
  if (cur && !cur.armed) return;
  const go = (file: File) => {
    const download = () => deliver(kind, file, it.name, it.name);
    if (!isAndroidWebView() && nav().canShare?.({ files: [file] })) openSheet(kind, { files: [file], title: it.name }, it.id, download);
    else download();
  };
  const ready = fileReady.get(`${it.id}@${it.url}`);
  if (ready) return go(ready);
  setProgress(kind, { done: 0, total: 1 });
  loadFile(it)
    .then(go)
    .catch(() => setProgress(kind, null));
}

/** Dopo «Carica»: condivide subito i file appena scelti (ZIP se più d'uno, originale se uno),
 * senza attendere il caricamento. Se il browser nega il menu, il pulsante diventa «Condividi». */
export async function shareSelectedNow(kind: MediaKind, list: File[]) {
  if (!list.length || typeof window === "undefined") return;
  const title = kind === "urban" ? "Foto e video della piazza" : "Foto e video del vigneto";
  const n = nav();
  if (list.length === 1) {
    const f = list[0]!;
    if (!isAndroidWebView() && n.canShare?.({ files: [f] }))
      openSheet(kind, { files: [f], title: f.name }, "all", () => deliver(kind, f, f.name, f.name));
    else deliver(kind, f, f.name, f.name);
    return;
  }
  const zipName = kind === "urban" ? "rilievo-piazza.zip" : "rilievo-vigneto.zip";
  setProgress(kind, { done: 0, total: list.length });
  try {
    const zip = await buildZip(list, zipName);
    if (isAndroidWebView()) return deliver(kind, zip, title, `${title}: ${list.length} file del sopralluogo.`);
    const generic = new File([zip], zipName, { type: "application/octet-stream" });
    const shareable = [zip, generic].find((x) => n.canShare?.({ files: [x] }));
    const text = `${title}: ${list.length} file del sopralluogo.`;
    let data: ShareData | null = shareable ? { files: [shareable], title, text } : null;
    if (!data && typeof n.share === "function") {
      const url = await uploadZipLink(zip, kind);
      if (url) data = { title, text: `${text}\nArchivio ZIP: ${url}`, url };
    }
    const text2 = `${title}: ${list.length} file del sopralluogo.`;
    if (data) openSheet(kind, data, "all", () => deliver(kind, zip, title, text2));
    else deliver(kind, zip, title, text2);
  } catch {
    setProgress(kind, null);
  }
}
