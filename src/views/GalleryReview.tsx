import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Images, Play, Plus, RotateCw, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLabUploads } from "@/models/lab-media-uploader";
import { cn } from "@/lib/utils";

type Kind = "urban" | "vineyard";
const SHEET = "gap-4 p-5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2 sm:w-[min(460px,calc(100vw-1.5rem))] sm:rounded-2xl";
const isVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|webm|3gp|m4v|mkv)$/i.test(f.name);
const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** One chosen photo or video: its preview (a video's first frame and length), a ✕ to drop it. */
function Thumb({ file, onRemove }: { file: File; onRemove?: () => void }) {
  // Made and revoked in the same effect, so a remount (StrictMode) never leaves a revoked address behind.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  const [len, setLen] = useState<number | null>(null);
  const video = isVideo(file);
  return (
    <div className="relative size-[5.75rem] shrink-0 overflow-hidden rounded-2xl bg-muted">
      {!url ? null : video
        ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" onLoadedMetadata={(e) => setLen(e.currentTarget.duration)} className="h-full w-full object-cover" />
        : <img src={url} alt="" className="h-full w-full object-cover" />}
      {video && <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold text-white"><Play className="size-3 fill-current" aria-hidden="true" />{len && Number.isFinite(len) ? duration(len) : "Video"}</span>}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Togli ${file.name}`} className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/65 text-white outline-none focus-visible:ring-2 focus-visible:ring-white"><X className="size-3.5" aria-hidden="true" /></button>}
    </div>
  );
}

/**
 * Photos and videos chosen from the gallery, in a sheet rising from the bottom like the camera's: a strip of previews
 * to drop or add to, the zone they were taken in (optional, the zones drawn on the map), then "Aggiungi alla piazza /
 * al vigneto". The same sheet then shows the upload ("Carico 2 di 4", a ring on each preview); closed while it runs,
 * a pill above the bottom bar keeps counting and reopens it; at the end the queue's own toast says how many went in.
 */
export function GalleryReview({ kind, files, zones, onAddMore, onConfirm, onClose }: {
  kind: Kind; files: File[] | null; zones: string[];
  onAddMore: () => void; onConfirm: (files: File[], zone: string | null) => void; onClose: () => void;
}) {
  const [chosen, setChosen] = useState<File[]>([]);
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => { if (files) setChosen(files); }, [files]);
  // The upload being followed: its rows in the shared queue (ids that were not there before).
  const uploads = useLabUploads(kind);
  const [batch, setBatch] = useState<{ before: Set<string>; files: File[] } | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const rows = batch ? uploads.filter((u) => !batch.before.has(u.id)) : [];
  const done = rows.filter((u) => u.status === "done").length;
  const failed = rows.filter((u) => u.status === "error").length;
  const running = rows.some((u) => u.status === "uploading");
  const place = kind === "urban" ? "piazza" : "vigneto";
  const whole = kind === "urban" ? "Tutta la piazza" : "Tutto il vigneto";
  const told = useRef(false);
  useEffect(() => {
    if (!batch || running || !rows.length || told.current) return;
    told.current = true;
    if (!failed) { setShowProgress(false); setBatch(null); }
  }, [batch, running, rows.length, done, failed, kind]);

  const confirm = () => {
    if (!chosen.length) return;
    told.current = false;
    setBatch({ before: new Set(uploads.map((u) => u.id)), files: chosen });
    setShowProgress(true);
    onConfirm(chosen, zone);
    setZone(null);
  };
  const reviewing = files !== null && !showProgress;
  const open = reviewing || (showProgress && !!batch);
  const close = () => { if (showProgress) setShowProgress(false); else onClose(); };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className={SHEET}>
          <span className="mx-auto -mt-1 h-1.5 w-10 rounded-full bg-foreground/20 sm:hidden" aria-hidden="true" />
          {reviewing ? (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-full bg-ok text-white"><Images className="size-4" aria-hidden="true" /></span>
                  {chosen.length === 1 ? "1 dalla galleria" : `${chosen.length} dalla galleria`}
                </DialogTitle>
                <DialogDescription>{kind === "urban" ? "Per la tua piazza" : "Per il tuo vigneto"}</DialogDescription>
              </DialogHeader>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 touch-pan-x" data-map-gestures="">
                {chosen.map((f, i) => <Thumb key={`${f.name}-${f.size}-${i}`} file={f} onRemove={() => setChosen((c) => c.filter((_, j) => j !== i))} />)}
                <button type="button" onClick={onAddMore} aria-label="Aggiungi altre foto o video"
                  className="grid size-[5.75rem] shrink-0 place-items-center rounded-2xl border-2 border-dashed border-foreground/25 text-foreground/60 outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="size-7" aria-hidden="true" /></button>
              </div>
              {zones.length > 0 && (
                <div>
                  <div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground"><span>Dove l'hai scattata?</span><span>facoltativo</span></div>
                  <div role="radiogroup" aria-label="Zona" className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 touch-pan-x" data-map-gestures="">
                    {[null, ...zones].map((z) => (
                      <button key={z ?? "tutta"} type="button" role="radio" aria-checked={zone === z} onClick={() => setZone(z)}
                        className={cn("h-10 shrink-0 rounded-full px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", zone === z ? "bg-secondary text-secondary-foreground ring-2 ring-foreground" : "bg-foreground/[0.07] text-foreground/85")}>{z ?? whole}</button>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" onClick={confirm} disabled={!chosen.length}
                className="h-12 rounded-full bg-foreground text-[15px] font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                {chosen.length ? `Aggiungi ${chosen.length === 1 ? "" : `${chosen.length} `}${kind === "urban" ? "alla piazza" : "al vigneto"}` : "Nessun file scelto"}
              </button>
            </>
          ) : batch && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-full bg-ok text-white"><Images className="size-4" aria-hidden="true" /></span>
                  {running ? `Carico ${Math.min(done + 1, rows.length)} di ${rows.length}` : failed ? `${failed === 1 ? "1 file non caricato" : `${failed} file non caricati`}` : "Fatto"}
                </DialogTitle>
                <DialogDescription>{running ? "Puoi chiudere: continua da solo e ti avvisiamo quando ha finito." : failed ? "Controlla la connessione e riprova dalla galleria." : `Tutto nel ${place}.`}</DialogDescription>
              </DialogHeader>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}>
                <div className="h-full rounded-full bg-brand-turquoise transition-[width] duration-300" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} />
              </div>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 touch-pan-x" data-map-gestures="">
                {batch.files.map((f, i) => {
                  const st = rows[i]?.status ?? "uploading";
                  return (
                    <div key={i} className="relative">
                      <Thumb file={f} />
                      <span className={cn("absolute inset-0 grid place-items-center rounded-2xl", st === "done" ? "" : "bg-black/45")}>
                        {st === "done" ? <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-brand-turquoise text-black"><Check className="size-4" strokeWidth={3} aria-hidden="true" /></span>
                          : st === "error" ? <RotateCw className="size-6 text-white" aria-label="Non caricato" />
                          : <span className="size-9 animate-spin rounded-full border-[3px] border-white/25 border-t-brand-turquoise motion-reduce:animate-none" aria-label="In caricamento" />}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={running ? () => setShowProgress(false) : () => { setShowProgress(false); setBatch(null); }}
                className="h-12 rounded-full bg-foreground/10 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">{running ? "Continua in sottofondo" : "Chiudi"}</button>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Closed while uploading: a pill above the bottom bar keeps counting and reopens the sheet. */}
      {batch && running && !showProgress && typeof document !== "undefined" && createPortal(
        <button type="button" onClick={() => setShowProgress(true)}
          className="fixed bottom-[calc(7.75rem+env(safe-area-inset-bottom))] left-1/2 z-[60] inline-flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-foreground/15 bg-card py-2 pl-2 pr-4 text-sm font-bold text-foreground shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6">
          <span className="size-7 rounded-full" style={{ background: `conic-gradient(var(--brand-turquoise) 0 ${(done / Math.max(1, rows.length)) * 100}%, rgb(255 255 255 / 0.2) 0)`, WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))", mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))" }} aria-hidden="true" />
          Carico {Math.min(done + 1, rows.length)} di {rows.length} · {kind === "urban" ? "Piazza" : "Vigneto"}
        </button>,
        document.body,
      )}
    </>
  );
}
