import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Building2, CalendarDays, Check, Share2, ChevronDown, Clock3, Cloud, Smartphone, Grape, History, Archive, ArchiveRestore, FolderClosed, Play, Trash2 } from "lucide-react";
import { currentMedia, removeMedia, useLabMedia, type MediaItem } from "@/models/lab-media-store";
import { mediaTime } from "@/models/media-time";
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
import { clearHistory, useHistory } from "@/lib/use-history";
import { groupByDay, whenClock, whenOf, type HistoryEntry, type HistoryFlow, type HistorySource, type SourcedEntry } from "@/models/intervention-history";

/** When the intervention was made, on this device's clock: "09:12". */
const time = (e: HistoryEntry) => new Date(e.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

type Shot = MediaItem & { flow: "piazza" | "vigneto"; at: number | null };

/**
 * A photo, or a video's first frame, with a turning ring while it loads; the picture fades in once it is there.
 * A picture already in the browser's memory shows at once (checked on mount, as its load may come before React).
 */
function ShotMedia({ s }: { s: Shot }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fade = `size-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`;
  return (
    <>
      {!ready && !failed && (
        <span className="absolute inset-0 grid place-items-center" role="status" aria-label="Caricamento">
          <span className="size-8 animate-spin rounded-full border-[3px] border-white/15 border-t-brand-turquoise motion-reduce:animate-none" />
        </span>
      )}
      {s.kind === "video"
        ? <video ref={(v) => { if (v && v.readyState >= 2) setReady(true); }} src={`${s.url}#t=0.1`} preload="metadata" muted playsInline
            onLoadedData={() => setReady(true)} onError={() => setFailed(true)} className={`pointer-events-none ${fade}`} />
        : <img ref={(i) => { if (i?.complete && i.naturalWidth) setReady(true); }} src={s.url} alt="" loading="lazy"
            onLoad={() => setReady(true)} onError={() => setFailed(true)} className={fade} />}
    </>
  );
}

function Thumb({ s, onOpen }: { s: Shot; onOpen: () => void }) {
  const when = s.at ? new Date(s.at).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "";
  return (
    <button type="button" onClick={onOpen} aria-label={`Apri ${s.kind === "video" ? "il video" : "la foto"} ${s.flow}${when ? `, ${when}` : ""}`} className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-foreground/[0.08] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ShotMedia s={s} />
      {s.kind === "video" && <span className="absolute inset-0 grid place-items-center"><Play className="size-7 text-white drop-shadow" aria-hidden="true" /></span>}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-5 text-xs text-white">{s.flow === "piazza" ? "Piazza" : "Vigneto"}{when ? ` · ${when}` : ""}</span>
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
          {s.kind === "image" && <img src={s.url} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-2xl" />}
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
            <span className="shrink-0 rounded-full bg-foreground/[0.07] px-3 py-1.5 text-[12.5px]">{s.flow === "piazza" ? "Piazza" : "Vigneto"} · {s.kind === "video" ? "video" : "foto"}</span>
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
type Pile = { key: string; label: string; shots: Shot[] };
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
const countText = (shots: Shot[]) => {
  const v = shots.filter((s) => s.kind === "video").length, f = shots.length - v;
  return [f ? `${f} foto` : "", v ? `${v} ${v === 1 ? "video" : "video"}` : ""].filter(Boolean).join(" · ");
};

/** One picture of a pile: the photo, or the video's first frame with a play mark. */
function PileCard({ s, className, style }: { s: Shot; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`absolute inset-0 overflow-hidden rounded-2xl bg-[oklch(0.27_0.016_258)] shadow-[0_6px_18px_rgb(0_0_0/0.45)] ring-1 ring-white/10 ${className ?? ""}`} style={style}>
      <ShotMedia s={s} />
      {s.kind === "video" && <span className="absolute inset-0 grid place-items-center"><Play className="size-7 text-white drop-shadow" aria-hidden="true" /></span>}
    </span>
  );
}

/**
 * The photos and videos stacked one on the other like a pile of prints, one pile per day (the newest on top, the next
 * two peeking out turned a little), with the date and how many; a tap spreads that day's pile into its grid.
 */
function PhotoPiles({ shots }: { shots: Shot[] }) {
  const piles = useMemo(() => pilesOf(shots), [shots]);
  const [open, setOpen] = useState<string | null>(null);
  const shown = piles.find((p) => p.key === open) ?? null;
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4">
        {piles.map((p) => {
          const [top, second, third] = p.shots;
          const isOpen = open === p.key;
          return (
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
              <span className="block px-1 text-xs text-muted-foreground">{countText(p.shots)}</span>
            </button>
          );
        })}
      </div>
      {shown && <OpenPile key={shown.key} pile={shown} onClose={() => setOpen(null)} />}
    </>
  );
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
    <div className="space-y-3 rounded-2xl bg-foreground/[0.05] p-3">
      <div className="flex items-center gap-3 px-1">
        <h4 className="min-w-0 flex-1 text-sm font-semibold tabular-nums">{pile.label}<span className="ml-2 font-medium text-muted-foreground">{selecting ? (picked.size ? `${picked.size} scelti` : "Tocca per scegliere") : countText(pile.shots)}</span></h4>
        {selecting
          ? <>
              <button type="button" onClick={() => setPicked(all ? new Set() : new Set(pile.shots.map(keyOf)))} className="text-sm font-semibold text-foreground outline-none focus-visible:underline">{all ? "Nessuna" : "Tutte"}</button>
              <button type="button" onClick={stop} className="text-sm font-semibold text-muted-foreground outline-none focus-visible:underline">Annulla</button>
            </>
          : <>
              <button type="button" onClick={() => shelve(pile.shots)} className="inline-flex items-center gap-1 text-sm font-semibold text-foreground outline-none focus-visible:underline">{archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}{archived ? "Ripristina" : "Archivia"}</button>
              <button type="button" onClick={() => setSelecting(true)} className="text-sm font-semibold text-foreground outline-none focus-visible:underline">Seleziona</button>
              <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground outline-none focus-visible:underline">Chiudi</button>
            </>}
      </div>
      {/* One row that slides sideways (the card keeps its height however many there are); its own move, not the page's tabs. */}
      <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-3 px-3 py-1 touch-pan-x" data-map-gestures="">
        {pile.shots.map((s) => <div key={keyOf(s)} className="w-[7.5rem] shrink-0 snap-start sm:w-36">{selecting ? (
          <button type="button" role="checkbox" aria-checked={picked.has(keyOf(s))} aria-label={`${s.kind === "video" ? "Video" : "Foto"} ${s.name}`} onClick={() => flip(s)}
            className={`relative block aspect-square overflow-hidden rounded-2xl bg-foreground/[0.08] outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${picked.has(keyOf(s)) ? "ring-2 ring-destructive" : "opacity-80"}`}>
            <ShotMedia s={s} />
            <span className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 ${picked.has(keyOf(s)) ? "border-destructive bg-destructive text-white" : "border-white bg-black/35"}`}>{picked.has(keyOf(s)) && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}</span>
          </button>
        ) : <Thumb s={s} onOpen={() => setViewing(pile.shots.indexOf(s))} />}</div>)}
      </div>
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
function ArchiveBlock({ shots, keys }: { shots: Shot[]; keys: string[] }) {
  const { signedIn } = useSignedIn();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [shown, setShown] = useState<string | null>(null);
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
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground/[0.08]"><Archive className="size-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Archivio</span><span className="block text-xs text-muted-foreground">{shots.length ? `${piles.length === 1 ? "1 giorno" : `${piles.length} giorni`} · ${countText(shots)}` : `${keys.length === 1 ? "1 file" : `${keys.length} file`} archiviati`} · {signedIn ? "nell'account" : "su questo dispositivo"}</span></span>
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
          {list.length === 0 && <p className="px-1 text-sm text-muted-foreground">{shots.length ? "Niente in archivio per quel giorno." : "Le foto e i video archiviati non sono ancora caricati qui: puoi comunque rimetterli tutti nelle pile."}</p>}
          {!day && (
            <button type="button" onClick={() => { restoreMedia(keys); toast.success("Archivio ripristinato: foto e video di nuovo nelle pile"); }}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArchiveRestore className="size-4" aria-hidden="true" />Ripristina tutto · {shots.length ? countText(shots) : `${keys.length} file`}
            </button>
          )}
          {months.map((m) => (
            <div key={m.name}>
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{m.name}</p>
              <div className="overflow-hidden rounded-xl bg-foreground/[0.05]">
                {m.piles.map((p) => (
                  <button key={p.key} type="button" aria-expanded={shown === p.key} onClick={() => setShown(shown === p.key ? null : p.key)}
                    className="flex w-full items-center gap-3 border-b border-foreground/[0.06] px-3 py-2.5 text-left outline-none last:border-0 focus-visible:bg-foreground/[0.06]">
                    <FolderClosed className="size-5 shrink-0 text-brand-turquoise" aria-hidden="true" />
                    <span className="flex-1 text-[15px] font-semibold tabular-nums">{p.label}</span>
                    <span className="text-xs text-muted-foreground">{countText(p.shots)}</span>
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${shown === p.key ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {current && <OpenPile key={current.key} pile={current} archived onClose={() => setShown(null)} />}
        </div>
      )}
    </div>
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
function EntryRow({ e }: { e: SourcedEntry }) {
  const t = time(e);
  return (
    <div className="flex gap-3 py-3">
      <span className="w-12 shrink-0 text-sm tabular-nums text-muted-foreground" aria-label={`alle ${t}`}>{t}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] leading-snug">{e.text}</p>
        <WhenLine e={e} />
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.flow === "piazza" ? "Piazza" : "Vigneto"}{e.place ? ` · ${e.place}` : ""}</p>
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
  const { entries: all, where, loading, failed, reload } = useHistory();
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
  useEffect(() => { setConfirm(false); }, [filter]);
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  const archive = useMediaArchive();
  useEffect(() => { void currentMedia("urban"); void currentMedia("vineyard"); }, []);
  const allShots = useMemo<Shot[]>(() => [
    ...urban.map((m): Shot => ({ ...m, flow: "piazza", at: mediaTime(m) })),
    ...vineyard.map((m): Shot => ({ ...m, flow: "vigneto", at: mediaTime(m) })),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)), [urban, vineyard]);
  // One project only with a profile (or on the dashboard); otherwise everything on Benvenuto and the filter tab on the Cronologia page.
  const shownIn = (f: Filter) => (fl: HistoryFlow) => (flow ? fl === flow : compact || f === "tutti" || f === fl);
  const entries = all.filter((e) => shownIn(filter)(e.flow));
  // The photos and interventions of one filter tab: the open one, and the one peeking beside it while swiping.
  const list = (f: Filter) => {
    const shown = shownIn(f);
    const inTab = all.filter((e) => shown(e.flow));
    const inFlow = allShots.filter((s) => shown(s.flow));
    const shots = inFlow.filter((s) => !archive[`${s.flow}-${s.id}`]);
    const archivedAll = inFlow.filter((s) => archive[`${s.flow}-${s.id}`]);
    const archivedShots = compact ? [] : archivedAll;
    // Every archived key of this tab, even for files not loaded (yet) on this device, so the archive can always be restored.
    const archKeys = Object.keys(archive).filter((k) => shown(k.startsWith("vigneto-") ? "vigneto" : "piazza"));
    const groups = compact ? groupByDay(inTab).slice(0, COMPACT_DAYS) : groupByDay(inTab);
    const visibleShots = compact ? shots.slice(0, COMPACT_SHOTS) : shots;
    return (
      <>
        {visibleShots.length > 0 && (
          <div className="space-y-2">
            <h3 className="px-1 text-sm font-medium text-muted-foreground">Foto e video{compact && shots.length > visibleShots.length ? ` · ultimi ${visibleShots.length} di ${shots.length}` : ""}</h3>
            <PhotoPiles shots={visibleShots} />
          </div>
        )}
        {!compact && archKeys.length > 0 && <ArchiveBlock shots={archivedShots} keys={archKeys} />}
        {compact && archKeys.length > 0 && (
          <Link to="/cronologia" className="flex items-center gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Archive className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1 text-sm"><span className="font-semibold">Archivio</span><span className="text-muted-foreground"> · {archivedAll.length ? countText(archivedAll) : `${archKeys.length} file`} · tocca per recuperarle</span></span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
        {groups.length === 0 ? visibleShots.length > 0 ? null : (
          <DashCard className="flex flex-col items-center gap-2 py-8 text-center">
            <History className="size-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-[15px] font-medium">{loading ? "Carico la cronologia…" : f === "tutti" ? "Ancora nessun intervento" : `Ancora nessun intervento ${f === "piazza" ? "nella piazza" : "nel vigneto"}`}</p>
            {!loading && <p className="max-w-xs text-sm text-muted-foreground">Quando cambi alberi, prato, ombra o irrigazione nella simulazione, l’intervento si registra da solo e lo trovi qui, con foto e video.</p>}
          </DashCard>
        ) : groups.map((g) => compact
          ? <DayTab key={g.key} label={g.label} items={g.items} />
          : (
          <div key={g.key} className="space-y-2">
            {/* One card per day: its date on top, then each intervention of that day with its time. */}
            <h3 className="px-1 text-sm font-semibold tabular-nums text-foreground/90">{g.label}<span className="ml-2 font-medium text-muted-foreground">{g.items.length === 1 ? "1 intervento" : `${g.items.length} interventi`}</span></h3>
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
    const ok = await clearHistory(filter === "tutti" ? undefined : filter);
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
      {/* Tutti · Piazza · Vigneto turn with a sideways swipe on the list, like the tutorial's screens. */}
      <div ref={swipe.ref} style={swipe.style} className="relative space-y-3">
      {failed && <DashCard><p className="text-sm text-muted-foreground">Non riesco a leggere la cronologia del tuo account. Vedi solo quella di questo dispositivo.</p></DashCard>}
      {list(filter)}
      {more && (
        <Link to="/cronologia" className="flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
