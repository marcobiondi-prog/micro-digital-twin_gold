import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronRight, Copy, Download, FileText, Images, Mail, Map as MapIcon, Printer, Share2, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { MediaItem } from "@/models/lab-media-store";
import { hapticTick } from "@/lib/haptics";
import { isAndroidWebView, systemShareLink, uploadLink } from "@/models/lab-media-sender";
import { cn } from "@/lib/utils";

/** The camera's and the gallery's bottom sheet: rises from the bottom on phones, a centred dialog from sm up. */
const SHEET = "!flex flex-col gap-0 border-foreground/20 bg-card dark:bg-[oklch(0.25_0.016_258)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_-24px_60px_rgb(0_0_0/0.6)] p-5 pt-3 max-h-[92dvh] overflow-hidden max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2 sm:w-[min(460px,calc(100vw-1.5rem))] sm:rounded-2xl";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const MIME: Record<string, string> = {
  pdf: "application/pdf", csv: "text/csv", txt: "text/plain", geojson: "application/geo+json", zip: "application/zip",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", "3gp": "video/3gpp",
};

export type ExportFile = { name: string; blob: Blob };
type Kind = "report" | "table" | "map" | "media" | "text";
type Dest = "email" | "share" | "save";
type Step = "cosa" | "foto" | "dove" | "prep" | "fatto";

