import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, CloudRain, Leaf, Minus, Plus,  Ruler, Sprout, Sun, TreePine, Umbrella, Wallet, type LucideIcon } from "lucide-react";
import { comparison, piazzaEstimate, type PrototypeId } from "@/models/scenarios";
import { setUrban, useLab } from "@/models/lab-store";
import { REFERENCE_M2, euroRange, grouped, interventionCost } from "@/models/intervention-cost";
import { getPlaceArea } from "@/controllers/osm-geo.functions";
import { useSeasonClock, WhenPicker } from "@/views/v10/when";
import { coolingShare, estimatedTemp } from "@/models/season-climate";
import { GAIN_BG, GAIN_TEXT } from "@/views/v7/studio-ui";
import { ImportWeatherButton } from "@/views/SimulationGrid";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MARKS = 10;
/** Radius in px of the round area around the white dot that grabs the arc (a fingertip, about 56 px across). */
const GRAB_RADIUS = 28;
/** The three ready piazzas: one touch to start, then fine-tune with the levers. */
const PRESETS: Array<{ id: PrototypeId; trees: number; permeable: number; shade: number }> = [
  { id: "zero", trees: 3, permeable: 10, shade: 10 },
  { id: "mvp", trees: 6, permeable: 20, shade: 15 },
  { id: "roadmap", trees: 12, permeable: 40, shade: 30 },
];
/** The level whose ready piazza gains the closest number of degrees: it names the cost of what is on screen. */
const levelOf = (dT: number): PrototypeId => {
  return PRESETS.reduce((best, p) => (Math.abs(gainOf(p) - dT) < Math.abs(gainOf(best) - dT) ? p : best)).id;
};
/** The gain cap of the trees, lawn and shade together (piazzaEstimate). */
const MAX_GAIN = 5.2;
const gainOf = (p: { trees: number; permeable: number; shade: number }) => piazzaEstimate(p.trees, p.permeable, p.shade).dT;
/** The path the arc walks: empty piazza, then the three ready ones; between two of them the mix is blended. */
const PATH = [{ trees: 0, permeable: 0, shade: 0 }, ...PRESETS];
function mixFor(gain: number): { trees: number; permeable: number; shade: number } {
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i]!, b = PATH[i + 1]!, ga = gainOf(a), gb = gainOf(b);
    if (gain <= gb + 1e-6) {
      const f = clamp((gain - ga) / (gb - ga), 0, 1);
      return { trees: Math.round(a.trees + (b.trees - a.trees) * f), permeable: Math.round(a.permeable + (b.permeable - a.permeable) * f), shade: Math.round(a.shade + (b.shade - a.shade) * f) };
    }
  }
  const last = PATH[PATH.length - 1]!;
  return { trees: last.trees, permeable: last.permeable, shade: last.shade };
}
/** How it feels, in plain words and on the five-step scale (0 = worst; the cool end reads blue). */
const feeling = (t: number): { text: string; step: number; bg?: string } =>
  t >= 39 ? { text: "Troppo caldo", step: 0 } : t >= 36 ? { text: "Molto caldo", step: 1 } : t >= 30 ? { text: "Caldo", step: 2 }
    : t >= 18 ? { text: "Si sta bene", step: 4 } : t >= 10 ? { text: "Fresco", step: 4, bg: "bg-water" } : { text: "Freddo", step: 4, bg: "bg-urban" };


/** A level as a stop on the arc: where its ready piazza would bring the perceived heat now. */
export type Stop = { id: PrototypeId; label: string; t: number; on: boolean; near: boolean };

/**
 * Half-ring gauge you can slide, the one control of the page: the coloured arc and the white dot show how hot the
 * piazza feels, the faint ring where today starts, and the three levels sit on it as labelled stops (touch one and
 * the dot goes there). Only a finger on the white dot grabs it: it follows the finger exactly, clicks into a stop
 * when close to it, and the piazza follows; arrow keys move it by 0,1 °C, Page Up/Down jump between stops.
 */
