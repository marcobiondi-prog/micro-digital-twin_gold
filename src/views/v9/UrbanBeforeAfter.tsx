import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronsLeftRight, Eraser, Sprout, TreePine, Umbrella, type LucideIcon } from "lucide-react";
import { piazzaEstimate } from "@/models/scenarios";
import { setUrban, urbanMetrics, useLab } from "@/models/lab-store";
import { COLS, PERMEABLE_POSITIONS, ROWS, SHADE_POSITIONS, TREE_POSITIONS } from "@/views/SimulationGrid";
import { GAIN_TEXT, HEAT_VAR, ToolButton } from "@/views/v7/studio-ui";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Tool = "albero" | "prato" | "ombra" | "gomma";
type Item = Exclude<Tool, "gomma">;
const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => i);
const TOOLS: Array<{ id: Tool; label: string; icon: LucideIcon; swatch?: string }> = [
  { id: "albero", label: "Albero", icon: TreePine, swatch: "bg-ok" },
  { id: "prato", label: "Prato", icon: Sprout, swatch: "bg-radar-mild" },
  { id: "ombra", label: "Ombra", icon: Umbrella, swatch: "bg-urban" },
  { id: "gomma", label: "Togli", icon: Eraser },
];
const ITEM_ICON: Record<Item, LucideIcon> = { albero: TreePine, prato: Sprout, ombra: Umbrella };
const ITEM_RING: Record<Item, string> = { albero: "ring-ok text-ok", prato: "ring-radar-mild text-radar-mild", ombra: "ring-urban text-urban" };
const OWN_COOLING: Record<Item, number> = { albero: 2.6, prato: 1.4, ombra: 2 };

/** The three ready-made piazzas: one touch fills the "after" side, then it can be retouched by hand. */
const PRESETS = [
  { id: "zero", label: "Subito, gratis", cost: "0 €", trees: 3, permeable: 10, shade: 10 },
  { id: "mvp", label: "Pochi sensori", cost: "€€", trees: 6, permeable: 20, shade: 15 },
  { id: "roadmap", label: "Progetto completo", cost: "€€€€", trees: 12, permeable: 35, shade: 30 },
] as const;

const pick = (cells: number[] | null, positions: readonly number[], n: number) => new Set(cells && cells.length === n ? cells : positions.slice(0, n));
const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
/** Sun exposure of the bare piazza: the west edge keeps a little shade (3 = hot), the open rest bakes (4 = extreme). */
const exposure = (i: number) => ((i % COLS) < 3 && Math.floor(i / COLS) > 1 ? 3 : 4);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * v9 urban simulator, "Prima / dopo": the same piazza twice, today on the left and with the interventions on the
 * right, split by a handle you drag. Three big buttons fill the piazza with a ready level; touching a square puts
 * or takes away a tree, a lawn or a shade. The number under it says how many degrees are gained.
 */
