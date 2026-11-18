import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Leaf, PanelBottomOpen, Shovel, Trash2, Undo2, X } from "lucide-react";
import { scanPhoto, type ScanRecord } from "@/models/ar-scan-log";

/**
 * The AI camera's «Scansioni» drawer: every scan result of the flow, newest first (its photo, what was found, the hour),
 * a tap opening its full result; «Seleziona» picks several to delete at once, asked in place. Over the list, the last
 * analysis' message when it did not get through, and the camera's other actions (the card, the last specimen, all).
 */
export function ScanSheet({ records, failed, showCard, specimens, detail, onShowCard, onUndoSpecimen, onDelete, onDeleteAll, onClose }: {
  records: readonly ScanRecord[];
  /** A result's full card, shown on the drawer's second page. */
  detail: (r: ScanRecord, index: number) => ReactNode;
  /** The last analysis' message when it found nothing or stopped (e.g. "Analisi interrotta…"). */
  failed: string | null;
  showCard: boolean;
  specimens: number;
  onShowCard: () => void;
  onUndoSpecimen: () => void;
  onDelete: (ids: string[]) => void;
  onDeleteAll: () => void;
  onClose: () => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [asking, setAsking] = useState(false);
  const list = records.map((r, i) => ({ r, i })).reverse();
  const toggle = (id: string) => setChosen((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setChosen(new Set()); setAsking(false); };
  const n = chosen.size;
  // The second page: a result's full card, sliding in from the right (the list leaving to the left). Back (‹, or the
  // finger moved from right to left, as asked) is drawn as a going back: the card slides away to the right and the
  // list comes back from the left, following how far the finger has gone.
  const [openId, setOpenId] = useState<string | null>(null);
  const [pos, setPos] = useState({ list: 0, detail: 100, anim: false });
  const [drag, setDrag] = useState(0);
  const swipe = useRef<{ x: number; y: number; on: boolean; mouse: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const openIndex = openId ? records.findIndex((r) => r.id === openId) : -1;
  const opened = openIndex >= 0 ? records[openIndex]! : null;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const SLIDE = 340;
  const openResult = (id: string) => {
    window.clearTimeout(timer.current);
    setOpenId(id); setDrag(0);
    setPos({ list: -100, detail: 0, anim: true });
  };
  const back = () => {
    window.clearTimeout(timer.current);
    setDrag(0);
    setPos({ list: 0, detail: 100, anim: true });
    timer.current = window.setTimeout(() => setOpenId(null), SLIDE);
  };
  // The finger's way to the left, shown as the back move (both pages shifted to the right by as much).
  const paneStyle = (x: number) => ({
    gridArea: "1 / 1",
    transform: `translate3d(calc(${x}% + ${-drag}px), 0, 0)`,
    transition: pos.anim && !drag && !reduce ? `transform ${SLIDE}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none",
  });
  const swipeStart = (x: number, y: number, mouse: boolean) => { swipe.current = { x, y, on: false, mouse }; };
  const swipeMove = (x: number, y: number) => {
    const sw = swipe.current;
    if (!sw) return;
    const dx = x - sw.x, dy = y - sw.y;
    if (!sw.on) {
      if (dx < -10 && -dx > Math.abs(dy) * 1.2) sw.on = true;
      else if (Math.abs(dy) > 10 || dx > 10) { swipe.current = null; return; } else return;
    }
    setDrag(Math.min(0, dx));
  };
  const swipeEnd = () => {
    const sw = swipe.current;
    swipe.current = null;
    if (!sw?.on) return;
    if (drag < -70) {
      // Finish from where the finger left it.
      const w = typeof window !== "undefined" ? Math.min(window.innerWidth, 512) : 400;
      const k = (-drag / w) * 100;
      setPos({ list: -100 + k, detail: k, anim: false }); setDrag(0);
      requestAnimationFrame(() => requestAnimationFrame(back));
    } else { setPos((p) => ({ ...p, anim: true })); setDrag(0); }
  };
    return (
    <div role="dialog" aria-label="Scansioni" className="ar-sheet pointer-events-auto fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[78dvh] w-full max-w-lg flex-col rounded-t-[28px] border-t border-white/15 text-white shadow-[0_-20px_60px_rgba(0,0,0,0.55)] landscape:max-h-[92dvh]"
      style={{ background: "oklch(0.25 0.02 255 / 0.97)", paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
      <div className="flex justify-center pb-1 pt-2"><span className="h-1.5 w-10 rounded-full bg-white/25" aria-hidden="true" /></div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="grid min-h-0 w-full flex-1">
          <div className="flex min-h-0 min-w-0 flex-col" style={paneStyle(pos.list)} aria-hidden={opened ? true : undefined}>
      <div className="flex items-center gap-2 px-5 pb-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">{selecting ? (n ? `${n} ${n === 1 ? "esito scelto" : "esiti scelti"}` : "Scegli gli esiti") : `Scansioni · ${records.length}`}</h2>
        {records.length > 0 && (selecting
          ? <button type="button" onClick={stopSelecting} className="h-9 rounded-full bg-white/10 px-3 text-sm font-semibold">Annulla</button>
          : <button type="button" onClick={() => setSelecting(true)} className="h-9 rounded-full bg-white/10 px-3 text-sm font-semibold">Seleziona</button>)}
        <button type="button" onClick={onClose} aria-label="Chiudi" className="grid size-10 place-items-center rounded-full bg-white/10"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {failed && !selecting && (
          <p role="status" className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-400/15 px-3 py-2.5 text-[13px] leading-snug text-amber-100 ring-1 ring-amber-300/30">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" /><span>{failed}</span>
          </p>
        )}
        {list.length === 0 && !failed && <p className="px-2 py-4 text-sm text-white/65">Nessun esito ancora: inquadra una pianta o il suolo e tocca il pulsante a sinistra dello scatto.</p>}
        {list.length > 0 && (
          <ul className="overflow-hidden rounded-2xl bg-white/[0.06]">
            {list.map(({ r, i }, k) => {
              const photo = scanPhoto(r.id);
              const title = r.species ? r.species.commonName : r.soil ? `Suolo: ${r.soil.label}` : r.target;
              const line = r.species
                ? `${r.species.scientificName}${r.species.shade ? ` · ombra ≈ ${r.species.shade} m²` : ""}`
                : r.soil ? `Permeabilità ${r.soil.permeability} · ${r.soil.plantable ? "si può piantare" : "non adatta a piantare"}` : r.result;
              const on = chosen.has(r.id);
              const Icon = r.species ? Leaf : Shovel;
              return (
                <li key={r.id} className={k ? "border-t border-white/[0.07]" : ""}>
                  <button type="button" onClick={() => (selecting ? toggle(r.id) : openResult(r.id))} aria-pressed={selecting ? on : undefined}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/10">
                    {selecting && (
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full ring-2 ${on ? "bg-[#00e5ff] text-black ring-[#00e5ff]" : "ring-white/40"}`} aria-hidden="true">
                        {on && <Check className="size-4" />}
                      </span>
                    )}
                    <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10">
                      {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <Icon className="size-5 text-white/70" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-tight">{title}</span>
                      <span className="mt-0.5 block truncate text-xs text-white/65">{line}</span>
                      <span className="mt-0.5 block text-[11px] text-white/45">Scansione {i + 1} · {new Date(r.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}{r.count > 0 ? ` · ${r.count} ${r.count === 1 ? "esemplare" : "esemplari"}` : ""}</span>
                    </span>
                    {!selecting && <ChevronRight className="size-5 shrink-0 text-white/40" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!selecting && (showCard || specimens > 0 || records.length > 0) && (
          <ul className="mt-3 overflow-hidden rounded-2xl bg-white/[0.06]">
            {showCard && <Row Icon={PanelBottomOpen} label="Mostra la scheda" hint="Rimette sullo schermo la scheda con «Aggiungi al progetto»" onClick={onShowCard} />}
            {specimens > 0 && <Row Icon={Undo2} label="Togli l’ultimo esemplare" hint={`${specimens} ${specimens === 1 ? "esemplare contato" : "esemplari contati"}`} onClick={onUndoSpecimen} />}
            {records.length > 0 && <Row Icon={Trash2} label="Elimina tutto" hint="Toglie gli esemplari e tutti gli esiti (chiede conferma)" onClick={onDeleteAll} danger />}
          </ul>
        )}
      </div>
      {selecting && (
        <div className="space-y-2 border-t border-white/10 px-4 pt-3">
          {asking ? (
            <>
              <p className="text-sm">Eliminare {n === 1 ? "questo esito" : `questi ${n} esiti`}? Non si {n === 1 ? "può" : "possono"} recuperare.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAsking(false)} className="h-11 flex-1 rounded-full bg-white/10 text-sm font-semibold">Annulla</button>
                <button type="button" onClick={() => { onDelete([...chosen]); stopSelecting(); }} className="h-11 flex-1 rounded-full bg-red-500 text-sm font-semibold text-white">Elimina {n}</button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={() => setChosen(n === records.length ? new Set() : new Set(records.map((r) => r.id)))} className="h-11 flex-1 rounded-full bg-white/10 text-sm font-semibold">
                {n === records.length ? "Nessuno" : "Tutti"}
              </button>
              <button type="button" disabled={!n} onClick={() => setAsking(true)} className="h-11 flex-1 rounded-full bg-red-500 text-sm font-semibold text-white disabled:opacity-40">
                Elimina{n ? ` ${n}` : ""}
              </button>
            </div>
          )}
        </div>
      )}
          </div>
          <div className="flex min-h-0 min-w-0 touch-pan-y flex-col" style={paneStyle(pos.detail)} aria-hidden={opened ? undefined : true}
            onTouchStart={(e) => { const t = e.touches[0]; if (t && e.touches.length === 1) swipeStart(t.clientX, t.clientY, false); }}
            onTouchMove={(e) => { const t = e.touches[0]; if (t) swipeMove(t.clientX, t.clientY); }}
            onTouchEnd={swipeEnd}
            onTouchCancel={() => { swipe.current = null; setDrag(0); }}
            onPointerDown={(e) => { if (e.pointerType === "mouse") swipeStart(e.clientX, e.clientY, true); }}
            onPointerMove={(e) => { if (e.pointerType === "mouse" && swipe.current?.mouse) swipeMove(e.clientX, e.clientY); }}
            onPointerUp={(e) => { if (e.pointerType === "mouse" && swipe.current?.mouse) swipeEnd(); }}>
            <div className="flex items-center gap-2 px-3 pb-2">
              <button type="button" onClick={back} aria-label="Torna alle scansioni" className="flex h-10 items-center gap-1 rounded-full bg-white/10 pl-2 pr-3 text-sm font-semibold"><ChevronLeft className="size-5" />Scansioni</button>
              <h2 className="min-w-0 flex-1 truncate text-right text-base font-semibold">{opened ? (opened.species?.commonName ?? (opened.soil ? `Suolo: ${opened.soil.label}` : opened.target)) : ""}</h2>
              <button type="button" onClick={onClose} aria-label="Chiudi" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10"><X className="size-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
              {opened && <div className="rounded-2xl bg-background px-3.5 py-3 text-xs leading-relaxed text-foreground">{detail(opened, openIndex)}</div>}
              {opened && <p className="mt-2 text-center text-[11px] text-white/45">Scorri verso sinistra per tornare alle scansioni</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ Icon, label, hint, onClick, danger }: { Icon: typeof X; label: string; hint: string; onClick: () => void; danger?: boolean }) {
  return (
    <li className="border-t border-white/[0.07] first:border-t-0">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/10">
        <span className={`grid size-11 shrink-0 place-items-center rounded-full ${danger ? "bg-red-500/15 text-red-300" : "bg-white/10"}`}><Icon className="size-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] font-semibold leading-tight ${danger ? "text-red-300" : ""}`}>{label}</span>
          <span className="mt-0.5 block text-xs leading-snug text-white/65">{hint}</span>
        </span>
      </button>
    </li>
  );
}
