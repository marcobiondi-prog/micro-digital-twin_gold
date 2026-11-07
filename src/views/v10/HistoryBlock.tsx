import { rememberBack } from "@/lib/back-to";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Building2, CalendarDays, Check, Share2, ChevronDown, Clock3, Cloud, Smartphone, Grape, History, Archive, ArchiveRestore, Camera, FolderClosed, Layers, Play, Sparkles, Trash2, Video, Download, Images, ClipboardList } from "lucide-react";
import { currentMedia, refreshMedia, removeMedia, useLabMedia, useMediaListError, type MediaItem } from "@/models/lab-media-store";
import { mediaTime } from "@/models/media-time";
import { uploadGroups } from "@/models/media-groups";
import { mediaThumb, readyThumb } from "@/lib/media-thumbs";
import { unhide, useSimHidden } from "@/models/sim-hidden";
import { SHOT_KINDS, kindCountText, shotKind, shotLabel, type ShotKind } from "@/models/shot-kind";
import { TabRow } from "@/views/v8/console";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { forShare, zoneOfName } from "@/views/v10/ExportSheet";
import { useLab } from "@/models/lab-store";
import { VideoPlayer } from "@/views/v10/VideoPlayer";
import { useSignedIn } from "@/lib/use-signed-in";
import { archiveMedia, restoreMedia, useMediaArchive } from "@/models/media-archive";
import { drawnAreaFor, ZONE_LABEL, type DrawnArea, type SubArea } from "@/models/drawn-area";
import type { Ring } from "@/models/place-area";
import { ZONE_COLORS } from "@/views/v10/map-area";
import { peekStyle, useTabSwipe } from "@/lib/use-tab-swipe";
import { useProId } from "@/lib/use-pro-id";
import { SEASON_LABEL } from "@/models/season-climate";
import { DashCard, DashSection } from "@/views/v10/Dashboard";
import { cn } from "@/lib/utils";
import { OFFICES } from "@/models/professional-id";
import { clearHistory, removeHistory, setOfficeScope, useHistory, useOfficeScope, type OfficeScope } from "@/lib/use-history";
import { archiveHistory, restoreHistory, useHistoryArchive } from "@/models/history-archive";
import { byOf, groupByDay, whenClock, whenOf, type HistoryEntry, type HistoryFlow, type HistorySource, type SourcedEntry } from "@/models/intervention-history";