/** "1,1 MB", "4 kB". */
function sizeText(bytes: number): string {
  if (bytes < 1000) return `${Math.max(1, Math.round(bytes / 100) / 10).toLocaleString("it-IT")} kB`;
  if (bytes < 1e6) return `${Math.round(bytes / 1000)} kB`;
  return `${(bytes / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}
/** How heavy a photo is once made lighter: at most 1600 px a side in JPEG, about this much. */
const LIGHT_PHOTO = 450_000;
const lightSize = (m: MediaItem) => (m.kind === "image" ? Math.min(m.size || LIGHT_PHOTO, LIGHT_PHOTO) : m.size);
/** The zone a gallery photo was tagged with ("Lotto A - foto.jpg" → "Lotto A"). */
const zoneOfName = (name: string) => { const m = /^(.{1,24}?) - /.exec(name); return m ? m[1]! : null; };

async function lighten(m: MediaItem): Promise<Blob> {
  const blob = await (await fetch(m.url)).blob();
  if (m.kind !== "image") return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.8));
    return out && out.size < blob.size ? out : blob;
  } catch { return blob; }
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flow: "piazza" | "vigneto";
  place: string;
  author: string;
  media: MediaItem[];
  /** The report's own progress while it is drawn (shared with the PDF builder). */
  progress: { label: string; pct: number } | null;
  /** The report as a PDF, dark like the app or light for paper. */
  report: (light: boolean) => Promise<Blob>;
  table: () => string;
  map: () => string;
  text: string;
  /** Print the report (light pages): the preview with its Stampa button. */
  onPrint: () => void;
  /** Open the report in the in-app preview. */
  onOpenReport: () => void;
};

/**
 * "Esporta report" in steps, on the camera's bottom sheet: which files (switches, with their weight), which photos
 * and videos, where they go (email, share, save), then the files are prepared and one tap sends them. A sideways
 * swipe moves between the steps like the tutorial's screens.
 */
export function ExportSheet({ open, onOpenChange, flow, place, author, media, progress, report, table, map, text, onPrint, onOpenReport }: Props) {
  const piazza = flow === "piazza";
  const [on, setOn] = useState<Record<Kind, boolean>>({ report: true, table: false, map: false, media: media.length > 0, text: false });
  const [light, setLight] = useState(false);
  const [lighter, setLighter] = useState(true);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [step, setStep] = useState<Step>("cosa");
  const [dest, setDest] = useState<Dest | null>(null);
  const [job, setJob] = useState<{ files: ExportFile[]; done: boolean; mediaDone: number; error?: boolean } | null>(null);
  const [reportSize, setReportSize] = useState<number | null>(null);
  // Sent once with the main button: the pill goes away and the next open starts again.
  const [sent, setSent] = useState(false);
  const runId = useRef(0);

  const chosen = useMemo(() => media.filter((m) => !picked || picked.has(m.id)), [media, picked]);
  const sizes = useMemo(() => (open ? { table: new Blob([table()]).size, map: new Blob([map()]).size } : { table: 0, map: 0 }), [open, table, map]);
  const mediaBytes = chosen.reduce((s, m) => s + (lighter ? lightSize(m) : m.size), 0);
  const fullMediaBytes = chosen.reduce((s, m) => s + m.size, 0);
  const sendMedia = on.media && chosen.length > 0;
  const fileCount = (on.report ? 1 : 0) + (on.table ? 1 : 0) + (on.map ? 1 : 0);
  const total = (on.report ? reportSize ?? 0 : 0) + (on.table ? sizes.table : 0) + (on.map ? sizes.map : 0) + (sendMedia ? mediaBytes : 0);
  const nothing = !fileCount && !sendMedia && !on.text;

  // The report's weight, as soon as it is drawn (it starts when the sheet opens).
  useEffect(() => {
    if (!open || reportSize !== null) return;
    let live = true;
    report(light).then((b) => { if (live) setReportSize(b.size); }, () => {});
    return () => { live = false; };
  }, [open, light, report, reportSize]);
  useEffect(() => { setReportSize(null); }, [light]);
  // A fresh open starts again, unless a job is still being prepared or waits to be sent.
  useEffect(() => {
    if (!open || (job && !sent)) return;
    runId.current++;
    setJob(null); setSent(false); setNote(""); setStep("cosa"); setDest(null); setPicked(null);
    setOn((o) => ({ ...o, media: media.length > 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const swipeSteps: Step[] = [...(["cosa"] as Step[]), ...(on.media && media.length ? (["foto"] as Step[]) : []), "dove"];
  const bars: Step[] = [...swipeSteps, "fatto"];
  const barIndex = step === "prep" ? bars.length - 1 : bars.indexOf(step);

  // The slide between steps: the new step comes in from the side it was swiped or chosen towards.
  const track = useRef<HTMLDivElement>(null);
  const enterFrom = useRef<number | null>(null);
  const go = (next: Step, side: 1 | -1 = 1, from?: number) => {
    if (next === step) return;
    const w = track.current?.offsetWidth ?? 360;
    enterFrom.current = reduced() ? null : from !== undefined ? from + side * w : side * Math.min(w, 120);
    hapticTick(8);
    setStep(next);
  };
  useLayoutEffect(() => {
    const el = track.current, from = enterFrom.current;
    if (!el) return;
    enterFrom.current = null;
    if (from === null) { el.style.transform = ""; el.style.transition = ""; el.style.opacity = ""; return; }
    el.style.transition = "none"; el.style.transform = `translate3d(${from}px,0,0)`; el.style.opacity = "0.4";
    void el.offsetWidth;
    const ms = Math.round(180 + Math.min(1, Math.abs(from) / 400) * 200);
    el.style.transition = `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}`; el.style.transform = "translate3d(0,0,0)"; el.style.opacity = "1";
    const t = setTimeout(() => { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; }, ms + 30);
    return () => clearTimeout(t);
  }, [step]);

  // Sideways swipe on the sheet: the step follows the finger, past 50 px (or a flick) it turns.
  const drag = useRef<{ id: number; x: number; y: number; t: number; axis: "x" | "y" | null; dx: number } | null>(null);
  const canSwipe = step !== "prep";
  const neighbour = (dir: 1 | -1): Step | null => {
    const i = swipeSteps.indexOf(step);
    if (i < 0) return null;
    const n = swipeSteps[i + dir];
    if (!n || (n === "dove" && nothing)) return null;
    return n;
  };
  const onDown = (e: React.PointerEvent) => {
    if (!canSwipe || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as Element).closest("input, [role='slider'], [data-map-gestures]")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, dx: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, el = track.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.hypot(dx, dy) < (e.pointerType === "mouse" ? 4 : 8)) return;
      d.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (d.axis === "y") { drag.current = null; return; }
      try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    }
    d.dx = dx;
    // Only a little give where there is no step that way.
    const free = neighbour(dx < 0 ? 1 : -1) !== null;
    const x = free ? dx : Math.sign(dx) * Math.min(80, Math.abs(dx) * 0.3);
    el.style.transition = "none"; el.style.transform = `translate3d(${x}px,0,0)`;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current, el = track.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.axis !== "x" || !el) return;
    const speed = Math.abs(d.dx) / Math.max(1, performance.now() - d.t);
    const dir: 1 | -1 = d.dx < 0 ? 1 : -1;
    const next = neighbour(dir);
    if (next && (Math.abs(d.dx) > 50 || (speed > 0.45 && Math.abs(d.dx) > 16))) { go(next, dir, d.dx); return; }
    el.style.transition = `transform 260ms ${EASE}`; el.style.transform = "translate3d(0,0,0)";
    setTimeout(() => { el.style.transition = ""; el.style.transform = ""; }, 280);
  };

  const day = new Date().toISOString().slice(0, 10);
  const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || flow;
  const placeName = (place.split(/[,·]/)[0] ?? place).trim();
  const placeSlug = slug(placeName);
  const base = placeSlug.startsWith(flow) ? placeSlug : `${flow}-${placeSlug}`;

  /** Prepare every chosen file; the send itself waits for a tap (the phone's share needs a fresh one). */
  const prepare = async (d: Dest) => {
    const id = ++runId.current;
    setDest(d); go("prep");
    setJob({ files: [], done: false, mediaDone: 0 });
    try {
      const files: ExportFile[] = [];
      if (on.report) files.push({ name: `report-${base}.pdf`, blob: await report(light) });
      if (on.table) files.push({ name: `tabella-${base}.csv`, blob: new Blob([table()], { type: "text/csv;charset=utf-8" }) });
      if (on.map) files.push({ name: `mappa-${base}.geojson`, blob: new Blob([map()], { type: "application/geo+json" }) });
      if (id !== runId.current) return;
      setJob({ files: [...files], done: false, mediaDone: 0 });
      if (sendMedia) {
        for (let i = 0; i < chosen.length; i++) {
          const m = chosen[i]!;
          try {
            const blob = lighter ? await lighten(m) : await (await fetch(m.url)).blob();
            const name = lighter && m.kind === "image" ? m.name.replace(/\.[^.]+$/, "") + ".jpg" : m.name;
            files.push({ name, blob });
          } catch { /* skipped: not reachable */ }
          if (id !== runId.current) return;
          setJob({ files: [...files], done: false, mediaDone: i + 1 });
        }
      }
      if (d === "save" && on.text) files.push({ name: `riassunto-${base}.txt`, blob: new Blob([text], { type: "text/plain;charset=utf-8" }) });
      if (id !== runId.current) return;
      setJob({ files, done: true, mediaDone: chosen.length });
      hapticTick([10, 40, 10]);
      setStep("fatto");
    } catch {
      if (id === runId.current) { setJob({ files: [], done: true, mediaDone: 0, error: true }); setStep("fatto"); }
    }
  };

  const zipName = `micro-digital-twin-${base}-${day}.zip`;
  const saveAll = async (files: ExportFile[]) => {
    if (files.length === 1) { saveBlob(files[0]!.blob, files[0]!.name); return; }
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const names = new Set<string>();
    for (const f of files) {
      let n = f.name, k = 2;
      while (names.has(n)) n = f.name.replace(/(\.[^.]+)?$/, ` (${k++})$1`);
      names.add(n); zip.file(n, f.blob);
    }
    saveBlob(await zip.generateAsync({ type: "blob" }), zipName);
  };
  // The type by the name: a fetched photo can come back typed "application/octet-stream", which the share sheet refuses.
  const asFiles = (files: ExportFile[]) => files.map((f) => new File([f.blob], f.name, { type: MIME[f.name.split(".").pop()!.toLowerCase()] ?? (f.blob.type || "application/octet-stream") }));
  const subject = `Report ${piazza ? "della piazza" : "del vigneto"} · ${placeName}`;
  const body = on.text ? text : `In allegato il report ${piazza ? "della piazza" : "del vigneto"} di ${place}${author ? `, redatto da ${author}` : ""}.`;
  const touch = typeof window !== "undefined" && !!window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;

  // Toasts sit under the open sheet: what happened is also written in the sheet itself, under the white button.
  const [note, setNote] = useState("");
  const say = (msg: string) => { setNote(msg); toast(msg); };
  /** Through the system's share menu with a link to the files (one file, or a zip of them), valid 7 days. */
  const shareByLink = async (files: ExportFile[]) => {
    if (!files.length) { systemShareLink(subject, body, ""); return; }
    setNote("Preparo il link da condividere…");
    let file: File;
    if (files.length === 1) file = asFiles(files)[0]!;
    else {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.name, f.blob));
      file = new File([await zip.generateAsync({ type: "blob" })], zipName, { type: "application/zip" });
    }
    const url = await uploadLink(file, piazza ? "urban" : "vineyard");
    if (url) { setNote(""); systemShareLink(subject, `${body}\n${files.length === 1 ? "File" : "File (cartella zip)"}, valido 7 giorni:`, url); return; }
    // Without an account there is nowhere to put them: saved on the phone, the message still goes.
    await saveAll(files);
    say("Senza accesso i file non si possono mandare come link: li ho salvati in Download, allegali al messaggio.");
    systemShareLink(subject, body, "");
  };
  const act = async (d: Dest | "print" | "copy") => {
    const files = job?.files ?? [];
    setNote("");
    if (d === dest) setSent(true);
    try {
      if (d === "copy") { await navigator.clipboard.writeText(text); say("Testo copiato"); return; }
      if (d === "print") { onOpenChange(false); setTimeout(onPrint, 400); return; }
      if (d === "save") {
        if (!files.length) { await navigator.clipboard.writeText(text); say("Testo copiato"); return; }
        await saveAll(files); say(files.length === 1 ? "File salvato" : "Cartella zip salvata"); return;
      }
      // The installed Android app runs in a WebView, where the browser's share of files does not work: the files
      // go up to the account's private space and the system's share menu (Gmail, WhatsApp…) gets a 7-day link.
      if (isAndroidWebView()) { await shareByLink(files); return; }
      // Elsewhere the phone's share sheet carries the files (pick the email app there). It takes only some
      // kinds of file (no .geojson, no .zip, no .mov…): those are saved apart and said so.
      const all = asFiles(files);
      const ok = all.filter((f) => navigator.canShare?.({ files: [f] }));
      const apart = files.filter((_, i) => !ok.includes(all[i]!));
      const shareData: ShareData = { title: subject, ...(d === "email" || on.text ? { text: body } : {}), ...(ok.length ? { files: ok } : {}) };
      if ((touch || d === "share") && navigator.share && (ok.length || !files.length) && (navigator.canShare?.(shareData) ?? true)) {
        try {
          await navigator.share(shareData);
          if (apart.length) { await saveAll(apart); say(apart.length === 1 && apart[0]!.name.endsWith(".geojson") ? "I dati per la mappa sono salvati a parte: il telefono non li condivide." : `${apart.length === 1 ? "1 file salvato" : `${apart.length} file salvati`} a parte: il telefono non li condivide.`); }
          return;
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return;
          // Refused by the browser: on a phone try the link, else save below.
          if (touch && /Android/i.test(navigator.userAgent)) { await shareByLink(files); return; }
        }
      }
      // No share with files here: the email opens and the files are saved to attach them.
      if (d === "email") {
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        if (files.length) { await saveAll(files); say("File salvati: allegali all'email"); }
      } else if (files.length) { await saveAll(files); say("Condivisione non disponibile qui: file salvati"); }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") say("Non riuscito, riprova");
    }
  };

  const destLabel: Record<Dest, string> = { email: piazza ? "Invia agli enti" : "Invia per email", share: "Condividi", save: (job?.files.length ?? 0) > 1 ? "Salva la cartella zip" : "Salva sul telefono" };
  const prepPct = (() => {
    if (!job) return 0;
    const parts = (on.report ? 1 : 0) + (sendMedia ? 1 : 0) + 0.2;
    const r = on.report ? (job.files.some((f) => f.name.endsWith(".pdf")) ? 1 : (progress?.pct ?? 0) / 100) : 0;
    const m = sendMedia ? job.mediaDone / Math.max(1, chosen.length) : 0;
    return Math.round(((r + m + (job.done ? 0.2 : 0)) / parts) * 100);
  })();
  const running = !!job && !job.done;
  const close = () => onOpenChange(false);
  const reopen = () => onOpenChange(true);

  const toggle = (k: Kind) => setOn((o) => ({ ...o, [k]: !o[k] }));
  const nextFromCosa = () => go(on.media && media.length ? "foto" : "dove");

  const head = (kicker: string, title: string, sub: ReactNode, center = false) => (
    <div className={cn("mb-4", center && "text-center")}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-turquoise">{kicker}</p>
      <DialogTitle className="mt-1 text-[22px] font-semibold leading-tight">{title}</DialogTitle>
      <DialogDescription className="mt-0.5 text-sm text-muted-foreground">{sub}</DialogDescription>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={SHEET}>
          <span className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-foreground/20 sm:hidden" aria-hidden="true" />
          <div className="relative mb-2 flex h-9 items-center justify-center">
            {(step === "foto" || step === "dove") && (
              <button type="button" onClick={() => go(swipeSteps[swipeSteps.indexOf(step) - 1]!, -1)} aria-label="Indietro"
                className="absolute left-0 grid size-9 place-items-center rounded-full bg-foreground/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-[18px]" /></button>
            )}
            <div className="flex gap-1.5" aria-hidden="true">
              {bars.map((b, i) => <span key={b} className={cn("h-1 w-6 rounded-full transition-colors", i <= barIndex ? "bg-brand-turquoise" : "bg-foreground/15")} />)}
            </div>
          </div>
          <div className="-mx-5 min-h-0 overflow-y-auto overflow-x-hidden px-5 touch-pan-y"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div ref={track} style={{ willChange: "auto" }}>
              {step === "cosa" && (
                <>
                  {head(`1 di ${bars.length} · Cosa allegare`, "Quali file vuoi?", "Accendi quelli da mandare: partono insieme.")}
                  <Box>
                    <ToggleRow icon={<FileText />} title="Report" sub="PDF con risultato, giornata e costi" size={reportSize !== null ? sizeText(reportSize) : "…"} on={on.report} onChange={() => toggle("report")} />
                    <ToggleRow icon={<Table2 />} title="Tabella" sub="Valori e costi, da aprire in Excel" size={sizeText(sizes.table)} on={on.table} onChange={() => toggle("table")} />
                    <ToggleRow icon={<MapIcon />} title="Dati per la mappa" sub="Area e zone disegnate, per i GIS" size={sizeText(sizes.map)} on={on.map} onChange={() => toggle("map")} />
                    <ToggleRow icon={<Images />} title="Foto e video" disabled={!media.length}
                      sub={media.length ? countText(chosen) : "Nessuna foto o video nella simulazione"}
                      size={media.length && on.media ? sizeText(mediaBytes) : ""} on={on.media && media.length > 0} onChange={() => toggle("media")}
                      extra={on.media && media.length > 0 ? <button type="button" onClick={() => go("foto")} className="mt-1 inline-flex items-center text-[13px] font-semibold text-brand-turquoise outline-none focus-visible:underline">Scegli quali · {chosen.length} di {media.length}<ChevronRight className="size-4" /></button> : null} />
                    <ToggleRow icon={<Copy />} title="Testo nel messaggio" sub="Il riassunto scritto nel messaggio" size="" on={on.text} onChange={() => toggle("text")} />
                  </Box>
                  <p className="mx-0.5 mb-2 mt-4 text-[13px] font-semibold text-muted-foreground">Opzioni</p>
                  <Box>
                    <ToggleRow title="Comprimi le foto" sub={sendMedia && fullMediaBytes > mediaBytes + 1000 && lighter ? <>Più leggere per l'email · <s className="opacity-60">{sizeText(fullMediaBytes)}</s> → <span className="text-brand-turquoise">{sizeText(mediaBytes)}</span></> : "Più leggere per l'email"} on={lighter} onChange={() => setLighter((x) => !x)} disabled={!sendMedia} />
                    <ToggleRow title="Pagine chiare" sub="Report su fondo bianco, per stampare" on={light} onChange={() => setLight((x) => !x)} disabled={!on.report} />
                  </Box>
                  <button type="button" onClick={nextFromCosa} disabled={nothing}
                    className="sticky bottom-0 mt-4 h-[52px] w-full shadow-[0_-14px_20px_-2px_var(--card)] dark:shadow-[0_-14px_20px_-2px_oklch(0.25_0.016_258)] rounded-full bg-foreground text-[15px] font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                    {nothing ? "Scegli almeno un file" : `Avanti · ${summaryText(fileCount, sendMedia ? countText(chosen) : "", on.text)}${total ? ` · ${sizeText(total)}` : ""}`}
                  </button>
                </>
              )}
              {step === "foto" && (
                <>
                  {head(`2 di ${bars.length} · Foto e video`, "Quali allego?", "Tocca per togliere o rimettere.", true)}
                  <MediaPicker media={media} picked={picked} setPicked={setPicked} />
                  <button type="button" onClick={() => go("dove")} disabled={!chosen.length && !fileCount && !on.text}
                    className="mt-4 h-[52px] w-full rounded-full bg-foreground text-[15px] font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
                    Avanti · {chosen.length} di {media.length}{chosen.length ? ` · ${sizeText(mediaBytes)}` : ""}
                  </button>
                </>
              )}
              {step === "dove" && (
                <>
                  {head(`${bars.length - 1} di ${bars.length} · Dove`, "A chi lo mandi?", "Scegli dove va, al resto pensiamo noi.", true)}
                  <div className="mb-4 flex flex-wrap justify-center gap-1.5">
                    {on.report && <Chip icon={<FileText />} label="Report" />}
                    {on.table && <Chip icon={<Table2 />} label="Tabella" />}
                    {on.map && <Chip icon={<MapIcon />} label="Dati mappa" />}
                    {sendMedia && <Chip icon={<Images />} label={countText(chosen)} />}
                    {on.text && <Chip icon={<Copy />} label="Testo" />}
                  </div>
                  <Box>
                    <DestRow icon={<Mail />} accent title={piazza ? "Agli enti" : "Per email"} sub={piazza ? "Comune, Soprintendenza, Ufficio tecnico" : "Un messaggio con i file allegati"} onClick={() => void prepare("email")} />
                    <DestRow icon={<Share2 />} title="Condividi" sub="WhatsApp, Telegram, Drive… dal telefono" onClick={() => void prepare("share")} />
                    <DestRow icon={<Download />} title="Salva sul telefono" sub={fileCount + (sendMedia ? chosen.length : 0) + (on.text ? 1 : 0) > 1 ? "Una cartella zip in Download" : "Nella cartella Download"} onClick={() => void prepare("save")} />
                    {on.report && <DestRow icon={<Printer />} title="Stampa" sub="Solo il report, su pagine chiare" onClick={() => void act("print")} />}
                  </Box>
                  <p className="mt-3 text-center text-xs text-muted-foreground">{total ? `${sizeText(total)} in tutto · ` : ""}Tocca una voce per continuare</p>
                </>
              )}
              {step === "prep" && job && (
                <>
                  <div className="text-center">
                    <Ring pct={prepPct} />
                    {head(`${bars.length} di ${bars.length} · Preparo i file`, on.report && !job.files.some((f) => f.name.endsWith(".pdf")) ? "Il report" : sendMedia ? `Foto e video ${Math.min(job.mediaDone + 1, chosen.length)} di ${chosen.length}` : "Quasi fatto", on.report && !job.files.some((f) => f.name.endsWith(".pdf")) ? (progress?.label ?? "Preparazione del report…") : lighter ? "Le rendo più leggere" : "Le metto insieme", true)}
                  </div>
                  <Box>
                    {on.report && <PrepRow label="Report" state={job.files.some((f) => f.name.endsWith(".pdf")) ? "ok" : "run"} />}
                    {on.table && <PrepRow label="Tabella" state={job.files.some((f) => f.name.endsWith(".csv")) ? "ok" : "wait"} />}
                    {on.map && <PrepRow label="Dati per la mappa" state={job.files.some((f) => f.name.endsWith(".geojson")) ? "ok" : "wait"} />}
                    {sendMedia && <PrepRow label={`Foto e video · ${job.mediaDone} di ${chosen.length}`} state={job.mediaDone >= chosen.length ? "ok" : job.files.length >= fileCount ? "run" : "wait"} />}
                  </Box>
                  <button type="button" onClick={close} className="mt-4 h-[50px] w-full rounded-full bg-foreground/10 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Continua in sottofondo</button>
                </>
              )}
              {step === "fatto" && job && dest && (
                <>
                  <div className="text-center">
                    <span className={cn("mx-auto mb-3 grid size-[84px] place-items-center rounded-full", job.error ? "bg-destructive/20" : "bg-brand-turquoise shadow-[0_0_30px_rgb(45_212_191/0.35)]")}>
                      <span className="grid size-[72px] place-items-center rounded-full bg-card text-brand-turquoise"><Check className="size-7" strokeWidth={2.5} /></span>
                    </span>
                    {head("Pronto", job.error ? "Qualcosa non è andato" : job.files.length ? `${job.files.length === 1 ? "1 file pronto" : `${job.files.length} file pronti`}` : "Testo pronto",
                      job.error ? "Riprova tra poco." : job.files.length ? `${sizeText(job.files.reduce((s, f) => s + f.blob.size, 0))} in tutto · tocca per ${dest === "email" ? "inviarli" : dest === "share" ? "condividerli" : "salvarli"}` : "Tocca per mandarlo", true)}
                  </div>
                  {job.files.length > 0 && (
                    <Box>
                      {fileRows(job.files).map((r) => (
                        <div key={r.name} className="flex items-center gap-3 border-b border-foreground/[0.06] py-2.5 last:border-0">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground/[0.08] [&_svg]:size-5">{r.icon}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.name}</span>{r.sub && <span className="block text-xs text-muted-foreground">{r.sub}</span>}</span>
                          <span className="text-xs text-muted-foreground">{sizeText(r.size)}</span>
                        </div>
                      ))}
                    </Box>
                  )}
                  <p className="mx-0.5 mb-2 mt-4 text-center text-[13px] font-semibold text-muted-foreground">Mandalo anche</p>
                  <div className="flex justify-center gap-6">
                    {dest !== "share" && <RoundAction icon={<Share2 />} label="Condividi" onClick={() => void act("share")} />}
                    {dest !== "save" && <RoundAction icon={<Download />} label="Salva" onClick={() => void act("save")} />}
                    {dest !== "email" && <RoundAction icon={<Mail />} label="Email" onClick={() => void act("email")} />}
                    {on.report && <RoundAction icon={<Printer />} label="Stampa" onClick={() => void act("print")} />}
                    {on.text && <RoundAction icon={<Copy />} label="Copia testo" onClick={() => void act("copy")} />}
                  </div>
                  <button type="button" onClick={() => void act(dest)} disabled={job.error}
                    className="mt-4 h-[52px] w-full rounded-full bg-foreground text-[15px] font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">{destLabel[dest]}</button>
                  {note && <p role="status" className="mt-2 text-center text-[13px] text-brand-turquoise">{note}</p>}
                  <div className="mt-2 flex justify-center gap-4 text-[13px] font-semibold text-muted-foreground">
                    {on.report && <button type="button" onClick={() => { close(); setTimeout(onOpenReport, 400); }} className="py-2 outline-none focus-visible:underline">Apri il report</button>}
                    <button type="button" onClick={() => { runId.current++; setJob(null); setDest(null); go("cosa", -1); }} className="py-2 outline-none focus-visible:underline">Ricomincia</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Closed while preparing (or ready and not sent yet): a pill above the bottom bar brings the sheet back. */}
      {job && !sent && !open && step !== "cosa" && typeof document !== "undefined" && createPortal(
        <button type="button" onClick={reopen}
          className="fixed bottom-[calc(7.75rem+env(safe-area-inset-bottom))] left-1/2 z-[60] inline-flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-foreground/15 bg-card py-2 pl-2 pr-4 text-sm font-bold text-foreground shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6">
          <span className="size-7 rounded-full" style={{ background: `conic-gradient(var(--brand-turquoise) 0 ${running ? prepPct : 100}%, rgb(255 255 255 / 0.2) 0)`, WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))", mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))" }} aria-hidden="true" />
          {running ? `Preparo i file · ${prepPct}%` : "File pronti · tocca per inviarli"}
        </button>,
        document.body,
      )}
    </>
  );
}

const countText = (items: MediaItem[]) => {
  const p = items.filter((m) => m.kind === "image").length, v = items.length - p;
  if (!items.length) return "Nessuna scelta";
  return [p ? `${p} ${p === 1 ? "foto" : "foto"}` : "", v ? `${v} ${v === 1 ? "video" : "video"}` : ""].filter(Boolean).join(" e ");
};
const summaryText = (files: number, media: string, text: boolean) =>
  [files ? `${files} file` : "", media, !files && !media && text ? "il testo" : ""].filter(Boolean).join(" e ");

function fileRows(files: ExportFile[]) {
  const docs = files.filter((f) => !/\.(jpe?g|png|webp|heic|gif|mp4|mov|webm|3gp|m4v)$/i.test(f.name));
  const media = files.filter((f) => !docs.includes(f));
  const icon = (n: string) => (n.endsWith(".pdf") ? <FileText /> : n.endsWith(".csv") ? <Table2 /> : n.endsWith(".geojson") ? <MapIcon /> : <Copy />);
  const rows = docs.map((f) => ({ name: f.name, sub: "", size: f.blob.size, icon: icon(f.name) }));
  if (media.length) {
    const zones = [...new Set(media.map((f) => zoneOfName(f.name)).filter(Boolean))];
    const vids = media.filter((f) => /\.(mp4|mov|webm|3gp|m4v)$/i.test(f.name)).length, pics = media.length - vids;
    rows.push({ name: media.length === 1 ? media[0]!.name : [pics ? `${pics} foto` : "", vids ? `${vids} video` : ""].filter(Boolean).join(" e "), sub: zones.join(" · "), size: media.reduce((s, f) => s + f.blob.size, 0), icon: <Images /> });
  }
  return rows;
}

function Box({ children }: { children: ReactNode }) {
  return <div className="rounded-[18px] bg-foreground/[0.07] px-3.5 py-0.5">{children}</div>;
}

function ToggleRow({ icon, title, sub, size, on, onChange, extra, disabled }: { icon?: ReactNode; title: string; sub: ReactNode; size?: string; on: boolean; onChange: () => void; extra?: ReactNode; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 border-b border-foreground/[0.06] py-2.5 last:border-0", disabled && "opacity-45")}>
      {icon && <span className={cn("grid size-10 shrink-0 place-items-center rounded-full transition-colors [&_svg]:size-5", on ? "bg-brand-turquoise text-black" : "bg-foreground/[0.08]")}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px]", icon ? "font-semibold" : "font-medium")}>{title}</p>
        <p className="text-[12.5px] leading-snug text-muted-foreground">{sub}</p>
        {extra}
      </div>
      {size ? <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{size}</span> : null}
      <button type="button" role="switch" aria-checked={on} aria-label={title} onClick={onChange} disabled={disabled}
        className={cn("relative h-[26px] w-11 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-brand-turquoise" : "bg-foreground/15")}>
        <span className={cn("absolute top-[3px] size-5 rounded-full bg-white shadow transition-[left]", on ? "left-[21px]" : "left-[3px]")} />
      </button>
    </div>
  );
}

function DestRow({ icon, title, sub, onClick, accent }: { icon: ReactNode; title: string; sub: string; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b border-foreground/[0.06] py-3 text-left outline-none last:border-0 focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn("grid size-[42px] shrink-0 place-items-center rounded-full [&_svg]:size-5", accent ? "bg-brand-turquoise text-black" : "bg-foreground/[0.08]")}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{title}</span><span className="block text-[12.5px] text-muted-foreground">{sub}</span></span>
      <ChevronRight className="size-[18px] shrink-0 opacity-50" />
    </button>
  );
}

function Chip({ icon, label }: { icon: ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-turquoise/15 py-1 pl-1 pr-3 text-[13px] font-semibold"><span className="grid size-6 place-items-center rounded-full bg-brand-turquoise text-black [&_svg]:size-3.5">{icon}</span>{label}</span>;
}

function PrepRow({ label, state }: { label: string; state: "ok" | "run" | "wait" }) {
  return (
    <div className="flex items-center border-b border-foreground/[0.06] py-2.5 text-[15px] last:border-0">
      {label}
      <span className="ml-auto">
        {state === "ok" ? <Check className="size-5 text-brand-turquoise" strokeWidth={2.5} aria-label="pronto" />
          : state === "run" ? <span className="block size-[18px] animate-spin rounded-full border-[2.5px] border-foreground/15 border-t-brand-turquoise motion-reduce:animate-none" aria-label="in corso" />
          : <span className="text-xs text-muted-foreground">in coda</span>}
      </span>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  return (
    <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mx-auto mb-3 grid size-[84px] place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--brand-turquoise) 0 ${pct}%, rgb(255 255 255 / 0.1) 0)` }}>
      <span className="grid size-[72px] place-items-center rounded-full bg-card text-lg font-semibold tabular-nums">{pct}%</span>
    </span>
  );
}

function RoundAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 text-[13px] outline-none focus-visible:underline">
      <span className="grid size-14 place-items-center rounded-full bg-foreground/[0.08] [&_svg]:size-[22px]">{icon}</span>{label}
    </button>
  );
}

/** The simulation's photos and videos as a grid, all chosen at first: a tap takes one out or puts it back. */
function MediaPicker({ media, picked, setPicked }: { media: MediaItem[]; picked: Set<string> | null; setPicked: (s: Set<string> | null) => void }) {
  const zones = [...new Set(media.map((m) => zoneOfName(m.name)).filter((z): z is string => !!z))];
  const has = (m: MediaItem) => !picked || picked.has(m.id);
  const flip = (m: MediaItem) => {
    const s = new Set(picked ?? media.map((x) => x.id));
    if (s.has(m.id)) s.delete(m.id); else s.add(m.id);
    setPicked(s.size === media.length ? null : s);
  };
  const only = (z: string | null | "none") => setPicked(z === null ? null : new Set(z === "none" ? [] : media.filter((m) => zoneOfName(m.name) === z).map((m) => m.id)));
  const active = picked === null ? "all" : picked.size === 0 ? "none" : zones.find((z) => media.every((m) => (zoneOfName(m.name) === z) === picked.has(m.id))) ?? "";
  return (
    <>
      <div className="no-scrollbar -mx-5 mb-3 flex gap-1.5 overflow-x-auto px-5 touch-pan-x" data-map-gestures="">
        {[["all", `Tutte · ${media.length}`], ...zones.map((z) => [z, `${z} · ${media.filter((m) => zoneOfName(m.name) === z).length}`]), ["none", "Nessuna"]].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={active === k} onClick={() => only(k === "all" ? null : k === "none" ? "none" : k!)}
            className={cn("h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", active === k ? "bg-secondary font-semibold text-secondary-foreground" : "bg-foreground/[0.07] text-foreground/85")}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {media.map((m) => {
          const z = zoneOfName(m.name), sel = has(m);
          return (
            <button key={m.id} type="button" role="checkbox" aria-checked={sel} aria-label={m.name} onClick={() => flip(m)}
              className={cn("relative aspect-square overflow-hidden rounded-xl bg-foreground/10 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring", !sel && "opacity-45")}>
              {m.kind === "image"
                ? <img src={m.url} alt="" loading="lazy" className="size-full object-cover" />
                : <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className="pointer-events-none size-full object-cover" />}
              {z && <span className="absolute left-1 top-1 max-w-[70%] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">{z}</span>}
              {m.kind === "video" && <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">▶ video</span>}
              <span className={cn("absolute right-1 top-1 grid size-[22px] place-items-center rounded-full border-2", sel ? "border-brand-turquoise bg-brand-turquoise text-black" : "border-white bg-black/35")}>
                {sel && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