export function Gauge({ before, after, lowest, min: MIN, max: MAX, stops, onSlide, onStop, unit = "°", spoken = "gradi", label = "Calore percepito da raggiungere", step: keyStep = 0.1 }: { before: number; after: number; lowest: number; min: number; max: number; stops: Stop[]; onSlide: (t: number) => void; onStop: (id: PrototypeId) => void; unit?: string; spoken?: string; label?: string; step?: number }) {
  const R = 88, C = Math.PI * R;
  const box = useRef<HTMLDivElement>(null);
  // While sliding, the temperature under the finger (the piazza snaps to whole trees, the dot must not).
  const [finger, setFinger] = useState<number | null>(null);
  const shown = finger ?? after;
  const share = (t: number) => clamp((t - MIN) / (MAX - MIN), 0, 1);
  const angle = (t: number) => Math.PI * (1 - share(t));
  const at = (t: number, r = R) => ({ x: 100 + Math.cos(angle(t)) * r, y: 100 - Math.sin(angle(t)) * r });
  const b = at(before), a = at(shown);
  const reach = (t: number) => clamp(t, lowest, before);
  const disabled = lowest >= before - 0.05;
  /** Finger position in the drawing's units (viewBox 200 × 112, arc centre at 100,100). */
  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 200 - 100, y: 100 - ((e.clientY - r.top) / r.height) * 112 };
  };
  const tempAt = (x: number, y: number) => MIN + (1 - Math.atan2(Math.max(0, y), x) / Math.PI) * (MAX - MIN);
  // Close to a stop (a few degrees of arc) the dot clicks into it, so a level is easy to hit by finger.
  const snapGap = (MAX - MIN) * 0.035;
  const snapped = useRef<PrototypeId | null>(null);
  // A finger slides the dot sideways: its horizontal position is projected onto the arc, so a vertical move stays free
  // for the page to scroll (the handle lets vertical pans through) and the whole arc is reachable with a sideways swipe.
  const tempAtX = (x: number) => MIN + (1 - Math.acos(clamp(x / R, -1, 1)) / Math.PI) * (MAX - MIN);
  const touchStart = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const { x, y } = local(e);
    let t = reach(e.pointerType === "touch" ? tempAtX(x) : tempAt(x, y));
    const stop = stops.find((s) => Math.abs(s.t - t) < snapGap);
    if (stop) t = stop.t;
    if ((stop?.id ?? null) !== snapped.current) { snapped.current = stop?.id ?? null; if (stop) hapticTick(); }
    setFinger(t);
    onSlide(t);
  };
  const end = () => { setFinger(null); snapped.current = null; touchStart.current = null; };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "PageDown" || e.key === "PageUp") {
      // Next stop cooler (Page Down) or warmer (Page Up); past the warmest one, back to no intervention.
      e.preventDefault();
      const next = e.key === "PageDown" ? stops.find((s) => s.t < after - 0.05) : [...stops].reverse().find((s) => s.t > after + 0.05);
      if (next) onStop(next.id); else if (e.key === "PageUp") onSlide(before);
      return;
    }
    const step = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -keyStep : e.key === "ArrowRight" || e.key === "ArrowUp" ? keyStep : e.key === "Home" ? -99 : e.key === "End" ? 99 : 0;
    if (!step) return;
    e.preventDefault();
    onSlide(reach(after + step));
  };
  const motion = finger === null ? "transition-[stroke-dasharray] duration-300 motion-reduce:transition-none" : "";
  const pct = (p: { x: number; y: number }) => ({ left: `${p.x / 2}%`, top: `${(p.y / 112) * 100}%` });
  return (
    // An HTML layer takes the finger (touch-action works everywhere on HTML, not on every SVG): only touches that start
    // on the white dot grab it, and the page does not scroll under the gauge.
    <div ref={box} className="relative w-full select-none rounded-3xl focus-visible:ring-2 focus-visible:ring-ring"
      role="slider" tabIndex={0} aria-label={label} aria-valuemin={Math.round(lowest * 10) / 10} aria-valuemax={Math.round(before * 10) / 10} aria-disabled={disabled || undefined}
      aria-valuenow={Math.round(after * 10) / 10} aria-valuetext={`${keyStep >= 1 ? Math.round(after) : fmt(after)} ${spoken}${stops.find((s) => s.on) ? `, ${stops.find((s) => s.on)!.label}` : ""}`} onKeyDown={onKey}
      onPointerDown={(e) => {
        // Only the white dot can be grabbed: the touch area is the dot itself, with a thin margin for the finger.
        const { x, y } = local(e), hit = Math.hypot(x - (a.x - 100), y - (100 - a.y));
        // The grab zone is exactly the round handle below (28 px radius): a touch there never scrolls the page, so the
        // drag goes on wherever the finger then moves; a touch outside it is left to the page.
        const px = hit * (box.current!.getBoundingClientRect().width / 200);
        // Below the arc's ends (the min/max numbers, the reading inside) nothing is grabbed, even next to the dot.
        if (px > GRAB_RADIUS || y < 0 || disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        // A touch or a click alone never moves the dot: only a real slide does (for a finger, a sideways one).
        touchStart.current = { x: e.clientX, y: e.clientY, dragging: false };
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const start = touchStart.current;
        if (!start) return;
        if (!start.dragging) {
          const dx = Math.abs(e.clientX - start.x), dy = Math.abs(e.clientY - start.y);
          const touch = e.pointerType === "touch";
          if (Math.max(dx, dy) < (touch ? 8 : 3)) return;
          // A finger moving mostly up or down is scrolling the page: the dot stays where it is.
          if (touch && dy > dx) { e.currentTarget.releasePointerCapture(e.pointerId); end(); return; }
          start.dragging = true;
        }
        move(e);
      }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      style={{ outline: "none" }}>
      <svg viewBox="0 0 200 112" className="pointer-events-none w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="thermo-scale" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--radar-cool)" /><stop offset="0.3" stopColor="var(--radar-mild)" /><stop offset="0.55" stopColor="var(--radar-warm)" /><stop offset="0.78" stopColor="var(--radar-hot)" /><stop offset="1" stopColor="var(--radar-extreme)" />
          </linearGradient>
        </defs>
        <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="14" strokeLinecap="round" />
        <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="url(#thermo-scale)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * share(shown)} ${C}`} className={motion} />
        {stops.map((s) => { const p = at(s.t); return <circle key={s.id} cx={p.x} cy={p.y} r="2.6" fill="var(--background)" opacity="0.9" />; })}
        <circle cx={b.x} cy={b.y} r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
        <circle cx={a.x} cy={a.y} r={finger === null ? 11 : 13} fill="#fff" stroke="#0d1016" strokeWidth="2.5" className="[filter:drop-shadow(0_2px_4px_rgb(0_0_0/0.4))]" />
        <text x="12" y="111" fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.55">{Math.round(MIN)}{unit}</text>
        <text x="188" y="111" fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.55">{Math.round(MAX)}{unit}</text>
      </svg>
      {/* The white dot's touch area: the only place a finger grabs the arc (elsewhere the page scrolls as usual). */}
      {!disabled && <span className="absolute -translate-x-1/2 -translate-y-1/2 touch-pan-y rounded-full" style={{ ...pct(a), width: GRAB_RADIUS * 2, height: GRAB_RADIUS * 2 }} aria-hidden="true" />}
      {/* The levels, written just outside the arc where their stop is: one touch moves the dot there. */}
      {!disabled && stops.map((s) => (
        <button key={s.id} type="button" tabIndex={-1} aria-pressed={s.on} onPointerDown={(e) => e.stopPropagation()} onClick={() => onStop(s.id)}
          style={pct(at(s.t, R + 24))}
          className={cn("absolute w-max max-w-[5rem] -translate-x-1/2 -translate-y-1/2 rounded-xl px-2 py-1 text-center text-[11.5px] font-semibold leading-tight outline-none transition-[background-color,color,box-shadow,left,top] duration-200 active:scale-95 motion-reduce:transition-none",
            s.on ? "bg-foreground text-background shadow-[0_0_14px_rgb(255_255_255/0.35)]" : s.near ? "bg-foreground/[0.12] text-foreground ring-1 ring-foreground/40" : "bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/[0.1]")}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** One intervention on one line: − / +, its icon, name and value, and ten marks that fill as it grows. */
export function Lever({ icon: Icon, label, value, step, max, color, swatch, onChange, shown }: { icon: LucideIcon; label: string; value: number; step: number; max: number; color: string; swatch: string; onChange: (v: number) => void; shown?: string }) {
  const set = (v: number) => { const n = clamp(v, 0, max); if (n !== value) { hapticTick(); onChange(n); } };
  const filled = Math.round((value / max) * MARKS);
  const btn = "grid size-12 shrink-0 place-items-center rounded-2xl bg-foreground/[0.07] text-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring active:scale-90 disabled:opacity-30 motion-reduce:active:scale-100";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= 0} aria-label={`Meno ${label.toLowerCase()}`}><Minus className="size-5" aria-hidden="true" /></button>
      <div className="min-w-0 flex-1" aria-live="polite">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-5 shrink-0", color)} aria-hidden="true" />
          <span className="truncate text-[15.5px] font-semibold">{label}</span>
          <span className="ml-auto shrink-0 font-mono text-sm font-semibold tabular-nums">{shown ?? `${value}${step === 1 ? "" : "%"}`}</span>
        </div>
        <div className="mt-1.5 grid grid-cols-10 gap-1" aria-hidden="true">
          {Array.from({ length: MARKS }, (_, k) => <span key={k} className={cn("h-2 rounded-full transition-colors duration-200 motion-reduce:transition-none", k < filled ? swatch : "bg-foreground/10")} />)}
        </div>
      </div>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label={`Più ${label.toLowerCase()}`}><Plus className="size-5" aria-hidden="true" /></button>
    </div>
  );
}

/**
 * v9 "C · Termometro": no grid. Pick a ready piazza or move the three levers; a big gauge with a dot shows how hot
 * the piazza feels and says it in words, a chip tells what the last touch gained; then the estimated cost (total and per m²)
 * on the place's measured surface, and three small cards with the yearly benefits.
 */
export function UrbanThermometer({ onImportWeather }: { onImportWeather?: (() => Promise<void>) | undefined }) {
  const urban = useLab().urban;
  const [costOpen, setCostOpen] = useState(false);
  // Is the gauge on screen? When not, a compact reading stays pinned under the tabs.
  const gaugeRef = useRef<HTMLDivElement>(null);
  const [gaugeSeen, setGaugeSeen] = useState(true);
  useEffect(() => {
    const el = gaugeRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setGaugeSeen(e?.isIntersecting ?? true), { rootMargin: "-120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  // Season and hour (device clock until chosen by hand) and the place's real year for them; without it, a plain estimate said as such.
  const clock = useSeasonClock(urban.location.lat, urban.location.lng, "urban");
  const { season, hour, real: realBefore } = clock;
  const before = realBefore ?? estimatedTemp(season, hour, urban.realTemp ?? 40);
  // Trees, lawn and shade take heat away only when there is heat: all of it at 40 °C, none at 20 °C.
  const share = coolingShare(before);
  const gainNow = est.dT * share;
  const after = before - gainNow;
  const gain = gainNow < 0.8 ? 0 : gainNow < 1.8 ? 1 : gainNow < 2.8 ? 2 : gainNow < 3.8 ? 3 : 4;
  // The arc spans only what can be reached now (a little past both ends), so the three stops stay apart.
  const lowest = before - MAX_GAIN * share;
  const dialMax = before + 0.6, dialMin = lowest - 1.4;
  const feel = feeling(after);
  const preset = PRESETS.find((p) => p.trees === urban.trees && p.permeable === urban.permeable && p.shade === urban.shade)?.id ?? null;
  const level = comparison.find((l) => l.id === (preset ?? levelOf(est.dT))) ?? comparison[0]!;
  // The real surface of the chosen place, measured on its mapped shape; without one, the reference piazza (said so).
  const fetchArea = useServerFn(getPlaceArea);
  const { lat, lng } = urban.location;
  const area = useQuery({ queryKey: ["place-area", lat, lng], queryFn: () => fetchArea({ data: { lat, lng } }), staleTime: Infinity, retry: 1 });
  const measured = area.data?.m2 ?? null;
  const m2 = measured ?? REFERENCE_M2;
  const cost = interventionCost(m2, urban.trees, urban.permeable, urban.shade);
  // Same yearly estimates as the dashboard, on this surface (700 mm of rain, 60 % kept by permeable ground).
  const co2 = Math.round(urban.trees * 22);
  const water = Math.round(m2 * (urban.permeable / 100) * 0.7 * 0.6);
  const shadeM2 = Math.round(m2 * (urban.shade / 100) + urban.trees * 30);

  // Levers set totals, so the squares are placed again from the default layout.
  const change = (patch: { trees?: number; permeable?: number; shade?: number }) => {
    setUrban({ ...patch, treeCells: null, permeableCells: null, shadeCells: null });
  };

  // Sliding the gauge asks for a temperature: the piazza walks the path empty → the three ready piazzas, so every
  // stop on the arc is exactly its level and the dot between two stops mixes them.
  const slideTo = (t: number) => {
    const next = mixFor(share > 0 ? (before - t) / share : 0);
    if (next.trees === urban.trees && next.permeable === urban.permeable && next.shade === urban.shade) return;
    change(next);
  };
  const applyLevel = (id: PrototypeId) => {
    const p = PRESETS.find((x) => x.id === id)!;
    hapticTick();
    change({ trees: p.trees, permeable: p.permeable, shade: p.shade });
  };
  const stops: Stop[] = PRESETS.map((p) => ({
    id: p.id, label: comparison.find((c) => c.id === p.id)!.s, t: before - gainOf(p) * share,
    on: preset === p.id, near: !preset && est.dT > 0.05 && level.id === p.id,
  }));

  const facts: Array<{ icon: LucideIcon; value: string; label: string }> = [
    { icon: Leaf, value: `${co2} kg`, label: "CO₂ l'anno" },
    { icon: CloudRain, value: `${water} m³`, label: "Pioggia tenuta" },
    { icon: Sun, value: `${grouped(shadeM2)} m²`, label: "All'ombra" },
  ];
  const surface = area.isPending ? "…" : `${grouped(m2)} m²`;
  const surfaceNote = area.isPending ? "Misuro la piazza…" : measured ? "Superficie della piazza" : "Superficie di riferimento";

  return (
    <section className="fuse-canvas space-y-5 rounded-t-3xl px-3 pb-6 pt-4 text-foreground sm:px-5" aria-label="Termometro della piazza">
      {/* 1 · How to use it, and the costs-and-times table one touch away. */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{share > 0.01 ? "Trascina il punto bianco o tocca un livello" : "Ritocca la piazza qui sotto"}</p>
      </div>

      {/* The simulation stays the focus: once the gauge scrolls away, its reading rides under the tabs. */}
      <div aria-hidden={gaugeSeen} className={cn("pointer-events-none sticky top-[calc(var(--nav-h)+3.75rem)] z-[999999996] -mb-5 flex h-0 justify-center transition-opacity duration-200 motion-reduce:transition-none", gaugeSeen ? "opacity-0" : "opacity-100")}>
        <button type="button" tabIndex={gaugeSeen ? -1 : 0} onClick={() => gaugeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="mt-1 flex h-11 items-center gap-2 rounded-full bg-card/95 px-4 shadow-lg ring-1 ring-foreground/10 backdrop-blur" style={{ pointerEvents: gaugeSeen ? "none" : "auto" }}>
          <span className={cn("size-2.5 rounded-full", feel.bg ?? GAIN_BG[feel.step])} aria-hidden="true" />
          <span className="font-display text-xl font-light tabular-nums">{fmt(after)}°</span>
          <span className="text-sm text-muted-foreground">{feel.text}</span>
          <span className={cn("font-mono text-sm font-semibold tabular-nums", GAIN_TEXT[gain])}>−{fmt(gainNow)}</span>
        </button>
      </div>

      {/* 2 · The gauge: drag the white dot to choose how much to cool. */}
      <div ref={gaugeRef} className="relative mx-auto mt-10 flex max-w-[21rem] flex-col items-center px-7">
        <Gauge before={before} after={after} lowest={lowest} min={dialMin} max={dialMax} stops={share > 0.15 ? stops : []} onSlide={slideTo} onStop={applyLevel} />
        {/* Inside the arc: how it feels, the reading and what it costs, all following the dot. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center" aria-live="polite">
          <span className={cn("rounded-full px-3 py-0.5 text-[13.5px] font-semibold text-white transition-colors duration-300", feel.bg ?? GAIN_BG[feel.step])}>{feel.text}</span>
          <span className="mt-1 font-display text-6xl font-light leading-none tracking-tight tabular-nums">{fmt(after)}°</span>
          <span className="mt-1.5 font-mono text-sm font-semibold tabular-nums">{est.dT > 0.05 ? euroRange(cost.total) : "Nessun intervento"}</span>
        </div>
      </div>

      {/* When: one chip under the gauge (season, hour, live dot); touching it opens the season and hour controls. */}
      <div className="-mt-2 space-y-2">
        <WhenPicker clock={clock} id="piazza-when" detail={<>senza interventi {fmt(before)}°</>}
          note={clock.pending ? "Leggo l'anno del luogo…" : realBefore !== null ? "Calore percepito medio dell'ultimo anno in questo luogo" : "Stima indicativa: i dati reali del luogo non sono disponibili"}>
          {onImportWeather && <ImportWeatherButton onImport={onImportWeather} />}
        </WhenPicker>
        {share === 0 && <p className="text-center text-xs text-muted-foreground">A quest'ora non fa caldo: non c'è calore da togliere</p>}
      </div>

      {/* 3 · Fine-tuning by hand: always open, one line each. */}
      <div className="space-y-3" role="group" aria-label="Ritocca a mano">
        <Lever icon={TreePine} label="Alberi" value={urban.trees} step={1} max={30} color="text-ok" swatch="bg-ok" onChange={(v) => change({ trees: v })} />
        <Lever icon={Sprout} label="Prato" value={urban.permeable} step={10} max={100} color="text-radar-mild" swatch="bg-radar-mild" onChange={(v) => change({ permeable: v })} />
        <Lever icon={Umbrella} label="Ombra" value={urban.shade} step={10} max={100} color="text-urban" swatch="bg-urban" onChange={(v) => change({ shade: v })} />
      </div>

      {/* 4 · Cost and benefits, folded: closed it still says the total. */}
      <div className="rounded-3xl bg-foreground/[0.05]">
        <button type="button" onClick={() => setCostOpen((o) => !o)} aria-expanded={costOpen} aria-controls="piazza-cost-body"
          className="flex w-full items-center gap-3 rounded-3xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wallet className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Costo stimato dell'intervento{est.dT <= 0.05 ? "" : preset ? ` · ${level.s}` : ` · vicino a ${level.s}`}</span>
            {/* Shown even folded: the total; the cost per m² lives inside. */}
            {urban.trees + urban.permeable + urban.shade === 0
              ? <span className="block font-mono text-base font-semibold">Nessun intervento</span>
              : <>
                <span className="block font-mono text-base font-semibold tabular-nums">Tot. {euroRange(cost.total)}</span>
              </>}
            <span className="mt-0.5 block text-xs text-muted-foreground">{costOpen ? "Nascondi i dettagli" : "Tocca per i dettagli e i benefici"}</span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", costOpen && "rotate-180")} aria-hidden="true" />
        </button>
        <div id="piazza-cost-body" hidden={!costOpen} className="space-y-3 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Ruler className="size-4 shrink-0" aria-hidden="true" />{surface} · {surfaceNote.toLowerCase()}</span>
            {urban.trees + urban.permeable + urban.shade > 0 && <span className="font-mono font-semibold tabular-nums">{Math.round(cost.perM2.lo)}–{Math.round(cost.perM2.hi)} € al m²</span>}
          </div>
          <dl className="grid grid-cols-3 gap-2 border-t border-foreground/10 pt-3">
            {facts.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex min-w-0 flex-col items-center gap-1 text-center">
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex min-w-0 flex-col-reverse"><dt className="truncate text-[11.5px] text-muted-foreground">{label}</dt><dd className="font-mono text-sm font-semibold tabular-nums">{value}</dd></div>
              </div>
            ))}
          </dl>
          <p className="text-[11.5px] leading-snug text-muted-foreground">Stima indicativa, IVA esclusa: albero 600–1.500 € l'uno, prato 60–140 €/m², ombra 120–350 €/m².</p>
        </div>
      </div>
    </section>
  );
}