/** When the intervention was made, on this device's clock: "09:12". */
const time = (e: HistoryEntry) => new Date(e.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

type Shot = MediaItem & { flow: "piazza" | "vigneto"; at: number | null };

/**
 * A photo, or a video's first frame, as a light thumbnail (lib/media-thumbs: made once, small, kept for the session),
 * started only when it comes near the screen; a turning ring while it is made, then it fades in. A thumbnail already
 * made shows at once.
 */
function ShotMedia({ s }: { s: Shot }) {
  const key = `${s.flow}-${s.id}`;
  const known = readyThumb(key);
  const [src, setSrc] = useState<string | null | undefined>(known);
  const [ready, setReady] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (src !== undefined) return;
    const el = box.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver((seen) => {
      if (!seen.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void mediaThumb(key, s.url, s.kind).then((out) => { if (live) setSrc(out); });
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [key, s.url, s.kind, src]);
  const fade = `size-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`;
  return (
    <span ref={box} className="absolute inset-0">
      {src === undefined && (
        <span className="absolute inset-0 grid place-items-center" role="status" aria-label="Caricamento">
          <span className="size-8 animate-spin rounded-full border-[3px] border-white/15 border-t-brand-turquoise motion-reduce:animate-none" />
        </span>
      )}
      {src && <img ref={(i) => { if (i?.complete && i.naturalWidth) setReady(true); }} src={src} alt="" decoding="async"
        onLoad={() => setReady(true)} className={fade} />}
    </span>
  );
}

function Thumb({ s, onOpen }: { s: Shot; onOpen: () => void }) {
  // Taken out of the simulation: still here, said in its caption.
  const outOfSim = !!useSimHidden()[`${s.flow}-${s.id}`];
  const when = s.at ? new Date(s.at).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "";
  return (
    <button type="button" onClick={onOpen} aria-label={`Apri ${s.kind === "video" ? "il video" : "la foto"} ${s.flow}${when ? `, ${when}` : ""}`} className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-foreground/[0.08] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ShotMedia s={s} />
      {s.kind === "video" && <span className="absolute inset-0 grid place-items-center"><Play className="size-7 text-white drop-shadow" aria-hidden="true" /></span>}
      <KindMark s={s} />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-5 text-xs text-white">{outOfSim ? "Fuori dalla simulazione" : `${s.flow === "piazza" ? "Piazza" : "Vigneto"}${when ? ` · ${when}` : ""}`}</span>
    </button>
  );
}

/**
 * The photos and videos of a day opened inside the app, on a black full-screen page: one at a time, fitted whole,
 * slid sideways to the next (a snapping row of its own, so the page's tabs stay put; ‹ › on larger screens), with
 * "n di N", the place and the date; videos play with their controls. The phone's Back or ✕ closes it.
 */
function ShotViewer({ shots, start, onClose }: { shots: Shot[]; start: number; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  // Its own copy: a photo deleted here leaves at once, without waiting for the pile behind to change.
  const [list, setList] = useState(shots);
  const [i, setI] = useState(start);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const row = useRef<HTMLDivElement>(null);
  // Each photo's file, fetched as soon as it is shown, so the share opens straight from the tap.
  const files = useRef(new Map<string, Blob>());
  const lab = useLab();
  const { entries: history } = useHistory();
  // Mounted closed, then opened (the shared dialog's history step), at the photo that was tapped.
  useEffect(() => { setOpen(true); }, []);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => { const r = row.current; if (r) r.scrollLeft = start * r.clientWidth; });
  }, [open, start]);
  const s = list[Math.min(i, list.length - 1)] ?? list[0]!;
  useEffect(() => {
    setAsk(false); setNote("");
    if (!s || files.current.has(s.url)) return;
    void fetch(s.url).then((r) => r.blob()).then((b) => { files.current.set(s.url, b); }, () => {});
  }, [s]);
  const onScroll = () => {
    const r = row.current; if (!r) return;
    const n = Math.round(r.scrollLeft / Math.max(1, r.clientWidth));
    if (n !== i) {
      setI(n);
      // A video slid away stops playing.
      Array.from(r.children).forEach((slide, k) => { if (k !== n) slide.querySelectorAll("video").forEach((v) => v.pause()); });
    }
  };
  const go = (n: number) => { const r = row.current; if (r) r.scrollTo({ left: n * r.clientWidth, behavior: "smooth" }); };
  const close = () => { setOpen(false); setTimeout(onClose, 200); };
  const when = s?.at ? new Date(s.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const what = s?.kind === "video" ? "questo video" : "questa foto";

  /** The phone's own share window with this file (WhatsApp, Telegram, Gmail…); else it is saved in Download. */
  const share = async () => {
    setNote("");
    try {
      const blob = files.current.get(s.url) ?? (await (await fetch(s.url)).blob());
      const file = forShare(s.name, blob);
      if (file && typeof navigator.share === "function") {
        try { await navigator.share({ files: [file], title: s.name }); return; }
        catch (e) {
          if ((e as Error)?.name === "AbortError") return;
          setNote("Il telefono non ha aperto la condivisione: tocca di nuovo.");
          return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = file?.name ?? s.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNote(file ? "Qui la condivisione non c'è: salvata in Download." : "Il telefono non condivide questo tipo di file: salvato in Download.");
    } catch { setNote("File non raggiungibile: controlla la connessione."); }
  };
  /** Deleted for good, from the account or from this device; the viewer moves on to the next one, or closes. */
  const del = async () => {
    const gone = s;
    setBusy(true);
    try {
      if (list.length === 1) close();
      await removeMedia(gone.flow === "piazza" ? "urban" : "vineyard", [gone]);
      toast.success(gone.kind === "video" ? "Video eliminato" : "Foto eliminata");
      setList((l) => l.filter((x) => x !== gone));
      setI((k) => Math.max(0, Math.min(k, list.length - 2)));
    } catch {
      setNote("Eliminazione non riuscita: controlla la connessione e riprova.");
    } finally { setBusy(false); setAsk(false); }
  };
  if (!s) return null;
  const flowKey = s.flow === "piazza" ? "urban" : "vineyard";
  const place = lab[flowKey].location;
  const area = drawnAreaFor(lab[flowKey].area, place);
  const zone = zoneOfName(s.name);
  // The simulation as it was set nearest to the shot (within three hours), from the history of that project.
  const near = s.at ? history.filter((e) => e.flow === s.flow && whenOf(e)).map((e) => ({ e, d: Math.abs(new Date(e.at).getTime() - s.at!) })).filter((x) => x.d < 3 * 3600_000).sort((x, y) => x.d - y.d)[0]?.e : undefined;
  const nearWhen = near ? whenOf(near) : null;
  const [placeName, placeSub] = [place.label.split(/[,·]/)[0]!.trim(), place.label.split(/[,·]/).slice(1).map((x) => x.trim()).filter(Boolean).join(" · ")];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent overlayClassName="bg-black" className="!left-0 !top-0 flex h-[100dvh] w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 text-foreground sm:max-h-none sm:rounded-none">
        <DialogTitle className="sr-only">{s.kind === "video" ? "Video" : "Foto"} {i + 1} di {list.length}</DialogTitle>
        <DialogDescription className="sr-only">{placeName}{when ? `, ${when}` : ""}</DialogDescription>
        {/* The photo on top, fitted whole over a blurred copy of itself; sideways to the next one. */}
        <div className="relative h-[54dvh] shrink-0 overflow-hidden bg-black">
          {/* The blurred backdrop is drawn from the small thumbnail: blurring the whole photo was heavy on phones. */}
          {readyThumb(`${s.flow}-${s.id}`) && <img src={readyThumb(`${s.flow}-${s.id}`)!} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-2xl" />}
          <div ref={row} onScroll={onScroll} data-map-gestures="" className="no-scrollbar relative flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden touch-pan-x">
            {list.map((x, k) => (
              <div key={`${x.flow}-${x.id}`} className="relative flex h-full w-full shrink-0 snap-center items-center justify-center">
                {Math.abs(k - i) <= 2 && (x.kind === "video"
                  ? (k === i ? <VideoPlayer src={x.url} /> : <video src={`${x.url}#t=0.1`} playsInline preload="metadata" muted className="max-h-full max-w-full" />)
                  : <img src={x.url} alt={`Foto ${k + 1} di ${list.length}`} className="max-h-full max-w-full object-contain" />)}
              </div>
            ))}
          </div>
          <span className="absolute left-4 top-[calc(0.9rem+env(safe-area-inset-top))] rounded-full bg-black/40 px-3 py-1.5 text-[13px] font-semibold tabular-nums text-white backdrop-blur-md">{Math.min(i, list.length - 1) + 1} / {list.length}</span>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-background" />
        </div>
        {/* What the photo is about: the place, when, where on the drawn area, the simulation of that moment. */}
        <div className="relative -mt-6 min-h-0 flex-1 overflow-y-auto rounded-t-[1.6rem] bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
          <h3 className="font-display text-[22px] font-light leading-tight">{placeName}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{[placeSub, when].filter(Boolean).join(" · ") || "Data non registrata"}</p>
          <MiniMap center={place} area={area} highlight={zone} />
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto touch-pan-x" data-map-gestures="">
            {zone && <span className="shrink-0 rounded-full bg-foreground/[0.07] px-3 py-1.5 text-[12.5px]">Zona: {zone}</span>}
            {nearWhen && <span className="shrink-0 rounded-full bg-foreground/[0.07] px-3 py-1.5 text-[12.5px]">{SEASON_LABEL[nearWhen.season]} · {whenClock(nearWhen)}</span>}
            <span className="shrink-0 rounded-full bg-foreground/[0.07] px-3 py-1.5 text-[12.5px]">{s.flow === "piazza" ? "Piazza" : "Vigneto"} · {({ foto: "foto", multiplo: "scatto multiplo", ai: s.kind === "video" ? "video con l'AI" : "foto con l'AI", video: "video" } as const)[shotKind(s)]}</span>
          </div>
          {note && <p role="status" className="mt-3 text-center text-[13px] text-brand-turquoise">{note}</p>}
          {ask ? (
            <div role="alertdialog" aria-label="Conferma eliminazione" className="mt-4 rounded-2xl bg-destructive/10 p-4 text-center">
              <p className="text-[15px] font-medium">Eliminare {what}? Non si può recuperare.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setAsk(false)} disabled={busy} className="h-12 flex-1 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Annulla</button>
                <button type="button" onClick={() => void del()} disabled={busy} className="h-12 flex-1 rounded-full bg-destructive text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">{busy ? "Elimino…" : "Elimina"}</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void share()} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"><Share2 className="size-5" aria-hidden="true" />Condividi</button>
              <button type="button" onClick={() => setAsk(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-[15px] font-semibold text-red-400 outline-none focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-5" aria-hidden="true" />Elimina</button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const MAP_H = 190;
/** Web Mercator pixel of a point at zoom z. */
const worldPx = (lat: number, lng: number, z: number): [number, number] => {
  const size = 256 * 2 ** z, r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * size, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size];
};

/**
 * A small still map under the photo: the satellite picture of the place, the drawn area in white, its zones dashed in
 * their colours (the photo's own zone stronger, the others faded) and the place's pin. Without a drawn area, the place
 * alone; without connection, a dark ground with the same drawing.
 */
function MiniMap({ center, area, highlight }: { center: { lat: number; lng: number }; area: DrawnArea | null; highlight: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 340));
    ro.observe(el); setW(el.clientWidth || 340);
    return () => ro.disconnect();
  }, []);
  const ring = area?.ring ?? null;
  const zones = (area?.zones ?? []).filter((z) => Array.isArray(z.ring) && z.ring.length >= 3);
  // The zoom that fits the area with a margin, fractional (the tiles of the zoom below, scaled up); the place alone at 17.
  let zf = 17;
  if (ring && ring.length >= 3) {
    const ps = ring.map(([la, ln]) => worldPx(la, ln, 0));
    const dx = Math.max(...ps.map((q) => q[0])) - Math.min(...ps.map((q) => q[0])), dy = Math.max(...ps.map((q) => q[1])) - Math.min(...ps.map((q) => q[1]));
    zf = Math.min(19, Math.max(12, Math.log2(Math.min((w * 0.86) / Math.max(dx, 1e-9), (MAP_H * 0.8) / Math.max(dy, 1e-9)))));
  }
  const z = Math.floor(zf), k = 2 ** (zf - z), T = 256 * k;
  const at = (lat: number, lng: number): [number, number] => { const [x, y] = worldPx(lat, lng, z); return [x * k, y * k]; };
  let cx: number, cy: number;
  if (ring && ring.length >= 3) {
    const ps = ring.map(([la, ln]) => at(la, ln));
    cx = (Math.min(...ps.map((q) => q[0])) + Math.max(...ps.map((q) => q[0]))) / 2; cy = (Math.min(...ps.map((q) => q[1])) + Math.max(...ps.map((q) => q[1]))) / 2;
  } else [cx, cy] = at(center.lat, center.lng);
  const ox = cx - w / 2, oy = cy - MAP_H / 2;
  const tiles: Array<[number, number]> = [];
  for (let tx = Math.floor(ox / T); tx <= Math.floor((ox + w) / T); tx++)
    for (let ty = Math.floor(oy / T); ty <= Math.floor((oy + MAP_H) / T); ty++) tiles.push([tx, ty]);
  const pts = (r: Ring) => r.map(([la, ln]) => { const [x, y] = at(la, ln); return `${(x - ox).toFixed(1)},${(y - oy).toFixed(1)}`; }).join(" ");
  const [px, py] = at(center.lat, center.lng);
  const label = (zn: SubArea) => zn.name ?? ZONE_LABEL[zn.kind];
  return (
    <div ref={box} className="relative mt-4 h-[190px] overflow-hidden rounded-2xl bg-[#2a332d]" aria-label={`Mappa del luogo${highlight ? `, zona ${highlight}` : ""}`} role="img">
      {tiles.map(([tx, ty]) => (
        <img key={`${tx}-${ty}`} src={`${TILES}/${z}/${ty}/${tx}`} alt="" aria-hidden="true" loading="lazy" draggable={false}
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          className="absolute max-w-none select-none" style={{ left: tx * T - ox, top: ty * T - oy, width: T, height: T }} />
      ))}
      <span className="absolute inset-0 bg-black/15" aria-hidden="true" />
      <svg className="absolute inset-0" width={w} height={MAP_H} aria-hidden="true">
        {ring && ring.length >= 3 && <polygon points={pts(ring)} fill="rgb(45 212 191 / 0.14)" stroke="#fff" strokeWidth="1.6" />}
        {zones.map((zn) => {
          const on = highlight !== null && label(zn) === highlight;
          const color = ZONE_COLORS[zn.kind];
          return <polygon key={zn.id} points={pts(zn.ring)} fill={color} fillOpacity={on ? 0.35 : 0.14} stroke={color} strokeWidth={on ? 3 : 1.5} strokeDasharray="5 4" opacity={highlight && !on ? 0.5 : 1} />;
        })}
      </svg>
      <span className="absolute grid size-6 -translate-x-1/2 -translate-y-full place-items-center" style={{ left: px - ox, top: py - oy }} aria-hidden="true">
        <span className="size-5 rotate-45 rounded-[50%_50%_0_50%] border-[3px] border-white bg-brand-turquoise shadow-md" />
      </span>
    </div>
  );
}

/** Photos and videos of one day, as a pile. */
type Pile = { key: string; label: string; shots: Shot[]; group?: boolean };
function pilesOf(shots: Shot[]): Pile[] {
  const out: Pile[] = [];
  for (const s of shots) {
    const d = s.at ? new Date(s.at) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "senza-data";
    const label = d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Senza data";
    const last = out[out.length - 1];
    if (last?.key === key) last.shots.push(s); else out.push({ key, label, shots: [s] });
  }
  return out;
}
/** How the photos are piled on the Cronologia: one pile per day, or one per simulation group (Gruppo n). */
export type PileView = "giorno" | "gruppo";
/**
 * One pile per group of the simulation (the same Gruppo n, 20 uploads a group), newest first: a group loaded over
 * several days stays whole here, while by day it is split among those days.
 */
function groupPilesOf(shots: Shot[], numbers: Map<string, number>): Pile[] {
  const out = new Map<string, Pile & { last: number }>();
  for (const s of shots) {
    const n = numbers.get(`${s.flow}-${s.id}`);
    const key = `g-${s.flow}-${n ?? "x"}`;
    const p = out.get(key) ?? { key, label: n ? `Gruppo ${n}` : "Senza gruppo", shots: [], group: true, last: 0 };
    p.shots.push(s);
    p.last = Math.max(p.last, s.at ?? 0);
    out.set(key, p);
  }
  const piles = [...out.values()].sort((a, b) => b.last - a.last);
  const both = new Set(shots.map((s) => s.flow)).size > 1;
  return piles.map(({ last: _last, ...p }) => (both ? { ...p, label: `${p.shots[0]!.flow === "piazza" ? "Piazza" : "Vigneto"} · ${p.label}` } : p));
}
/** The days a group's photos were taken: "31/10/2026" or "29/10 – 31/10/2026". */
function daysText(shots: Shot[]) {
  const times = shots.map((s) => s.at).filter((t): t is number => t !== null);
  if (!times.length) return "Senza data";
  const day = (t: number, year: boolean) => new Date(t).toLocaleDateString("it-IT", year ? { day: "2-digit", month: "2-digit", year: "numeric" } : { day: "2-digit", month: "2-digit" });
  const lo = Math.min(...times), hi = Math.max(...times);
  return day(lo, true) === day(hi, true) ? day(hi, true) : `${day(lo, false)} – ${day(hi, true)}`;
}
const countText = (shots: Shot[]) => kindCountText(shots);
/**
 * The two archives told apart at a glance: photos and videos (a stack of pictures, turquoise) and interventions (a
 * clipboard list, in the app's blue),, each with a small archive box on its corner.
 */
function ArchiveIcon({ kind, small = false }: { kind: "foto" | "interventi"; small?: boolean }) {
  const Icon = kind === "foto" ? Images : ClipboardList;
  // Photos in the app's turquoise, interventions in a bright violet: two far hues, so the archives read apart at a glance.
  const tone = kind === "foto" ? "bg-brand-turquoise/15 text-brand-turquoise" : "bg-violet-500/20 text-violet-600 dark:bg-violet-400/20 dark:text-violet-300";
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full ${tone} ${small ? "size-8" : "size-10"}`} aria-hidden="true">
      <Icon className={small ? "size-4" : "size-5"} />
      <span className={`absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-background text-foreground ring-1 ring-foreground/15 ${small ? "size-4" : "size-[18px]"}`}>
        <Archive className={small ? "size-2.5" : "size-3"} />
      </span>
    </span>
  );
}
/** When they went into the archive: "Archiviata il 01/11/2026", or "dal 30/10 al 01/11/2026" over several days. */
const dayOf = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
function archivedOn(isos: Array<string | undefined>, word = "Archiviata"): string {
  const t = isos.filter((x): x is string => !!x).map((x) => Date.parse(x)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!t.length) return "";
  const a = dayOf(new Date(t[0]!).toISOString()), b = dayOf(new Date(t[t.length - 1]!).toISOString());
  return a === b ? `${word} il ${a}` : `${word} dal ${a.slice(0, 5)} al ${b}`;
}

/** The corner label of every photo and video — Foto, Multiplo, AI or Video — so each kind reads at a glance in the piles and the rows. */
function KindMark({ s }: { s: Shot }) {
  const k = shotKind(s);
  const Icon = k === "multiplo" ? Layers : k === "ai" ? Sparkles : k === "video" ? Video : Camera;
  return (
    <span className="absolute left-1.5 top-1.5 z-[1] inline-flex h-6 items-center gap-1 rounded-full bg-black/65 px-2 text-[11px] font-semibold text-white ring-1 ring-white/25">
      <Icon className="size-3.5" aria-hidden="true" />{shotLabel(s)}
    </span>
  );
}

/**
 * The kinds as one row of pills — Tutti, then all four kinds, each with how many (an empty one dimmed) — to see one kind at a time:
 * single photos, multiple shots, AI shots or videos.
 */
function KindPills({ shots, value, onChange }: { shots: Shot[]; value: ShotKind | "tutti"; onChange: (k: ShotKind | "tutti") => void }) {
  const counts = useMemo(() => { const n: Record<ShotKind, number> = { foto: 0, multiplo: 0, ai: 0, video: 0 }; for (const s of shots) n[shotKind(s)]++; return n; }, [shots]);
  if (!shots.length) return null;
  const pill = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "bg-foreground text-background" : "bg-foreground/[0.07] text-foreground/85"}`;
  return (
    <div role="radiogroup" aria-label="Tipo di foto e video" data-map-gestures className="-mx-1 flex touch-pan-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      <button type="button" role="radio" aria-checked={value === "tutti"} onClick={() => onChange("tutti")} className={pill(value === "tutti")}>Tutti<span className="tabular-nums opacity-70">{shots.length}</span></button>
      {SHOT_KINDS.map((k) => (
        <button key={k.id} type="button" role="radio" aria-checked={value === k.id} disabled={!counts[k.id]} onClick={() => onChange(k.id)} className={`${pill(value === k.id)} disabled:opacity-40`}>
          {k.label}<span className="tabular-nums opacity-70">{counts[k.id]}</span>
        </button>
      ))}
    </div>
  );
}

const PILE_VIEW_KEY = "mdt-pile-view-v1";
/** Per gruppo | Per giorno: how the Cronologia piles its photos and videos. */
function PileViewSwitch({ value, onChange }: { value: PileView; onChange: (v: PileView) => void }) {
  const opt = (v: PileView, label: string) => (
    <button type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
      className={`h-8 flex-1 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === v ? "bg-foreground text-background" : "text-foreground/80"}`}>{label}</button>
  );
  return (
    <div role="radiogroup" aria-label="Raggruppa foto e video" className="flex w-full max-w-xs rounded-full bg-foreground/[0.07] p-1">
      {opt("gruppo", "Per gruppo")}{opt("giorno", "Per giorno")}
    </div>
  );
}

/** One picture of a pile: the photo, or the video's first frame with a play mark. */
function PileCard({ s, className, style }: { s: Shot; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`absolute inset-0 overflow-hidden rounded-2xl bg-[oklch(0.27_0.016_258)] shadow-[0_6px_18px_rgb(0_0_0/0.45)] ring-1 ring-white/10 ${className ?? ""}`} style={style}>
      <ShotMedia s={s} />
      {s.kind === "video" && <span className="absolute inset-0 grid place-items-center"><Play className="size-7 text-white drop-shadow" aria-hidden="true" /></span>}
      <KindMark s={s} />
    </span>
  );
}

/**
 * The photos and videos stacked one on the other like a pile of prints, one pile per day (the newest on top, the next
 * two peeking out turned a little), with the date and how many; a tap spreads that day's pile into its grid.
 */
function PhotoPiles({ shots, by = "giorno" }: { shots: Shot[]; by?: PileView }) {
  const numbers = useGroupNumbers();
  const piles = useMemo(() => (by === "gruppo" ? groupPilesOf(shots, numbers) : pilesOf(shots)), [shots, by, numbers]);
  const [open, setOpen] = useState<string | null>(null);
  const shown = piles.find((p) => p.key === open) ?? null;
  // The opened pile shows right under the row of the pile tapped (not under every pile, where it fell out of
  // sight with many groups), and the page brings it into view.
  const cols = useGridColumns();
  const openAt = shown ? piles.indexOf(shown) : -1;
  const rowEnd = openAt < 0 ? -1 : Math.min(piles.length - 1, Math.floor(openAt / cols) * cols + cols - 1);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panel.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }), 60);
    return () => window.clearTimeout(t);
  }, [open]);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4">
      {piles.map((p, idx) => {
          const [top, second, third] = p.shots;
          const isOpen = open === p.key;
          const tile = (
            <button key={p.key} type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.key)}
              aria-label={`${p.label}: ${countText(p.shots)}`}
              className="group text-left outline-none">
              <span className="relative mx-2 mt-2 block aspect-[4/3] transition-transform duration-200 group-active:scale-[0.97]">
                {isOpen && <><span className="pile-glow" aria-hidden="true" /><span className="pile-ring" aria-hidden="true" /></>}
                {third && <PileCard s={third} className="opacity-70" style={{ transform: "rotate(-8deg) translate(-10px, 6px)" }} />}
                {second && <PileCard s={second} className="opacity-85" style={{ transform: "rotate(6deg) translate(10px, 3px)" }} />}
                {top && <PileCard s={top} />}
                {p.shots.length > 1 && <span className="absolute -right-2 -top-2 grid h-7 min-w-7 place-items-center rounded-full bg-foreground px-2 text-xs font-bold tabular-nums text-background shadow">{p.shots.length}</span>}
              </span>
              <span className="mt-3 block px-1 text-sm font-semibold tabular-nums">{p.label}</span>
              {p.group && <span className="block px-1 text-xs tabular-nums text-muted-foreground">{daysText(p.shots)}</span>}
              <span className="block px-1 text-xs text-muted-foreground">{countText(p.shots)}</span>
            </button>
          );
          return (
            <Fragment key={p.key}>
              {tile}
              {idx === rowEnd && shown && (
                // Set apart from the page: a lighter slate card with a turquoise edge, and a notch pointing up at the pile it came from.
                <div ref={panel} className="pile-panel relative col-span-full scroll-mb-28 pt-2" style={{ "--notch-x": `${((openAt % cols) + 0.5) / cols * 100}%` } as React.CSSProperties}>
                  <span className="pile-notch" aria-hidden="true" />
                  <OpenPile key={shown.key} pile={shown} onClose={() => setOpen(null)} />
                </div>
              )}
            </Fragment>
          );
        })}
    </div>
  );
}

