import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowRight, Building2, CalendarDays, Check, Share2, ChevronDown, Clock3, Cloud, Smartphone, Grape, History, Play, Trash2 } from "lucide-react";
import { currentMedia, removeMedia, useLabMedia, type MediaItem } from "@/models/lab-media-store";
import { mediaTime } from "@/models/media-time";
import { TabRow } from "@/views/v8/console";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { forShare } from "@/views/v10/ExportSheet";
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
      r.querySelectorAll("video").forEach((v, k) => { if (k !== n) v.pause(); });
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
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent overlayClassName="bg-black" className="!left-0 !top-0 flex h-[100dvh] w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 text-white sm:max-h-none sm:rounded-none">
        <DialogTitle className="sr-only">{s.kind === "video" ? "Video" : "Foto"} {i + 1} di {list.length}</DialogTitle>
        <DialogDescription className="sr-only">{s.flow === "piazza" ? "Piazza" : "Vigneto"}{when ? `, ${when}` : ""}</DialogDescription>
        <div className="flex items-center gap-3 px-4 pb-2 pr-16 pt-[calc(0.85rem+env(safe-area-inset-top))]">
          <span className="text-[15px] font-semibold tabular-nums">{Math.min(i, list.length - 1) + 1} di {list.length}</span>
          <span className="min-w-0 truncate text-sm text-white/65">{s.flow === "piazza" ? "Piazza" : "Vigneto"}{when ? ` · ${when}` : ""}</span>
        </div>
        <div ref={row} onScroll={onScroll} data-map-gestures="" className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden touch-pan-x">
          {list.map((x, k) => (
            <div key={`${x.flow}-${x.id}`} className="relative grid h-full w-full shrink-0 snap-center place-items-center px-1">
              {Math.abs(k - i) <= 2 && (x.kind === "video"
                ? <video src={x.url} controls playsInline preload="metadata" className="max-h-full max-w-full" />
                : <img src={x.url} alt={`Foto ${k + 1} di ${list.length}`} className="max-h-full max-w-full object-contain" />)}
            </div>
          ))}
        </div>
        {note && <p role="status" className="px-6 pt-3 text-center text-[13px] text-brand-turquoise">{note}</p>}
        {ask ? (
          <div role="alertdialog" aria-label="Conferma eliminazione" className="mx-4 mt-3 rounded-2xl bg-white/[0.08] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center">
            <p className="text-[15px] font-medium">Eliminare {what}? Non si può recuperare.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setAsk(false)} disabled={busy} className="h-12 flex-1 rounded-full bg-white/10 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white">Annulla</button>
              <button type="button" onClick={() => void del()} disabled={busy} className="h-12 flex-1 rounded-full bg-destructive text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60">{busy ? "Elimino…" : "Elimina"}</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => void share()} className="flex w-16 flex-col items-center gap-1 text-xs outline-none focus-visible:underline">
              <span className="grid size-11 place-items-center rounded-full bg-white/10"><Share2 className="size-5" aria-hidden="true" /></span>Condividi
            </button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Precedente" className="grid size-10 place-items-center rounded-full bg-white/10 text-xl outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30">‹</button>
              <div className="flex max-w-[30vw] gap-1.5 overflow-hidden" aria-hidden="true">
                {list.length <= 9 && list.map((x, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-white" : "w-1.5 bg-white/35"}`} />)}
              </div>
              <button type="button" onClick={() => go(i + 1)} disabled={i >= list.length - 1} aria-label="Successiva" className="grid size-10 place-items-center rounded-full bg-white/10 text-xl outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30">›</button>
            </div>
            <button type="button" onClick={() => setAsk(true)} className="flex w-16 flex-col items-center gap-1 text-xs outline-none focus-visible:underline">
              <span className="grid size-11 place-items-center rounded-full bg-destructive/20 text-red-300"><Trash2 className="size-5" aria-hidden="true" /></span>Elimina
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
                {isOpen && <span className="pile-ring" aria-hidden="true" />}
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
function OpenPile({ pile, onClose }: { pile: Pile; onClose: () => void }) {
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
        <button type="button" onClick={() => setAsk(true)} disabled={!picked.size}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-destructive text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          <Trash2 className="size-4" aria-hidden="true" />{picked.size ? `Elimina ${picked.size === 1 ? "1 file" : `${picked.size} file`}` : "Scegli cosa eliminare"}
        </button>
      ))}
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
    const shots = allShots.filter((s) => shown(s.flow));
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