export function UrbanBeforeAfter() {
  const urban = useLab().urban;
  const [tool, setTool] = useState<Tool>("albero");
  const [split, setSplit] = useState(50);
  const [pulse, setPulse] = useState<{ i: number; k: number } | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const total = CELLS.length;
  const trees = pick(urban.treeCells, TREE_POSITIONS, urban.trees);
  const grass = pick(urban.permeableCells, PERMEABLE_POSITIONS, Math.round((urban.permeable / 100) * total));
  const shade = pick(urban.shadeCells, SHADE_POSITIONS, Math.round((urban.shade / 100) * total));
  // One thing per square: a tree covers shade, shade covers grass.
  const itemAt = (i: number): Item | null => (trees.has(i) ? "albero" : shade.has(i) ? "ombra" : grass.has(i) ? "prato" : null);

  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  const m = urbanMetrics(urban);
  const before = urban.realTemp ?? 40;
  const after = before - est.dT;
  const gain = est.dT < 0.8 ? 0 : est.dT < 1.8 ? 1 : est.dT < 2.8 ? 2 : est.dT < 3.8 ? 3 : 4;
  const preset = PRESETS.find((p) => p.trees === urban.trees && p.permeable === urban.permeable && p.shade === urban.shade)?.id ?? null;

  const cooling = (i: number) => { const item = itemAt(i); return item ? OWN_COOLING[item] : 0; };
  /** Heat step of a square after the interventions: its exposure minus what it and its neighbours cool. */
  const afterHeat = (i: number) => {
    const x = i % COLS, y = Math.floor(i / COLS);
    let near = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS) near += cooling(ny * COLS + nx);
    }
    const d = cooling(i) + Math.min(2.4, near * 0.3) + est.dT * 0.3;
    const steps = d < 0.8 ? 0 : d < 1.8 ? 1 : d < 2.8 ? 2 : d < 3.8 ? 3 : 4;
    return clamp(exposure(i) - steps, 0, 4);
  };

  const place = (i: number) => {
    const t = new Set(trees), g = new Set(grass), s = new Set(shade);
    const current = itemAt(i);
    [t, g, s].forEach((set) => set.delete(i));
    // Touching the same thing again removes it: correcting needs no eraser.
    if (tool !== "gomma" && current !== tool) (tool === "albero" ? t : tool === "prato" ? g : s).add(i);
    setUrban({ treeCells: [...t], trees: t.size, permeableCells: [...g], permeable: Math.round((g.size / total) * 100), shadeCells: [...s], shade: Math.round((s.size / total) * 100) });
    // A touch on the "today" side opens the "after" side up to that square, so the change is seen at once.
    const left = ((i % COLS) / COLS) * 100;
    setSplit((v) => Math.min(v, left));
    setPulse((p) => ({ i, k: (p?.k ?? 0) + 1 }));
    hapticTick();
  };
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    hapticTick();
    setUrban({ trees: p.trees, permeable: p.permeable, shade: p.shade, treeCells: null, permeableCells: null, shadeCells: null });
  };

  // Dragging the handle (or the line) moves the split; arrow keys move it by 5 %.
  const drag = (e: PointerEvent<HTMLElement>) => {
    const r = field.current?.getBoundingClientRect();
    if (r) setSplit(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : e.key === "Home" ? -100 : e.key === "End" ? 100 : 0;
    if (!step) return;
    e.preventDefault();
    setSplit((v) => clamp(v + step, 0, 100));
  };

  const heatLayer = (heat: (i: number) => number) => (
    <div className="pointer-events-none absolute inset-0 grid scale-110 grid-cols-9 blur-xl" aria-hidden="true">
      {CELLS.map((i) => <span key={i} style={{ background: HEAT_VAR[heat(i)] }} className="transition-[background-color] duration-500 motion-reduce:transition-none" />)}
    </div>
  );

  return (
    <section className="fuse-canvas space-y-4 rounded-t-3xl px-3 pb-6 pt-4 text-foreground sm:px-5 sm:pt-5" aria-label="Simulazione della piazza: prima e dopo">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Piazze già pronte">
        {PRESETS.map((p) => {
          const on = preset === p.id;
          return (
            <button key={p.id} type="button" onClick={() => applyPreset(p)} aria-pressed={on}
              className={cn("flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-center outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:active:scale-100",
                on ? "bg-foreground/[0.12] shadow-[0_0_0_2px_var(--foreground),0_0_20px_-2px_color-mix(in_oklab,var(--foreground)_45%,transparent)]" : "bg-foreground/[0.05] hover:bg-foreground/[0.08]")}>
              <span className="text-[13px] font-semibold leading-tight">{p.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.cost}</span>
            </button>
          );
        })}
      </div>

      <div ref={field} className="relative aspect-[9/6] select-none overflow-hidden rounded-3xl bg-[#0d1016]">
        {/* Today: the bare piazza, only its sun exposure. */}
        {heatLayer(exposure)}
        {/* After: the same piazza with the interventions, revealed right of the handle. */}
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          {heatLayer(afterHeat)}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-9" aria-hidden="true">
            {CELLS.map((i) => {
              const item = itemAt(i), Icon = item ? ITEM_ICON[item] : null;
              return (
                <span key={i} className="relative grid place-items-center">
                  {Icon && item && <span className={cn("grid size-[70%] place-items-center rounded-full bg-[#0d1016]/85 ring-2 animate-in zoom-in-50 duration-200 motion-reduce:animate-none", ITEM_RING[item])}><Icon className="size-[58%]" /></span>}
                  {pulse?.i === i && <span key={pulse.k} className="absolute inset-0 rounded-sm ring-2 ring-white/80 animate-out fade-out zoom-out-150 duration-500 fill-mode-forwards motion-reduce:hidden" />}
                </span>
              );
            })}
          </div>
        </div>
        {/* Touch targets over both sides. */}
        <div className="absolute inset-0 grid grid-cols-9" role="grid" aria-label="Piazza: tocca per mettere o togliere">
          {CELLS.map((i) => {
            const item = itemAt(i);
            return <button key={i} type="button" onClick={() => place(i)} aria-label={`Punto ${i + 1}${item ? `, ${item}` : ""}`} className="outline-none hover:bg-white/10 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-white" />;
          })}
        </div>
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-[#0d1016]/75 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">Oggi <span className="font-mono">{fmt(before)}°</span></span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[#0d1016]/75 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">Dopo <span className="font-mono">{fmt(after)}°</span></span>
        {/* The handle: a white line with a round grip, dragged or moved with the arrow keys. */}
        <div className="absolute inset-y-0 z-10 w-10 -translate-x-1/2 cursor-ew-resize touch-none" style={{ left: `${split}%` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e); }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e); }}>
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_10px_rgb(255_255_255/0.7)]" aria-hidden="true" />
          <span role="slider" tabIndex={0} aria-label="Confronta oggi e dopo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(100 - split)}% della piazza con gli interventi`} onKeyDown={onKey}
            className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0d1016] shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-white/50">
            <ChevronsLeftRight className="size-5" aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3" aria-live="polite">
        <div className="min-w-0">
          <div className={cn("font-display text-5xl font-light leading-none tracking-tight tabular-nums sm:text-6xl", GAIN_TEXT[gain])}>−{fmt(est.dT)}<span className="ml-1 text-lg font-semibold text-muted-foreground">°C</span></div>
          <p className="mt-1.5 text-sm text-muted-foreground">calore percepito alle 14–17</p>
          <p className="text-xs text-muted-foreground">da −{fmt(est.lo)} a −{fmt(est.hi)}</p>
        </div>
        <dl className="flex shrink-0 gap-3 text-right">
          <div><dt className="text-xs text-muted-foreground">Verde</dt><dd className="font-mono text-lg font-semibold tabular-nums">{m.green}%</dd></div>
          <div><dt className="text-xs text-muted-foreground">Ombra</dt><dd className="font-mono text-lg font-semibold tabular-nums">{m.refuges}%</dd></div>
        </dl>
      </div>

      <div className="grid grid-cols-4 gap-2" role="toolbar" aria-label="Cosa mettere nella piazza">
        {TOOLS.map((t) => <ToolButton key={t.id} icon={t.icon} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)} {...(t.swatch ? { swatch: t.swatch } : {})} badge={(t.id === "albero" ? trees.size : t.id === "prato" ? grass.size : t.id === "ombra" ? shade.size : 0) || null} />)}
      </div>
    </section>
  );
}