/** How many piles a row holds now: 2 on phones, 3 from 640 px, 4 from 768 px (the grid's own breakpoints). */
function useGridColumns() {
  const read = () => (typeof window === "undefined" ? 2 : matchMedia("(min-width: 768px)").matches ? 4 : matchMedia("(min-width: 640px)").matches ? 3 : 2);
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const update = () => setCols(read());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

/**
 * The simulation's group of every photo and video ("piazza-<id>" → n): the same Gruppo n as in the simulation, counted
 * on the project's whole list by upload (20 a group), so a day's photos read under the group they were loaded in.
 */
function useGroupNumbers() {
  // Numbered on the project's whole list: a group keeps its number and its files here even when they are taken out
  // of the simulation.
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const g of uploadGroups(urban)) for (const f of g.files) map.set(`piazza-${f.id}`, g.n);
    for (const g of uploadGroups(vineyard)) for (const f of g.files) map.set(`vigneto-${f.id}`, g.n);
    return map;
  }, [urban, vineyard]);
}
type ShotGroup = { key: string; flow: Shot["flow"]; n: number | null; shots: Shot[]; day?: string };
/** A day's shots by project and group, newest group first, keeping each group's files in the day's order. */
function dayGroups(shots: Shot[], numbers: Map<string, number>): ShotGroup[] {
  const out = new Map<string, ShotGroup>();
  for (const s of shots) {
    const n = numbers.get(`${s.flow}-${s.id}`) ?? null;
    const key = `${s.flow}-${n ?? "x"}`;
    const g = out.get(key) ?? { key, flow: s.flow, n, shots: [] };
    g.shots.push(s);
    out.set(key, g);
  }
  return [...out.values()].sort((a, b) => (a.flow === b.flow ? (b.n ?? 0) - (a.n ?? 0) : a.flow === "piazza" ? -1 : 1));
}

/**
 * A day's pile spread into its grid. "Seleziona" turns the thumbnails into checkboxes (with "Tutte"), and "Elimina n"
 * asks once in place before deleting them for good — from the account when uploaded, from this device otherwise.
 */
