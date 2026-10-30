import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  ChevronDown,
  FileImage,
  FileVideo,
  ImagePlus,
  Images,
  Send,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { ArCamera } from "@/views/ArCamera";
import { prepareArOrientation } from "@/lib/ar-orientation";
import { useInstalledApp } from "@/lib/installed-app";
import { useDemoSignedIn } from "@/lib/demo-login";
import { registerCaptureHandler, registerFileHandler } from "@/lib/camera-dock";
import { openSystemCamera, prepareSystemCamera, supportsSystemCapture } from "@/lib/system-camera";
import { SystemCamera } from "@/views/SystemCamera";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/views/health";
import { Button } from "@/components/ui/button";
import aiLogo from "@/assets/ai-logo.png";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MEDIA_BUCKET,
  deleteAllGuestFiles,
  deleteGuestFile,
  ensureMedia,
  setMedia,
  useLabMedia,
  type MediaItem,
} from "@/models/lab-media-store";
import { enqueueUploads, useLabUploads } from "@/models/lab-media-uploader";
import { prewarmShare, shareFiles, shareSelectedNow, shareOne, useShareProgress } from "@/models/lab-media-sender";

/** Su Android l'input con selezione multipla apre il gestore file invece della galleria. */
const isAndroid =
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

const fmtSize = (b: number) =>
  b <= 0
    ? ""
    : b < 1024 * 1024
      ? `${Math.max(1, Math.round(b / 1024))} KB`
      : `${(b / 1024 / 1024).toFixed(1)} MB`;


/** Riga con eliminazione a scorrimento stile Gmail: trascini verso sinistra, appare il fondo rosso, oltre la soglia il file viene eliminato. */
function SwipeRow({
  children,
  onDelete,
  disabled,
  delay,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
  delay?: number;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const THRESHOLD = 90;
  const danger = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <li className="lab-media-swipe lab-media-row" style={{ animationDelay: `${delay ?? 0}ms` }}>
      <div className="lab-media-swipe-bg" style={{ opacity: danger }} aria-hidden>
        <Trash2 className="size-4" />
      </div>
      <div
        className={`lab-media-swipe-row ${dragging ? "" : "lab-media-swipe-anim"} ${disabled ? "lab-media-swipe-danger" : ""}`}
        style={{ transform: `translateX(${dx}px)`, "--lab-danger": danger } as React.CSSProperties}
        onTouchStart={(e) => {
          if (!disabled) {
            start.current = e.touches[0]!.clientX;
            setDragging(true);
          }
        }}
        onTouchMove={(e) => {
          if (start.current == null) return;
          const d = e.touches[0]!.clientX - start.current;
          setDx(Math.min(0, d));
        }}
        onTouchEnd={() => {
          if (start.current == null) return;
          start.current = null;
          setDragging(false);
          if (Math.abs(dx) >= THRESHOLD) {
            setDx(-600);
            setTimeout(onDelete, 200);
          } else setDx(0);
        }}
      >
        {children}
      </div>
    </li>
  );
}

/** Foto e video del sopralluogo come pannello a soffietto: l'intestazione apre e chiude caricamento ed elenco. */
/** `embedded`: inside a page section (Fold) that brings its own title, so no own toggle; the cameras
 * then mount on document.body, since a closed section would hide them with it. */