function OpenPile({ pile, onClose, archived = false }: { pile: Pile; onClose: () => void; archived?: boolean }) {
  const [selecting, setSelecting] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyOf = (s: Shot) => `${s.flow}-${s.id}`;
  const numbers = useGroupNumbers();
  // A day splits into its groups; a group's own pile is a single group, shown without a header.
  // A day splits into its groups, a group into its days (gg/mm/aaaa, newest first): both ways the photos read by
  // group and by day.
  const groups = useMemo<ShotGroup[]>(() => (pile.group
    ? pilesOf(pile.shots).map((d) => ({ key: `${pile.key}-${d.key}`, flow: d.shots[0]!.flow, n: null, shots: d.shots, day: d.label }))
    : dayGroups(pile.shots, numbers)), [pile, numbers]);
  const bothFlows = new Set(groups.map((g) => g.flow)).size > 1;
  const groupTitle = (g: ShotGroup) => g.day ?? `${bothFlows ? (g.flow === "piazza" ? "Piazza · " : "Vigneto · ") : ""}${g.n ? `Gruppo ${g.n}` : "Senza gruppo"}`;
  const [folded, setFolded] = useState<Set<string>>(new Set());
  // Files taken out of their simulation can go back into it from here.
  const simHidden = useSimHidden();
  const outOfSim = pile.shots.filter((s) => simHidden[keyOf(s)]);
  const flip = (s: Shot) => setPicked((p) => { const n = new Set(p); if (n.has(keyOf(s))) n.delete(keyOf(s)); else n.add(keyOf(s)); return n; });
  const all = picked.size === pile.shots.length;
  const stop = () => { setSelecting(false); setPicked(new Set()); setAsk(false); };
  const chosen = pile.shots.filter((s) => picked.has(keyOf(s)));
  /** Into the archive (or back out of it): the whole day, or the ones chosen. */
  const shelve = (items: Shot[]) => {
    const keys = items.map(keyOf);
    if (archived) restoreMedia(keys); else archiveMedia(keys);
    const n = items.length === 1 ? "1 file" : `${items.length} file`;
    toast.success(archived ? `${n} di nuovo in Foto e video` : `${n} in Archivio · ${pile.label}`);
    if (items.length === pile.shots.length) onClose(); else stop();
  };
  const del = async () => {
    setBusy(true);
    try {
      const urban = chosen.filter((s) => s.flow === "piazza"), vine = chosen.filter((s) => s.flow === "vigneto");
      if (urban.length) await removeMedia("urban", urban);
      if (vine.length) await removeMedia("vineyard", vine);
      toast.success(chosen.length === 1 ? "File eliminato" : `${chosen.length} file eliminati`);
      if (chosen.length === pile.shots.length) onClose(); else stop();
    } catch {
      toast.error("Eliminazione non riuscita: controlla la connessione e riprova");
    } finally { setBusy(false); setAsk(false); }
  };
  return (
    <div className="pile-open space-y-3 rounded-2xl bg-foreground/[0.05] p-3">
      <div className={`flex items-center gap-x-3 px-1 ${archived ? "flex-wrap gap-y-1.5" : ""}`}>
        <h4 className={`min-w-0 flex-1 text-sm font-semibold tabular-nums ${archived ? "basis-full" : ""}`}>{pile.label}<span className="ml-2 font-medium text-muted-foreground">{selecting ? (picked.size ? `${picked.size} scelti` : "Tocca per scegliere") : countText(pile.shots)}</span></h4>
        {selecting
          ? <>
              <button type="button" onClick={() => setPicked(all ? new Set() : new Set(pile.shots.map(keyOf)))} className="text-sm font-semibold text-foreground outline-none focus-visible:underline">{all ? "Nessuna" : "Tutte"}</button>
              <button type="button" onClick={stop} className="text-sm font-semibold text-muted-foreground outline-none focus-visible:underline">Annulla</button>
            </>
          : <>
              <button type="button" onClick={() => shelve(pile.shots)} className="inline-flex items-center gap-1 text-sm font-semibold text-foreground outline-none focus-visible:underline">{archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}{archived ? "Ripristina" : "Archivia"}</button>
              {archived && <SaveArchive compact shots={pile.shots} what={`il ${pile.label}`} zipName={`archivio-${pile.label.replace(/[^0-9a-z]+/gi, "-")}.zip`} />}
              {archived && <button type="button" onClick={() => { setPicked(new Set(pile.shots.map(keyOf))); setSelecting(true); setAsk(true); }} className="inline-flex items-center gap-1 text-sm font-semibold text-destructive outline-none focus-visible:underline"><Trash2 className="size-4" aria-hidden="true" />Elimina</button>}
              <button type="button" onClick={() => setSelecting(true)} className="text-sm font-semibold text-foreground outline-none focus-visible:underline">Seleziona</button>
              <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground outline-none focus-visible:underline">Chiudi</button>
            </>}
      </div>
      {/* The day's photos by the simulation's groups (Gruppo n, 20 a group), each one row that slides sideways (the card
          keeps its height however many there are; its own move, not the page's tabs). Opening deals them out of the pile. */}
      {!selecting && outOfSim.length > 0 && (
        <button type="button" onClick={() => { unhide(outOfSim.map(keyOf)); toast.success(outOfSim.length === 1 ? "1 file di nuovo nella simulazione" : `${outOfSim.length} file di nuovo nella simulazione`); }}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArchiveRestore className="size-4" aria-hidden="true" />Rimetti nella simulazione · {outOfSim.length}
        </button>
      )}
      {groups.map((g, gi) => (
      <section key={g.key} className="pile-group" style={{ animationDelay: `${Math.min(gi, 4) * 70}ms` }} aria-label={pile.group ? `${pile.label} · ${groupTitle(g)}` : groupTitle(g)}>
      <button type="button" aria-expanded={!folded.has(g.key)} onClick={() => setFolded((p) => { const n = new Set(p); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
        className="flex w-full items-center gap-2 px-1 py-1 text-left outline-none focus-visible:underline">
        {g.day ? <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 flex-1 text-sm font-semibold tabular-nums">{groupTitle(g)}<span className="ml-2 font-medium text-muted-foreground">{countText(g.shots)}</span></span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${folded.has(g.key) ? "-rotate-90" : ""}`} aria-hidden="true" />
      </button>
      <div className="pile-fold" data-folded={folded.has(g.key) || undefined}><div className="min-h-0">
      <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-3 px-3 py-1 touch-pan-x" data-map-gestures="">
        {g.shots.map((s, i) => <div key={keyOf(s)} className={`w-[7.5rem] shrink-0 snap-start sm:w-36 ${gi < 3 && i < 6 ? "pile-deal" : ""}`} style={gi < 3 && i < 6 ? { animationDelay: `${gi * 70 + i * 45}ms` } : undefined}>{selecting ? (
          <button type="button" role="checkbox" aria-checked={picked.has(keyOf(s))} aria-label={`${s.kind === "video" ? "Video" : "Foto"} ${s.name}`} onClick={() => flip(s)}
            className={`relative block aspect-square w-full overflow-hidden rounded-2xl bg-foreground/[0.08] outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${picked.has(keyOf(s)) ? "ring-2 ring-destructive" : "opacity-80"}`}>
            <ShotMedia s={s} />
            <span className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 ${picked.has(keyOf(s)) ? "border-destructive bg-destructive text-white" : "border-white bg-black/35"}`}>{picked.has(keyOf(s)) && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}</span>
          </button>
        ) : <Thumb s={s} onOpen={() => setViewing(pile.shots.indexOf(s))} />}</div>)}
      </div>
      </div></div>
      </section>
      ))}
      {viewing !== null && <ShotViewer shots={pile.shots} start={viewing} onClose={() => setViewing(null)} />}
      {selecting && (ask ? (
        <div role="alertdialog" aria-label="Conferma eliminazione" className="rounded-xl bg-destructive/10 p-3">
          <p className="text-sm font-medium">{chosen.length === 1 ? "Eliminare questo file?" : `Eliminare ${chosen.length} file?`} Non si possono recuperare.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsk(false)} disabled={busy} className="h-11 flex-1 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Annulla</button>
            <button type="button" onClick={() => void del()} disabled={busy} className="h-11 flex-1 rounded-full bg-destructive text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">{busy ? "Elimino…" : "Elimina"}</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => shelve(chosen)} disabled={!picked.size}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            {archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}{archived ? "Ripristina" : "Archivia"}{picked.size ? ` ${picked.size}` : ""}
          </button>
          <button type="button" onClick={() => setAsk(true)} disabled={!picked.size}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-destructive text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            <Trash2 className="size-4" aria-hidden="true" />Elimina{picked.size ? ` ${picked.size}` : ""}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * The archive: the photos and videos put away, as folders named by their day (gg/mm/aaaa) under month headings, newest
 * first, with a date field to go straight to one day; a folder opens like a pile, with Ripristina instead of Archivia.
 */
function ArchiveBlock({ shots: all, keys, defaultOpen = false }: { shots: Shot[]; keys: string[]; defaultOpen?: boolean }) {
  const { signedIn } = useSignedIn();
  const marks = useMediaArchive();
  const [open, setOpen] = useState(defaultOpen);
  const [day, setDay] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  // Sub-categories: one kind at a time (single photos, multiple shots, AI shots, videos), restored on their own too.
  const [kind, setKind] = useState<ShotKind | "tutti">("tutti");
  const shots = useMemo(() => (kind === "tutti" ? all : all.filter((s) => shotKind(s) === kind)), [all, kind]);
  const kindLabel = kind === "tutti" ? "" : ({ foto: "le foto", multiplo: "gli scatti multipli", ai: "quelle con l'AI", video: "i video" } as const)[kind];
  const piles = useMemo(() => pilesOf(shots), [shots]);
  const isoOf = (p: Pile) => { const s0 = p.shots[0]; if (!s0?.at) return ""; const d = new Date(s0.at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const list = day ? piles.filter((p) => isoOf(p) === day) : piles;
  const months: Array<{ name: string; piles: Pile[] }> = [];
  for (const p of list) {
    const at = p.shots[0]?.at;
    const name = at ? new Date(at).toLocaleDateString("it-IT", { month: "long", year: "numeric" }) : "Senza data";
    const last = months[months.length - 1];
    if (last?.name === name) last.piles.push(p); else months.push({ name, piles: [p] });
  }
  const current = piles.find((p) => p.key === shown) ?? null;
  return (
    <div className="rounded-2xl bg-foreground/[0.04]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
        <ArchiveIcon kind="foto" />
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Archivio foto e video</span><span className="block text-xs text-muted-foreground">{all.length ? `${piles.length === 1 ? "1 giorno" : `${piles.length} giorni`} · ${countText(shots)}` : `${keys.length === 1 ? "1 file" : `${keys.length} file`} archiviati`} · {signedIn ? "nell'account" : "su questo dispositivo"}</span></span>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          <KindPills shots={all} value={kind} onChange={(k) => { setKind(k); setShown(null); }} />
          <label className="flex items-center gap-2 rounded-xl bg-foreground/[0.06] px-3 py-2 text-sm">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="shrink-0 text-muted-foreground">Vai al giorno</span>
            <input type="date" lang="it" aria-label="Giorno gg/mm/aaaa" value={day} onChange={(e) => { setDay(e.target.value); setShown(null); }} className="min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none [color-scheme:dark]" />
            {day && <button type="button" onClick={() => setDay("")} className="shrink-0 text-xs font-semibold text-muted-foreground">Tutti</button>}
          </label>
          {list.length === 0 && <p className="px-1 text-sm text-muted-foreground">{shots.length ? "Niente in archivio per quel giorno." : "Le foto e i video archiviati non sono ancora caricati qui: puoi comunque rimetterli tutti nelle pile."}</p>}
          {!day && kind !== "tutti" && shots.length > 0 && (
            <button type="button" onClick={() => { restoreMedia(shots.map((s) => `${s.flow}-${s.id}`)); toast.success(`Ripristinati: ${countText(shots)}`); setKind("tutti"); }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArchiveRestore className="size-4" aria-hidden="true" />Ripristina {kindLabel} · {shots.length}
            </button>
          )}
          {!day && kind === "tutti" && (
            <button type="button" onClick={() => { restoreMedia(keys); toast.success("Archivio ripristinato: foto e video di nuovo nelle pile"); }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArchiveRestore className="size-4" aria-hidden="true" />Ripristina tutto · {keys.length === 1 ? "1 file" : `${keys.length} file`}
            </button>
          )}
          {!day && shots.length > 0 && <SaveArchive shots={shots} what={kind === "tutti" ? "tutto l'archivio" : kindLabel} zipName={`archivio${kind === "tutti" ? "" : `-${kind}`}-${new Date().toISOString().slice(0, 10)}.zip`} />}
          {!day && shots.length > 0 && <DeleteArchive shots={shots} what={kind === "tutti" ? "tutto l'archivio" : kindLabel} onDone={() => { setShown(null); if (kind !== "tutti") setKind("tutti"); }} />}
          {months.map((m) => (
            <div key={m.name}>
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{m.name}</p>
              <div className="overflow-hidden rounded-xl bg-foreground/[0.05]">
                {m.piles.map((p) => (
                  <Fragment key={p.key}>
                  <button type="button" aria-expanded={shown === p.key} onClick={() => setShown(shown === p.key ? null : p.key)}
                    className="flex w-full items-center gap-3 border-b border-foreground/[0.06] px-3 py-2.5 text-left outline-none last:border-0 focus-visible:bg-foreground/[0.06]">
                    <FolderClosed className="size-5 shrink-0 text-brand-turquoise" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold tabular-nums">{p.label}</span><span className="block text-xs tabular-nums text-muted-foreground">{archivedOn(p.shots.map((x) => marks[`${x.flow}-${x.id}`]))}</span></span>
                    <span className="text-right text-xs text-muted-foreground">{countText(p.shots)}</span>
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${shown === p.key ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {/* The folder opens right under itself, not at the end of the list. */}
                  {current?.key === p.key && <div className="border-b border-foreground/[0.06] p-2 last:border-0"><OpenPile key={current.key} pile={current} archived onClose={() => setShown(null)} /></div>}
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Photos and videos saved on the phone, in Download: one file as it is, several as one zip with a folder per day
 * (gg-mm-aaaa). Each file is fetched from where it is kept (the account or this device); onStep says how far it is.
 */
async function saveShots(shots: Shot[], zipName: string, onStep: (done: number) => void): Promise<number> {
  const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const got: Array<{ s: Shot; blob: Blob }> = [];
  let done = 0;
  for (let i = 0; i < shots.length; i += 4) {
    await Promise.all(shots.slice(i, i + 4).map(async (s) => {
      try { const r = await fetch(s.url); if (r.ok) got.push({ s, blob: await r.blob() }); } catch { /* resta fuori */ }
      onStep(++done);
    }));
  }
  if (!got.length) throw new Error("none");
  if (got.length === 1) { save(got[0]!.blob, got[0]!.s.name); return 1; }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const { s, blob } of got) {
    const d = s.at ? new Date(s.at) : null;
    const dir = d ? `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}` : "senza-data";
    let n = `${dir}/${s.name}`, k = 2;
    while (used.has(n)) n = `${dir}/${k++}-${s.name}`;
    used.add(n); zip.file(n, blob);
  }
  save(await zip.generateAsync({ type: "blob", compression: "STORE" }), zipName);
  return got.length;
}

/** "Salva sul telefono" for these archived photos and videos: a zip in Download (one file as it is), with progress. */
function SaveArchive({ shots, what, zipName, compact = false }: { shots: Shot[]; what: string; zipName: string; compact?: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const go = async () => {
    if (step !== null) return;
    setStep(0);
    try {
      const n = await saveShots(shots, zipName, setStep);
      const missed = shots.length - n;
      toast.success(n === 1 ? "File salvato in Download" : `Cartella zip salvata in Download · ${n} file`, missed ? { description: `${missed} file non raggiungibili: controlla la connessione e riprova.` } : undefined);
    } catch { toast.error("Salvataggio non riuscito: controlla la connessione e riprova"); }
    finally { setStep(null); }
  };
  const label = step !== null ? `Preparo ${step} di ${shots.length}…` : compact ? "Salva" : `Salva sul telefono ${what} · ${shots.length}`;
  return compact ? (
    <button type="button" onClick={() => void go()} disabled={step !== null} aria-label={step === null ? `Salva sul telefono ${what}` : undefined} className="inline-flex items-center gap-1 text-sm font-semibold text-foreground outline-none focus-visible:underline disabled:opacity-60"><Download className="size-4" aria-hidden="true" />{label}</button>
  ) : (
    <button type="button" onClick={() => void go()} disabled={step !== null} className="relative inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {step !== null && <span className="absolute inset-y-0 left-0 bg-brand-turquoise/25 transition-[width]" style={{ width: `${(step / Math.max(1, shots.length)) * 100}%` }} aria-hidden="true" />}
      <span className="relative inline-flex items-center gap-2"><Download className="size-4" aria-hidden="true" />{label}</span>
    </button>
  );
}

/**
 * The archive deleted for good (all of it, or only the chosen kind), after one confirm in place: from the account's
 * storage when uploaded, from the device otherwise (removeMedia, which also drops their archive marks).
 */
function DeleteArchive({ shots, what, onDone }: { shots: Shot[]; what: string; onDone: () => void }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAsk(false); }, [what]);
  const go = async () => {
    setBusy(true);
    try {
      const urban = shots.filter((s) => s.flow === "piazza"), vine = shots.filter((s) => s.flow === "vigneto");
      if (urban.length) await removeMedia("urban", urban);
      if (vine.length) await removeMedia("vineyard", vine);
      toast.success(`Eliminati dall'archivio: ${countText(shots)}`);
      setAsk(false);
      onDone();
    } catch (e) {
      const left = /not-deleted:(\d+)/.exec(e instanceof Error ? e.message : "")?.[1];
      toast.error(left ? `${left} file non eliminati: riprova` : "Eliminazione non riuscita: controlla la connessione e riprova");
    } finally { setBusy(false); }
  };
  return ask ? (
    <div role="alertdialog" aria-label="Eliminare l'archivio?" className="rounded-2xl bg-destructive/10 p-3.5 text-sm">
      <p className="font-semibold">Eliminare {what}?</p>
      <p className="mt-0.5 text-muted-foreground">{countText(shots)} archiviati vengono eliminati per sempre. Non si possono recuperare.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setAsk(false)} disabled={busy} className="h-10 flex-1 rounded-full bg-foreground/[0.08] font-semibold">Annulla</button>
        <button type="button" onClick={() => void go()} disabled={busy} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-destructive font-semibold text-white disabled:opacity-60"><Trash2 className="size-4" aria-hidden="true" />{busy ? "Elimino…" : `Elimina ${shots.length}`}</button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setAsk(true)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-destructive/15 text-sm font-semibold text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Trash2 className="size-4" aria-hidden="true" />Elimina {what} · {shots.length}
    </button>
  );
}

/**
 * Every photo and video shown (all days, or only the chosen kind) archived in one go, after one confirm in place;
 * nothing is deleted and the archive brings them back.
 */
function ArchiveAll({ shots, kind }: { shots: Shot[]; kind: ShotKind | "tutti" }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => { setAsk(false); }, [kind]);
  if (shots.length < 2) return null;
  const what = kind === "tutti" ? "tutto" : ({ foto: "le foto", multiplo: "gli scatti multipli", ai: "quelle con l'AI", video: "i video" } as const)[kind];
  const days = pilesOf(shots).length;
  const go = () => {
    archiveMedia(shots.map((s) => `${s.flow}-${s.id}`));
    setAsk(false);
    toast.success(`Archiviati: ${countText(shots)}`, { description: "Li ritrovi nell'Archivio, divisi per giorno." });
  };
  return ask ? (
    <div role="alertdialog" aria-label="Archiviare tutto?" className="rounded-2xl bg-foreground/[0.06] p-3.5 text-sm">
      <p className="font-semibold">Archiviare {what}?</p>
      <p className="mt-0.5 text-muted-foreground">{countText(shots)} di {days === 1 ? "1 giorno" : `${days} giorni`} vanno nell'Archivio. Non si cancella niente: li puoi ripristinare quando vuoi.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setAsk(false)} className="h-10 flex-1 rounded-full bg-foreground/[0.08] font-semibold">Annulla</button>
        <button type="button" onClick={go} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white font-semibold text-black"><Archive className="size-4" aria-hidden="true" />Archivia {shots.length}</button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setAsk(true)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Archive className="size-4" aria-hidden="true" />Archivia {what} · {shots.length}
    </button>
  );
}

/** The season and hour the simulation was set to, written out; older entries say they were not recorded. */
function WhenLine({ e }: { e: HistoryEntry }) {
  const w = whenOf(e);
  return (
    <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${w ? "text-foreground/80" : "text-muted-foreground"}`}>
      <Clock3 className="size-3.5" aria-hidden="true" />{w ? `Stagione ${SEASON_LABEL[w.season].toLowerCase()} · ore ${whenClock(w)}` : "Stagione e ora non registrate"}
    </p>
  );
}

/** One intervention: its time, what was set, the simulated season and hour, the place, where it is kept and "Apri". */
/**
 * Which office's piazza interventions the history shows: "Il mio ufficio", "Tutti gli uffici", then every office of the
 * list (and any other that recorded something), each with how many it has — one swipeable row, the chosen one revealed.
 */
function OfficeScopePills({ value, office, offices }: { value: OfficeScope; office: string; offices: Record<string, number> }) {
  const total = Object.values(offices).reduce((t, n) => t + n, 0);
  const names = [...new Set([...OFFICES.filter((o) => o !== "Altro"), ...Object.keys(offices)])].filter((o) => o !== office);
  const opts: Array<{ id: OfficeScope; label: string; n: number }> = [
    { id: "mine", label: `Il mio ufficio · ${office}`, n: offices[office] ?? 0 },
    { id: "all", label: "Tutti gli uffici", n: total },
    ...names.map((name) => ({ id: `office:${name}` as OfficeScope, label: name, n: offices[name] ?? 0 })),
  ];
  const row = useRef<HTMLDivElement>(null);
  // Bring the chosen pill into view by scrolling the row only: scrollIntoView also scrolled the page down to it,
  // so the dashboard opened at its history instead of its top.
  useEffect(() => {
    const r = row.current, a = r?.querySelector<HTMLElement>("[aria-checked=true]");
    if (!r || !a) return;
    if (a.offsetLeft < r.scrollLeft) r.scrollLeft = a.offsetLeft;
    else if (a.offsetLeft + a.offsetWidth > r.scrollLeft + r.clientWidth) r.scrollLeft = a.offsetLeft + a.offsetWidth - r.clientWidth;
  }, [value]);
  return (
    <div ref={row} role="radiogroup" aria-label="Uffici" data-map-gestures="" className="relative flex touch-pan-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {opts.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => setOfficeScope(o.id)}
          aria-label={`${o.label}: ${o.n === 1 ? "1 intervento" : `${o.n} interventi`}`}
          className={cn("inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full pl-4 pr-1.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", value === o.id ? "bg-foreground text-background" : "bg-foreground/[0.08] text-foreground/80")}>
          {o.label}
          {/* The count in a round badge of its own, so it stands out from the name. */}
          <span aria-hidden="true" className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold tabular-nums",
            value === o.id ? "bg-brand-turquoise text-black" : o.n ? "bg-brand-turquoise/20 text-brand-turquoise ring-1 ring-brand-turquoise/50" : "bg-foreground/10 text-foreground/50")}>{o.n}</span>
        </button>
      ))}
    </div>
  );
}

function EntryRow({ e }: { e: SourcedEntry }) {
  const t = time(e);
  const by = byOf(e);
  return (
    <div className="flex gap-3 py-3">
      <span className="w-12 shrink-0 text-sm tabular-nums text-muted-foreground" aria-label={`alle ${t}`}>{t}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] leading-snug">{e.text}</p>
        <WhenLine e={e} />
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.flow === "piazza" ? "Piazza" : "Vigneto"}{e.place ? ` · ${e.place}` : ""}</p>
        {by && <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{by.office}{by.role ? ` · ${by.role}` : ""} · Comune di {by.comune}</p>}
        <SourceChip source={e.source} />
      </div>
      <Link to="/cronologia/$id" params={{ id: e.id }} aria-label={`Apri: ${e.text}`}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 self-center rounded-full bg-foreground/[0.08] pl-3.5 pr-3 text-sm font-semibold outline-none hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring">
        Apri<ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Benvenuto: one tab per day, closed, with its date (gg/mm/aaaa), how many interventions, how many in the piazza and
 * in the vineyard and the span of hours; a tap opens that day's interventions under it.
 */
function DayTab({ label, items }: { label: string; items: SourcedEntry[] }) {
  const [open, setOpen] = useState(false);
  const piazza = items.filter((e) => e.flow === "piazza").length, vigneto = items.length - piazza;
  const first = time(items[items.length - 1]!), last = time(items[0]!);
  const parts = [piazza ? `Piazza ${piazza}` : "", vigneto ? `Vigneto ${vigneto}` : ""].filter(Boolean).join(" · ");
  return (
    <DashCard className="py-1 sm:py-1">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-2xl py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tabular-nums">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">{items.length === 1 ? "1 intervento" : `${items.length} interventi`} · {parts} · {first === last ? first : `${first}–${last}`}</span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="divide-y divide-foreground/10 border-t border-foreground/10">{items.map((e) => <EntryRow key={e.id} e={e} />)}</div>}
    </DashCard>
  );
}

const entriesText = (n: number) => (n === 1 ? "1 intervento" : `${n} interventi`);

/** The interventions as a table for the phone (CSV, ; separated, opens in a spreadsheet), saved in Download. */
function saveEntries(items: SourcedEntry[], marks: Record<string, string>, name: string) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [["Data", "Ora", "Progetto", "Luogo", "Intervento", "Stagione e ora simulate", "Salvato", "Archiviato il"]];
  for (const e of sortNewest(items)) {
    const w = whenOf(e);
    rows.push([dayOf(e.at), time(e), e.flow === "piazza" ? "Piazza" : "Vigneto", e.place, e.text, w ? `${SEASON_LABEL[w.season]}, ore ${whenClock(w)}` : "", e.source === "account" ? "Account" : "Dispositivo", marks[e.id] ? dayOf(marks[e.id]!) : ""]);
  }
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const sortNewest = (items: SourcedEntry[]) => [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/** A red action that asks once in place before deleting for good. */
function ConfirmDelete({ label, title, body, run, compact = false }: { label: string; title: string; body: string; run: () => Promise<boolean>; compact?: boolean }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { if (await run()) setAsk(false); } finally { setBusy(false); } };
  if (ask) return (
    <div role="alertdialog" aria-label={title} className="w-full basis-full rounded-2xl bg-destructive/10 p-3.5 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-muted-foreground">{body} Non si possono recuperare.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setAsk(false)} disabled={busy} className="h-10 flex-1 rounded-full bg-foreground/[0.08] font-semibold">Annulla</button>
        <button type="button" onClick={() => void go()} disabled={busy} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-destructive font-semibold text-white disabled:opacity-60"><Trash2 className="size-4" aria-hidden="true" />{busy ? "Elimino…" : "Elimina"}</button>
      </div>
    </div>
  );
  return compact
    ? <button type="button" onClick={() => setAsk(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-destructive outline-none focus-visible:underline"><Trash2 className="size-4" aria-hidden="true" />{label}</button>
    : <button type="button" onClick={() => setAsk(true)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-destructive/15 text-sm font-semibold text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-4" aria-hidden="true" />{label}</button>;
}

const deleteEntries = async (items: SourcedEntry[]) => {
  const ok = await removeHistory(items.map((e) => e.id));
  if (ok) toast.success(items.length === 1 ? "Intervento eliminato" : `${items.length} interventi eliminati`);
  else toast.error("Eliminati da questo dispositivo, non dal tuo account: controlla la connessione e riprova");
  return ok;
};

/** Every intervention shown archived in one go, after one confirm in place; nothing is deleted. */
function ArchiveAllEntries({ items }: { items: SourcedEntry[] }) {
  const [ask, setAsk] = useState(false);
  if (items.length < 2) return null;
  const days = groupByDay(items).length;
  return ask ? (
    <div role="alertdialog" aria-label="Archiviare tutti gli interventi?" className="rounded-2xl bg-foreground/[0.06] p-3.5 text-sm">
      <p className="font-semibold">Archiviare tutti gli interventi?</p>
      <p className="mt-0.5 text-muted-foreground">{entriesText(items.length)} di {days === 1 ? "1 giorno" : `${days} giorni`} vanno nell'Archivio. Non si cancella niente: li puoi ripristinare quando vuoi.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setAsk(false)} className="h-10 flex-1 rounded-full bg-foreground/[0.08] font-semibold">Annulla</button>
        <button type="button" onClick={() => { archiveHistory(items.map((e) => e.id)); setAsk(false); toast.success(`Archiviati: ${entriesText(items.length)}`, { description: "Li ritrovi nell'Archivio degli interventi, divisi per giorno." }); }}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white font-semibold text-black"><Archive className="size-4" aria-hidden="true" />Archivia {items.length}</button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setAsk(true)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Archive className="size-4" aria-hidden="true" />Archivia tutti gli interventi · {items.length}
    </button>
  );
}

/** One archived day opened: its interventions, with Ripristina, Salva, Elimina and a selection, like a photo folder. */
function ArchivedDay({ label, items, onClose }: { label: string; items: SourcedEntry[]; onClose: () => void }) {
  const marks = useHistoryArchive();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chosen = items.filter((e) => picked.has(e.id));
  const stop = () => { setSelecting(false); setPicked(new Set()); };
  const restore = (list: SourcedEntry[]) => {
    restoreHistory(list.map((e) => e.id));
    toast.success(`${entriesText(list.length)} di nuovo nella cronologia`);
    if (list.length === items.length) onClose(); else stop();
  };
  const all = picked.size === items.length;
  return (
    <div className="pile-open space-y-2 rounded-2xl bg-foreground/[0.05] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        <h4 className="min-w-0 basis-full text-sm font-semibold tabular-nums">{label}<span className="ml-2 font-medium text-muted-foreground">{selecting ? (picked.size ? `${picked.size} scelti` : "Tocca per scegliere") : [entriesText(items.length), archivedOn(items.map((e) => marks[e.id]), "archiviati")].filter(Boolean).join(" · ")}</span></h4>
        {selecting ? <>
          <button type="button" onClick={() => setPicked(all ? new Set() : new Set(items.map((e) => e.id)))} className="text-sm font-semibold outline-none focus-visible:underline">{all ? "Nessuno" : "Tutti"}</button>
          <button type="button" onClick={stop} className="text-sm font-semibold text-muted-foreground outline-none focus-visible:underline">Annulla</button>
        </> : <>
          <button type="button" onClick={() => restore(items)} className="inline-flex items-center gap-1 text-sm font-semibold outline-none focus-visible:underline"><ArchiveRestore className="size-4" aria-hidden="true" />Ripristina</button>
          <button type="button" onClick={() => { saveEntries(items, marks, `archivio-interventi-${label.replace(/\//g, "-")}.csv`); toast.success("Tabella salvata in Download"); }} className="inline-flex items-center gap-1 text-sm font-semibold outline-none focus-visible:underline"><Download className="size-4" aria-hidden="true" />Salva</button>
          <ConfirmDelete compact label="Elimina" title={`Eliminare gli interventi del ${label}?`} body={`${entriesText(items.length)} archiviati vengono eliminati per sempre.`} run={async () => { const ok = await deleteEntries(items); if (ok) onClose(); return ok; }} />
          <button type="button" onClick={() => setSelecting(true)} className="text-sm font-semibold outline-none focus-visible:underline">Seleziona</button>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground outline-none focus-visible:underline">Chiudi</button>
        </>}
      </div>
      <div className="divide-y divide-foreground/10 rounded-xl bg-foreground/[0.03] px-3">
        {items.map((e) => selecting ? (
          <button key={e.id} type="button" role="checkbox" aria-checked={picked.has(e.id)} onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
            className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:bg-foreground/[0.06]">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${picked.has(e.id) ? "border-destructive bg-destructive text-white" : "border-foreground/40"}`}>{picked.has(e.id) && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}</span>
            <span className="w-12 shrink-0 text-sm tabular-nums text-muted-foreground">{time(e)}</span>
            <span className="min-w-0 flex-1 break-words text-[15px] leading-snug">{e.text}</span>
          </button>
        ) : <EntryRow key={e.id} e={e} />)}
      </div>
      {selecting && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => restore(chosen)} disabled={!picked.size} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold disabled:opacity-40"><ArchiveRestore className="size-4" aria-hidden="true" />Ripristina{picked.size ? ` ${picked.size}` : ""}</button>
          {picked.size > 0
            ? <div className="flex-1"><ConfirmDelete label={`Elimina ${picked.size}`} title={chosen.length === 1 ? "Eliminare questo intervento?" : `Eliminare ${chosen.length} interventi?`} body="Vengono eliminati per sempre." run={async () => { const ok = await deleteEntries(chosen); if (ok) { if (chosen.length === items.length) onClose(); else stop(); } return ok; }} /></div>
            : <button type="button" disabled className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-destructive/15 text-sm font-semibold text-destructive opacity-40"><Trash2 className="size-4" aria-hidden="true" />Elimina</button>}
        </div>
      )}
    </div>
  );
}

/**
 * The interventions' archive, built like the photos' one: folded "n giorni · n interventi", open a "Vai al giorno"
 * field, Ripristina tutto, Salva sul telefono (a table), Elimina tutto l'archivio, then folders by day under month
 * headings (each with the date it was archived), opening into ArchivedDay.
 */
function HistoryArchiveBlock({ items, defaultOpen = false }: { items: SourcedEntry[]; defaultOpen?: boolean }) {
  const { signedIn } = useSignedIn();
  const marks = useHistoryArchive();
  const [open, setOpen] = useState(defaultOpen);
  const [day, setDay] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const days = useMemo(() => groupByDay(items), [items]);
  const isoOf = (at: string) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const list = day ? days.filter((g) => isoOf(g.items[0]!.at) === day) : days;
  const months: Array<{ name: string; days: typeof days }> = [];
  for (const g of list) {
    const name = new Date(g.items[0]!.at).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const last = months[months.length - 1];
    if (last?.name === name) last.days.push(g); else months.push({ name, days: [g] });
  }
  const current = days.find((g) => g.key === shown) ?? null;
  return (
    <div className="rounded-2xl bg-foreground/[0.04]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArchiveIcon kind="interventi" />
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Archivio interventi</span><span className="block text-xs text-muted-foreground">{days.length === 1 ? "1 giorno" : `${days.length} giorni`} · {entriesText(items.length)} · {signedIn ? "nell'account" : "su questo dispositivo"}</span><span className="block text-xs tabular-nums text-muted-foreground">{archivedOn(items.map((e) => marks[e.id]), "Archiviati")}</span></span>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          <label className="flex items-center gap-2 rounded-xl bg-foreground/[0.06] px-3 py-2 text-sm">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="shrink-0 text-muted-foreground">Vai al giorno</span>
            <input type="date" lang="it" aria-label="Giorno gg/mm/aaaa" value={day} onChange={(e) => { setDay(e.target.value); setShown(null); }} className="min-w-0 flex-1 bg-transparent text-right font-semibold tabular-nums outline-none [color-scheme:dark]" />
            {day && <button type="button" onClick={() => setDay("")} className="shrink-0 text-xs font-semibold text-muted-foreground">Tutti</button>}
          </label>
          {list.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nessun intervento in archivio per quel giorno.</p>}
          {!day && <>
            <button type="button" onClick={() => { restoreHistory(items.map((e) => e.id)); toast.success("Archivio ripristinato: interventi di nuovo nella cronologia"); }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArchiveRestore className="size-4" aria-hidden="true" />Ripristina tutto · {entriesText(items.length)}
            </button>
            <button type="button" onClick={() => { saveEntries(items, marks, `archivio-interventi-${new Date().toISOString().slice(0, 10)}.csv`); toast.success(`Tabella salvata in Download · ${entriesText(items.length)}`); }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Download className="size-4" aria-hidden="true" />Salva sul telefono · {entriesText(items.length)}
            </button>
            <ConfirmDelete label={`Elimina tutto l'archivio · ${items.length}`} title="Eliminare tutto l'archivio degli interventi?" body={`${entriesText(items.length)} archiviati vengono eliminati per sempre${signedIn ? ", anche dal tuo account" : ""}.`} run={() => deleteEntries(items)} />
          </>}
          {months.map((m) => (
            <div key={m.name}>
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{m.name}</p>
              <div className="overflow-hidden rounded-xl bg-foreground/[0.05]">
                {m.days.map((g) => (
                  <Fragment key={g.key}>
                  <button type="button" aria-expanded={shown === g.key} onClick={() => setShown(shown === g.key ? null : g.key)}
                    className="flex w-full items-center gap-3 border-b border-foreground/[0.06] px-3 py-2.5 text-left outline-none last:border-0 focus-visible:bg-foreground/[0.06]">
                    <FolderClosed className="size-5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" />
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold tabular-nums">{g.label}</span><span className="block text-xs tabular-nums text-muted-foreground">{archivedOn(g.items.map((e) => marks[e.id]), "Archiviato")}</span></span>
                    <span className="text-right text-xs text-muted-foreground">{entriesText(g.items.length)}</span>
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${shown === g.key ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {/* The day opens right under its own folder, not at the end of the list. */}
                  {current?.key === g.key && <div className="border-b border-foreground/[0.06] p-2 last:border-0"><ArchivedDay key={current.key} label={current.label} items={current.items} onClose={() => setShown(null)} /></div>}
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The archive alone, on its own page (/archivio, from Benvenuto's "Archivio · … · tocca per recuperarle"): only the
 * archived photos and videos, already open, never the interventions. Identified, only that profile's project.
 */
export function ArchiveOnly() {
  const proId = useProId();
  const flow: HistoryFlow | undefined = proId ? (proId.kind === "funzionario" ? "piazza" : "vigneto") : undefined;
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  const archive = useMediaArchive();
  useEffect(() => { void currentMedia("urban"); void currentMedia("vineyard"); }, []);
  // The account's files could not be read: said plainly with the reason and a retry, never an empty silence.
  const urbanError = useMediaListError("urban"), vineError = useMediaListError("vineyard");
  const [retrying, setRetrying] = useState(false);
  const retryMedia = async () => { setRetrying(true); try { await Promise.all([refreshMedia("urban"), refreshMedia("vineyard")]); } finally { setRetrying(false); } };
  const inFlow = (f: HistoryFlow) => !flow || f === flow;
  const shots = useMemo<Shot[]>(() => [
    ...urban.map((m): Shot => ({ ...m, flow: "piazza", at: mediaTime(m) })),
    ...vineyard.map((m): Shot => ({ ...m, flow: "vigneto", at: mediaTime(m) })),
  ].filter((s) => inFlow(s.flow) && archive[`${s.flow}-${s.id}`]).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)), [urban, vineyard, archive, flow]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = Object.keys(archive).filter((k) => inFlow(k.startsWith("vigneto-") ? "vigneto" : "piazza"));
  const { entries: history } = useHistory();
  const hArch = useHistoryArchive();
  const archivedEntries = history.filter((e) => inFlow(e.flow) && hArch[e.id]);
  if (keys.length === 0 && archivedEntries.length === 0) return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-foreground/[0.04] px-6 py-10 text-center">
      <Archive className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-semibold">L'archivio è vuoto</p>
      <p className="text-sm text-muted-foreground">Gli interventi, le foto e i video che archivi dalla cronologia finiscono qui, divisi per giorno.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {(urbanError || vineError) && keys.length > 0 && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm ring-1 ring-amber-500/30">
          <span className="flex-1">Non riesco a leggere le foto e i video del tuo account</span>
          <button type="button" onClick={() => void retryMedia()} disabled={retrying} className="h-9 shrink-0 rounded-full bg-foreground/10 px-3 text-sm font-semibold disabled:opacity-60">{retrying ? "Riprovo…" : "Riprova"}</button>
        </div>
      )}
      {archivedEntries.length > 0 && <HistoryArchiveBlock items={archivedEntries} defaultOpen />}
      {keys.length > 0 && <ArchiveBlock shots={shots} keys={keys} defaultOpen />}
    </div>
  );
}

/** Recorded signed in (kept in the account) or without signing in (kept on this device). */
export function SourceChip({ source }: { source: HistorySource }) {
  const account = source === "account";
  const Icon = account ? Cloud : Smartphone;
  return (
    <span className={`mt-1.5 inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${account ? "bg-brand-turquoise/15 text-brand-turquoise" : "bg-foreground/[0.08] text-muted-foreground"}`}>
      <Icon className="size-3.5" aria-hidden="true" />{account ? "Con accesso · account" : "Senza accesso · dispositivo"}
    </span>
  );
}

type Filter = "tutti" | HistoryFlow;
const FILTERS = [
  { id: "tutti", label: "Tutti", icon: History },
  { id: "piazza", label: "Piazza", icon: Building2 },
  { id: "vigneto", label: "Vigneto", icon: Grape },
] as const;
const OF: Record<HistoryFlow, string> = { piazza: "della piazza", vigneto: "del vigneto" };
/** On Benvenuto: the latest interventions and photos only; the Cronologia page shows them all. */
const COMPACT_DAYS = 5, COMPACT_SHOTS = 12;

/**
 * The history of the interventions (and the photos and videos of the simulations), shared by Benvenuto (compact: the
 * latest few, then "Apri la cronologia") and the Cronologia page (all of it, filtered by place, with "Cancella cronologia").
 * Each entry offers "Apri", which opens it on its own page to read (/cronologia/$id). Signed in it lives in the account, otherwise on this device.
 */
export function HistoryBlock({ compact = false, flow: asked }: { compact?: boolean; flow?: HistoryFlow }) {
  const { entries: all, otherOffices, offices, where, loading, failed, reload } = useHistory();
  const officeScope = useOfficeScope();
  // Identified, the history is that profile's project only: the piazza for the municipal officer, the vineyard for the agronomist.
  const proId = useProId();
  const flow: HistoryFlow | undefined = asked ?? (proId ? (proId.kind === "funzionario" ? "piazza" : "vigneto") : undefined);
  const [chosen, setFilter] = useState<Filter>("tutti");
  const filter: Filter = flow ?? chosen;
  // Only the full page without a profile has the filter to swipe: otherwise the swipe listens to a ref that stays empty.
  const area = useRef<HTMLDivElement>(null), none = useRef<HTMLDivElement>(null);
  const swipe = useTabSwipe(FILTERS.map((f) => f.id), filter, setFilter, compact || flow ? none : area);
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  // On the Cronologia page the photos and videos can be seen one kind at a time.
  const [shotFilter, setShotFilter] = useState<ShotKind | "tutti">("tutti");
  // Per gruppo by default (the simulation's groups, whole even when loaded over several days), kept on this device.
  const [pileView, setPileView] = useState<PileView>("gruppo");
  useEffect(() => { try { if (localStorage.getItem(PILE_VIEW_KEY) === "giorno") setPileView("giorno"); } catch { /* default */ } }, []);
  const choosePileView = (v: PileView) => { setPileView(v); try { localStorage.setItem(PILE_VIEW_KEY, v); } catch { /* this time only */ } };
  useEffect(() => { setConfirm(false); }, [filter]);
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  const archive = useMediaArchive();
  const hArch = useHistoryArchive();
  useEffect(() => { void currentMedia("urban"); void currentMedia("vineyard"); }, []);
  // The account's files could not be read: said plainly with the reason and a retry, never an empty silence.
  const urbanError = useMediaListError("urban"), vineError = useMediaListError("vineyard");
  const [retrying, setRetrying] = useState(false);
  const retryMedia = async () => { setRetrying(true); try { await Promise.all([refreshMedia("urban"), refreshMedia("vineyard")]); } finally { setRetrying(false); } };
  const allShots = useMemo<Shot[]>(() => [
    ...urban.map((m): Shot => ({ ...m, flow: "piazza", at: mediaTime(m) })),
    ...vineyard.map((m): Shot => ({ ...m, flow: "vigneto", at: mediaTime(m) })),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)), [urban, vineyard]);
  // One project only with a profile (or on the dashboard); otherwise everything on Benvenuto and the filter tab on the Cronologia page.
  const shownIn = (f: Filter) => (fl: HistoryFlow) => (flow ? fl === flow : compact || f === "tutti" || f === fl);
  // Archived interventions leave the day cards for their own archive.
  const entries = all.filter((e) => shownIn(filter)(e.flow) && !hArch[e.id]);
  // The photos and interventions of one filter tab: the open one, and the one peeking beside it while swiping.
  const list = (f: Filter) => {
    const shown = shownIn(f);
    const inTabAll = all.filter((e) => shown(e.flow));
    const inTab = inTabAll.filter((e) => !hArch[e.id]);
    const archivedEntries = inTabAll.filter((e) => hArch[e.id]);
    const inFlow = allShots.filter((s) => shown(s.flow));
    const shots = inFlow.filter((s) => !archive[`${s.flow}-${s.id}`]);
    const archivedAll = inFlow.filter((s) => archive[`${s.flow}-${s.id}`]);
    const archivedShots = compact ? [] : archivedAll;
    // Every archived key of this tab, even for files not loaded (yet) on this device, so the archive can always be restored.
    const archKeys = Object.keys(archive).filter((k) => shown(k.startsWith("vigneto-") ? "vigneto" : "piazza"));
    const groups = compact ? groupByDay(inTab).slice(0, COMPACT_DAYS) : groupByDay(inTab);
    const ofKind = compact || shotFilter === "tutti" ? shots : shots.filter((s) => shotKind(s) === shotFilter);
    const visibleShots = compact ? shots.slice(0, COMPACT_SHOTS) : ofKind;
    return (
      <>
        {(flow !== "vigneto" && urbanError || flow !== "piazza" && vineError) && (
          <div role="alert" className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm ring-1 ring-amber-500/30">
            <span className="flex-1">Non riesco a leggere le foto e i video del tuo account<span className="block text-xs text-muted-foreground">{urbanError ?? vineError} · riprovo da solo tra poco</span></span>
            <button type="button" onClick={() => void retryMedia()} disabled={retrying} className="h-9 shrink-0 rounded-full bg-foreground/10 px-3 text-sm font-semibold disabled:opacity-60">{retrying ? "Riprovo…" : "Riprova"}</button>
          </div>
        )}
        {shots.length > 0 && (
          <div className="space-y-2">
            <h3 className="px-1 text-sm font-medium text-muted-foreground">Foto e video{compact && shots.length > visibleShots.length ? ` · ultimi ${visibleShots.length} di ${shots.length}` : ` · ${countText(shots)}`}</h3>
            {!compact && <KindPills shots={shots} value={shotFilter} onChange={setShotFilter} />}
            {!compact && <PileViewSwitch value={pileView} onChange={choosePileView} />}
            {!compact && <ArchiveAll shots={visibleShots} kind={shotFilter} />}
            <PhotoPiles shots={visibleShots} by={compact ? "giorno" : pileView} />
          </div>
        )}
        {!compact && archKeys.length > 0 && <ArchiveBlock shots={archivedShots} keys={archKeys} />}
        {!compact && archivedEntries.length > 0 && <HistoryArchiveBlock items={archivedEntries} />}
        {compact && archivedEntries.length > 0 && (
          <Link to="/archivio" onClick={() => rememberBack("/archivio")} className="flex items-center gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArchiveIcon kind="interventi" small />
            <span className="flex-1 text-sm"><span className="font-semibold">Archivio interventi</span><span className="text-muted-foreground"> · {entriesText(archivedEntries.length)} · tocca per recuperarli</span></span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
        {compact && archKeys.length > 0 && (
          <Link to="/archivio" onClick={() => rememberBack("/archivio")} className="flex items-center gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArchiveIcon kind="foto" small />
            <span className="flex-1 text-sm"><span className="font-semibold">Archivio foto e video</span><span className="text-muted-foreground"> · {archivedAll.length ? countText(archivedAll) : `${archKeys.length} file`} · tocca per recuperarle</span></span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
        {!compact && <ArchiveAllEntries items={inTab} />}
        {groups.length === 0 ? visibleShots.length > 0 ? null : (
          <DashCard className="flex flex-col items-center gap-2 py-8 text-center">
            <History className="size-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-[15px] font-medium">{loading ? "Carico la cronologia…" : archivedEntries.length ? "Gli interventi sono tutti nell'archivio" : f === "tutti" ? "Ancora nessun intervento" : `Ancora nessun intervento ${f === "piazza" ? "nella piazza" : "nel vigneto"}`}</p>
            {!loading && !archivedEntries.length && <p className="max-w-xs text-sm text-muted-foreground">Quando cambi alberi, aiuole, ombra o irrigazione nella simulazione, l’intervento si registra da solo e lo trovi qui, con foto e video.</p>}
          </DashCard>
        ) : groups.map((g) => compact
          ? <DayTab key={g.key} label={g.label} items={g.items} />
          : (
          <div key={g.key} className="space-y-2">
            {/* One card per day: its date on top (with Archivia for the whole day), then each intervention of that day with its time. */}
            <div className="flex items-center gap-3 px-1">
              <h3 className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-foreground/90">{g.label}<span className="ml-2 font-medium text-muted-foreground">{entriesText(g.items.length)}</span></h3>
              <button type="button" onClick={() => { archiveHistory(g.items.map((e) => e.id)); toast.success(`${entriesText(g.items.length)} in Archivio · ${g.label}`); }}
                className="inline-flex items-center gap-1 text-sm font-semibold outline-none focus-visible:underline"><Archive className="size-4" aria-hidden="true" />Archivia</button>
            </div>
            <DashCard className="divide-y divide-foreground/10 py-1 sm:py-1">
              {g.items.map((e) => <EntryRow key={e.id} e={e} />)}
            </DashCard>
          </div>
        ))}
      </>
    );
  };
  const more = compact && (entries.length > 0 || allShots.length > COMPACT_SHOTS);
  const clear = async () => {
    setClearing(true);
    // The archive is kept: with archived entries in this tab only the others go.
    // Only the shown entries go when the archive or other offices' entries are kept.
    const keepArchive = all.some((e) => shownIn(filter)(e.flow) && hArch[e.id]) || (officeScope !== "all" && otherOffices > 0);
    const ok = keepArchive ? await removeHistory(entries.map((e) => e.id)) : await clearHistory(filter === "tutti" ? undefined : filter);
    setClearing(false);
    setConfirm(false);
    reload();
    if (ok) toast.success(filter === "tutti" ? "Cronologia cancellata" : `Cronologia ${OF[filter]} cancellata`);
    else toast.error("Cancellata da questo dispositivo, non dal tuo account: riprova più tardi");
  };
  return (
    <DashSection title={flow ? `Cronologia ${flow === "piazza" ? "della piazza" : "del vigneto"}` : compact ? "Cronologia" : "Tutti gli interventi"} hint={where === "account" ? (all.some((e) => e.source === "device") ? "Account e questo dispositivo" : "Salvata nel tuo account") : "Salvata su questo dispositivo"}>
      <div ref={area} className="space-y-3">
      {!compact && !flow && <TabRow label="Luogo" items={FILTERS} value={filter} onChange={(v) => setFilter(v as Filter)} />}
      {/* A municipal officer: the interventions of the office in use, or of every office of the account. */}
      {proId?.kind === "funzionario" && flow !== "vigneto" && <OfficeScopePills value={officeScope} office={proId.office} offices={offices} />}
      {/* Tutti · Piazza · Vigneto turn with a sideways swipe on the list, like the tutorial's screens. */}
      <div ref={swipe.ref} style={swipe.style} className="relative space-y-3">
      {failed && <DashCard><p className="text-sm text-muted-foreground">Non riesco a leggere la cronologia del tuo account. Vedi solo quella di questo dispositivo.</p></DashCard>}
      {list(filter)}
      {more && (
        <Link to="/cronologia" onClick={() => rememberBack("/cronologia")} className="flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Apri la cronologia{entries.length > 0 ? ` · ${entries.length} ${entries.length === 1 ? "intervento" : "interventi"}` : ""}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
      {!compact && entries.length > 0 && (
        // Only where this tab lists interventions, and it empties just those (all of them on Tutti).
        // Asks once in place (no browser dialog): the account's history is gone for good.
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2" role={confirm ? "alertdialog" : undefined} aria-label={confirm ? "Cancellare la cronologia?" : undefined}>
          {confirm ? (
            <>
              <span className="w-full text-center text-sm text-muted-foreground">{`Cancello ${filter === "tutti" ? "tutta la cronologia" : `la cronologia ${OF[filter]}`}${where === "account" ? ", anche dal tuo account" : " di questo dispositivo"}?`}</span>
              <button type="button" onClick={() => setConfirm(false)} disabled={clearing} className="inline-flex h-10 items-center rounded-full bg-foreground/[0.08] px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Annulla</button>
              <button type="button" onClick={() => void clear()} disabled={clearing} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-danger px-4 text-sm font-semibold text-danger-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                <Trash2 className="size-4" aria-hidden="true" />{clearing ? "Cancello…" : "Cancella"}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <Trash2 className="size-4" aria-hidden="true" />{filter === "tutti" ? "Cancella cronologia" : `Cancella cronologia ${OF[filter]}`}
            </button>
          )}
        </div>
      )}
      {swipe.peek && <div aria-hidden="true" className="!mt-0 space-y-3" style={peekStyle(swipe.peekSide, swipe.peekTop)}>{list(swipe.peek)}</div>}
      </div>
      </div>
    </DashSection>
  );
}