export function LabMedia({ kind, context, embedded = false }: { kind: "urban" | "vineyard"; context?: string; embedded?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const overPage = (node: ReactNode) => (embedded && mounted ? createPortal(node, document.body) : node);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const items = useLabMedia(kind);
  /** Avanzamento dell'invio nella coda condivisa: prosegue anche cambiando scheda o sezione. */
  const progress = useShareProgress(kind);
  const armed = progress?.armed ?? null;
  const sending = progress !== null && !armed;
  /** File e ZIP preparati in anticipo: il tocco su «Invia» apre subito il menu Condividi. */
  useEffect(() => {
    prewarmShare(kind, items);
  }, [kind, items]);
  /** Stato dei caricamenti nella coda condivisa: continua anche cambiando scheda o sezione. */
  const uploads = useLabUploads(kind);
  const busy = uploads.some((u) => u.status === "uploading");
  const [view, setView] = useState<MediaItem | null>(null);
  const [open, setOpen] = useState(true);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  /** Cascata identica al caricamento: ogni riga aspetta più della precedente, come le pillole. */
  const cascade = (index: number) => Math.min(400, index * 60 + index * (index - 1) * 4);
  const gallery = useRef<HTMLInputElement>(null);
  const cameraPhoto = useRef<HTMLInputElement>(null);
  const cameraVideo = useRef<HTMLInputElement>(null);
  const [systemCamera, setSystemCamera] = useState<"photo" | "video" | null>(null);
  const bodyId = `lab-media-body-${kind}`;
  /** Fotocamera di sistema diretta: un input per tipo con capture, perché capture con foto+video insieme non apre nulla su molti Android. */
  const openCamera = (m: "photo" | "video") => {
    if (supportsSystemCapture(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
      pick(m === "photo" ? cameraPhoto.current : cameraVideo.current, m);
    } else {
      // Windows ignores HTML capture: open a real camera, never the gallery.
      void prepareSystemCamera().then(() => setSystemCamera(m));
    }
  };
  /** Apre il selettore di sistema; se l'app (es. un APK che incapsula il sito) lo blocca e non succede nulla, lo segnala invece di restare muto. */
  function pick(el: HTMLInputElement | null, captureMode?: "photo" | "video") {
    if (!el) return;
    let opened = false;
    const mark = () => {
      opened = true;
    };
    window.addEventListener("blur", mark, { once: true });
    document.addEventListener("visibilitychange", mark, { once: true });
    el.addEventListener("change", mark, { once: true });
    el.addEventListener("cancel", mark, { once: true });
    try {
      if (captureMode) openSystemCamera(el, captureMode);
      else if (typeof el.showPicker === "function") el.showPicker();
      else el.click();
    } catch {
      el.click();
    }
    setTimeout(() => {
      window.removeEventListener("blur", mark);
      document.removeEventListener("visibilitychange", mark);
      el.removeEventListener("change", mark);
      el.removeEventListener("cancel", mark);
      if (opened) return;
      toast.error(captureMode ? "Il dispositivo non ha aperto la fotocamera" : "Il dispositivo non ha aperto la galleria", {
        description:
          "Questa versione dell'app non consente l'accesso ai file. Apri il sito nel browser per scattare o caricare foto e video.",
        action: {
          label: "Apri nel browser",
          onClick: () => window.open(window.location.href, "_blank", "noopener"),
        },
        duration: 10000,
      });
    }, 2500);
  }
  /** Solo galleria, mai la fotocamera: usa il selettore file del sistema, dove si scelgono più
   * file insieme; dove non esiste si ripiega sull'input senza capture. */
  async function pickGallery() {
    const picker = (
      window as unknown as {
        showOpenFilePicker?: (options: unknown) => Promise<{ getFile: () => Promise<File> }[]>;
      }
    ).showOpenFilePicker;
    if (picker) {
      try {
        const handles = await picker({
          multiple: true,
          types: [
            {
              description: "Foto e video",
              accept: {
                "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif"],
                "video/*": [".mp4", ".mov", ".webm", ".m4v"],
              },
            },
          ],
        });
        void add(await Promise.all(handles.map((h) => h.getFile())));
        return;
      } catch (e) {
        // "Annulla" nel selettore: nessun file scelto, nessun avviso.
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    pick(gallery.current);
  }
  const [ar, setAr] = useState<"photo" | "video" | null>(null);
  // The AI camera runs only in the installed app, never in a web browser tab
  // (the preview-only simulated sign-in shows it in a tab too, to try the interface).
  const installedApp = useInstalledApp();
  const demo = useDemoSignedIn();
  const aiReady = (Boolean(userId) || demo) && (installedApp || demo);
  // The central camera button of the menu starts captures here, inside the same tap.
  const captureRef = useRef<(action: "ai" | "photo" | "video" | "gallery") => void>(() => undefined);
  captureRef.current = (action) => {
    if (action === "ai") { if (aiReady) void prepareArOrientation().then(() => setAr("photo")); }
    else if (action === "gallery") void pickGallery();
    else openCamera(action);
  };
  useEffect(() => registerCaptureHandler(kind, (action) => captureRef.current(action)), [kind]);
  const addRef = useRef<(files: File[]) => void>(() => undefined);
  addRef.current = (files) => add(files);
  useEffect(() => registerFileHandler(kind, (files) => addRef.current(files)), [kind]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId !== undefined) void ensureMedia(kind, userId);
  }, [userId, kind]);

  /** Quando l'elenco si svuota dopo un'eliminazione (singola o "Elimina tutti"), il pannello si richiude da solo. */
  const justRemoved = useRef(false);
  useEffect(() => {
    if (embedded || !justRemoved.current || items.length > 0 || uploads.length > 0) return;
    justRemoved.current = false;
    const t = setTimeout(() => setOpen(false), 420);
    return () => clearTimeout(t);
  }, [items.length, uploads.length]);

  const active = uploads.filter((u) => u.status === "uploading").length;

  function add(list: FileList | File[] | null, hint?: "image" | "video", share = false) {
    if (!list?.length) return;
    setOpen(true);
    // La coda vive fuori dal pannello: se l'utente cambia scheda, flusso o sezione,
    // il caricamento prosegue e i file appaiono comunque nell'elenco.
    const files = Array.from(list);
    enqueueUploads(kind, files, userId ?? null, hint);
    if (share) void shareSelectedNow(kind, files);
  }

  async function remove(item: MediaItem) {
    justRemoved.current = true;
    setLeaving((p) => new Set(p).add(item.id));
    await new Promise((r) => setTimeout(r, 200));
    if (item.path) await supabase.storage.from(MEDIA_BUCKET).remove([item.path]);
    else { URL.revokeObjectURL(item.url); void deleteGuestFile(kind, item.id); }
    setMedia(kind, (p) => p.filter((x) => x.id !== item.id));
    setLeaving((p) => {
      const n = new Set(p);
      n.delete(item.id);
      return n;
    });
  }

  async function removeAll() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    justRemoved.current = true;
    let total = 0;
    items.forEach((it, i) => {
      const d = reduce ? 0 : cascade(i);
      total = d;
      setTimeout(() => setLeaving((p) => new Set(p).add(it.id)), d);
    });
    await new Promise((r) => setTimeout(r, total + 200));
    const paths = items.flatMap((i) => (i.path ? [i.path] : []));
    if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths);
    items.forEach((i) => {
      if (!i.path) URL.revokeObjectURL(i.url);
    });
    void deleteAllGuestFiles(kind);
    setMedia(kind, () => []);
    setLeaving(new Set());
  }

  const sendFiles = () => void shareFiles(kind, items);
  const sendOne = (it: MediaItem) => void shareOne(kind, it);

  const input = (
    ref: React.RefObject<HTMLInputElement | null>,
    accept: string,
    capture?: "environment",
    multi?: boolean,
  ) => (
    <input
      ref={ref}
      type="file"
      accept={accept}
      capture={capture}
      multiple={multi ?? !capture}
      className="hidden"
      onChange={(e) => {
        void add(
          e.target.files,
          accept === "image/*" ? "image" : accept === "video/*" ? "video" : undefined,
          !capture,
        );
        e.target.value = "";
      }}
    />
  );

  return (
    <Card className={embedded ? "bg-transparent p-0 shadow-none" : "p-4"}>
      {!embedded && (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="lab-media-trigger -m-2 flex w-full items-start justify-between gap-3 rounded-lg p-2 text-left"
      >
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className="lab-media-mark grid size-6 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground"
              aria-hidden
            >
              <Camera className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">
              Foto e video {kind === "urban" ? "della piazza" : "del vigneto"}
            </span>
            {items.length > 0 && (
              <span className="rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {items.length}
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">
            {userId
              ? "Salvati nel tuo account e inclusi nel report. Scegli dalla galleria o usa la fotocamera AI."
              : "Salvati solo su questo dispositivo e inclusi nel report."}
          </span>
          {!open && active > 0 && (
            <span className="mt-1 block text-xs font-medium text-primary">
              Caricamento di {active} {active === 1 ? "file" : "file"}…
            </span>
          )}
        </div>
        <ChevronDown
          className="lab-media-chevron size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
      )}
      {overPage(<>
      <ArCamera
        mode={ar}
        kind={kind}
        context={context}
        onCapture={(f) => void add(f)}
        onClose={() => setAr(null)}
        onFallback={(m) => {
          setAr(null);
          openCamera(m);
        }}
      />
      {input(cameraPhoto, "image/*", "environment")}
      <SystemCamera mode={systemCamera} onCapture={(file) => add([file])} onClose={() => setSystemCamera(null)} />
      {input(cameraVideo, "video/*", "environment")}
      {/* Su Android la selezione multipla apre il gestore file; con un file alla volta si apre
          la galleria di sistema (Google Foto). Altrove resta la scelta multipla. */}
      {input(gallery, "image/*,video/*", undefined, !isAndroid)}
      </>)}
      <div
        id={bodyId}
        className="lab-media-body"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="lab-media-inner">
          <div className="flex flex-col gap-2 pt-3">
            {/* Dicitura corta per non essere mai tagliata: loggato vede l'istruzione, ospite l'avviso salvataggio. */}
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {userId
                ? "\n"
                : "Modalità ospite: i dati non vengono salvati nel cloud."}
            </p>
            <div className={`lab-media-actions flex flex-nowrap gap-2 rounded-full ${embedded ? "!p-0" : "simulation-selector-capsule"}`} role="group" aria-label={`Azioni sui file ${kind === "urban" ? "della piazza" : "del vigneto"}`}>
              {aiReady && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    void prepareArOrientation().then(() => setAr("photo"));
                  }}
                  className="lab-media-action lab-media-ai ai-cta"
                  aria-label="Foto in realtà aumentata"
                >
                  <span className="ai-cta-glow" aria-hidden="true" />
                  {/* The logo already reads "AI": no extra label beside it. */}
                  <img src={aiLogo} alt="" aria-hidden="true" draggable={false} className="size-6 shrink-0 select-none" />
                </Button>
              )}
              <Button
                size="sm"
                disabled={busy}
                className="lab-media-action lab-media-upload-direct"
                aria-label="Carica foto e video dalla galleria"
                onClick={() => void pickGallery()}
              >
                <ImagePlus className="size-4" />
                <span>Carica</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={busy}
                    className="lab-media-action lab-media-upload-menu"
                    aria-label="Carica foto e video: galleria, foto o video"
                  >
                    <ImagePlus className="size-4" />
                    <span>Carica</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void pickGallery()}>
                    <Images className="size-4" />
                    Galleria
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openCamera("photo")}>
                    <Camera className="size-4" />
                    Scatta foto
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openCamera("video")}>
                    <Video className="size-4" />
                    Registra video
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="secondary"
                disabled={armed !== "all" && (busy || sending || items.length === 0)}
                onClick={() => void sendFiles()}
                className="lab-media-action"
                aria-label={`Invia le foto e i video ${kind === "urban" ? "della piazza" : "del vigneto"}`}
              >
                <Send className="size-4" />
                <span>{armed === "all" ? "Condividi" : "Invia"}</span>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || items.length === 0}
                onClick={() => {
                  if (window.confirm(`Eliminare tutti i ${items.length} file?`)) void removeAll();
                }}
                className="lab-media-action"
                aria-label="Elimina tutti i file"
              >
                <Trash2 className="size-4" />
                <span>Elimina</span>
              </Button>
            </div>
            {progress && !armed && (
              <div className="pt-1" role="status" aria-live="polite">
                <p className="mb-1 text-xs text-muted-foreground">
                  Preparazione invio: {progress.done} di {progress.total}…
                </p>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Preparazione invio"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.done}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          {uploads.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label="Caricamenti in corso">
              {uploads.map((u, i) => (
                <li
                  key={u.id}
                  className="lab-media-row rounded-lg border px-3 py-2"
                  style={{ animationDelay: `${cascade(i)}ms` }}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    {u.kind === "video" ? (
                      <FileVideo className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileImage className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    <span
                      className={`shrink-0 font-medium ${u.status === "error" ? "text-destructive" : u.status === "done" ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {u.status === "uploading"
                        ? "Caricamento…"
                        : u.status === "done"
                          ? "Completato"
                          : "Non riuscito"}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`Caricamento ${u.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={u.status === "done" ? 100 : undefined}
                  >
                    <div
                      className={`h-full rounded-full ${u.status === "error" ? "bg-destructive" : "bg-primary"} ${u.status === "uploading" ? "lab-media-uploading" : "w-full transition-[width] duration-500"}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 ? (
            <>
              <ul className="mt-3 divide-y rounded-lg border">
                {items.map((it, i) => (
                  <SwipeRow
                    key={it.id}
                    disabled={leaving.has(it.id)}
                    onDelete={() => void remove(it)}
                    delay={cascade(i)}
                  >
                    <div
                      className={`flex items-center gap-2 px-3 py-2 text-sm ${leaving.has(it.id) ? "lab-media-leaving" : ""}`}
                    >
                      {it.kind === "video" ? (
                        <FileVideo
                          className={`size-4 shrink-0 ${leaving.has(it.id) ? "text-destructive" : "text-muted-foreground"}`}
                        />
                      ) : (
                        <FileImage
                          className={`size-4 shrink-0 ${leaving.has(it.id) ? "text-destructive" : "text-muted-foreground"}`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setView(it)}
                        className={`min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline ${leaving.has(it.id) ? "text-destructive" : ""}`}
                        aria-label={`Rivedi ${it.name}`}
                      >
                        {it.name}
                      </button>
                      <span
                        className={`shrink-0 text-xs ${leaving.has(it.id) ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {it.kind === "video" ? "Video" : "Foto"}
                        {/^(foto|video)-ar-/.test(it.name) && " AR"}
                        {fmtSize(it.size) && ` · ${fmtSize(it.size)}`}
                      </span>
                      <button
                        type="button"
                        aria-label={armed === it.id ? `Condividi ${it.name}` : `Invia ${it.name}`}
                        disabled={sending}
                        onClick={() => void sendOne(it)}
                        className={`grid size-7 shrink-0 place-items-center rounded-full ${armed === it.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"} disabled:opacity-50`}
                      >
                        <Send className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Elimina ${it.name}`}
                        onClick={() => void remove(it)}
                        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </SwipeRow>
                ))}
              </ul>
            </>
          ) : (
            uploads.length === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Nessun file ancora.</p>
            )
          )}
        </div>
      </div>
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="truncate pr-6 text-sm">{view?.name}</DialogTitle>
          {view &&
            (view.kind === "video" ? (
              <video
                src={view.url}
                controls
                autoPlay
                playsInline
                className="max-h-[70vh] w-full rounded-lg bg-muted"
              />
            ) : (
              <img
                src={view.url}
                alt={view.name}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
            ))}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
