import { useState } from "react";
import { ArrowRight, Eraser, Sprout, ThermometerSnowflake, TreePine, Umbrella, type LucideIcon } from "lucide-react";
import { piazzaEstimate } from "@/models/scenarios";
import { setUrban, useLab } from "@/models/lab-store";
import { COLS, PERMEABLE_POSITIONS, ROWS, SHADE_POSITIONS, TREE_POSITIONS } from "@/views/SimulationGrid";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { GAIN_TEXT, HEAT_VAR, HeatBar, Readout, Studio, ToolButton } from "./studio-ui";

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

const pick = (cells: number[] | null, positions: readonly number[], n: number) => new Set(cells && cells.length === n ? cells : positions.slice(0, n));
const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/**
 * v7 urban simulator: a thermal field of the piazza that reacts to every touch. Pick a tool in the dock,
 * touch the field; the reading on top (degrees gained, before → after) updates at once.
 */
export function UrbanStudio() {
  const urban = useLab().urban;
  const [tool, setTool] = useState<Tool>("albero");
  const [pulse, setPulse] = useState<{ i: number; k: number } | null>(null);
  const total = CELLS.length;
  const trees = pick(urban.treeCells, TREE_POSITIONS, urban.trees);
  const grass = pick(urban.permeableCells, PERMEABLE_POSITIONS, Math.round((urban.permeable / 100) * total));
  const shade = pick(urban.shadeCells, SHADE_POSITIONS, Math.round((urban.shade / 100) * total));
  // One thing per cell: a tree covers shade, shade covers grass.
  const itemAt = (i: number): Item | null => (trees.has(i) ? "albero" : shade.has(i) ? "ombra" : grass.has(i) ? "prato" : null);

  const place = (i: number) => {
    const t = new Set(trees), g = new Set(grass), s = new Set(shade);
    const current = itemAt(i);
    [t, g, s].forEach((set) => set.delete(i));
    // Touching the same thing again removes it: correcting needs no eraser.
    if (tool !== "gomma" && current !== tool) (tool === "albero" ? t : tool === "prato" ? g : s).add(i);
    setUrban({ treeCells: [...t], trees: t.size, permeableCells: [...g], permeable: Math.round((g.size / total) * 100), shadeCells: [...s], shade: Math.round((s.size / total) * 100) });
    setPulse((p) => ({ i, k: (p?.k ?? 0) + 1 }));
    hapticTick();
  };

  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  const before = urban.realTemp ?? 40;
  const after = before - est.dT;
  const gain = est.dT < 0.8 ? 0 : est.dT < 1.8 ? 1 : est.dT < 2.8 ? 2 : est.dT < 3.8 ? 3 : 4;
  const cooling = (i: number) => { const item = itemAt(i); return item ? OWN_COOLING[item] : 0; };
  const cellHeat = (i: number) => {
    const x = i % COLS, y = Math.floor(i / COLS);
    let near = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS) near += cooling(ny * COLS + nx);
    }
    const d = cooling(i) + Math.min(2.4, near * 0.3) + est.dT * 0.3;
    return d < 0.8 ? 4 : d < 1.8 ? 3 : d < 2.8 ? 2 : d < 3.8 ? 1 : 0;
  };
  const counts: Record<Tool, number | null> = { albero: trees.size, prato: grass.size, ombra: shade.size, gomma: null };

  return (
    <Studio>
      <div className="mx-auto w-full max-w-[46rem] space-y-4">
        <div className="space-y-3">
          <Readout icon={ThermometerSnowflake} value={`−${fmt(est.dT)}`} unit="°C" tone={GAIN_TEXT[gain]}
            caption={<><span className="font-mono tabular-nums">{fmt(before)}°</span><ArrowRight className="size-3.5" aria-hidden="true" /><span className="font-mono tabular-nums text-white">{fmt(after)}°</span><span className="text-white/40">· ore 14–17</span></>} />
          <HeatBar from={before} to={after} min={before - 6} max={before + 0.5} />
        </div>

        <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/10">
          {/* Thermal image: the same cells blurred together underneath, crisp touch targets on top. */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-9 scale-110 blur-xl" aria-hidden="true">
            {CELLS.map((i) => <span key={i} style={{ background: HEAT_VAR[cellHeat(i)] }} className="transition-[background-color] duration-500 motion-reduce:transition-none" />)}
          </div>
          <div className="relative grid grid-cols-9 gap-px bg-black/20 p-px" role="grid" aria-label="Piazza: tocca per mettere o togliere">
            {CELLS.map((i) => {
              const item = itemAt(i), Icon = item ? ITEM_ICON[item] : null;
              return (
                <button key={i} type="button" onClick={() => place(i)} aria-label={`Punto ${i + 1}${item ? `, ${item}` : ""}`}
                  className="relative grid aspect-square place-items-center bg-transparent outline-none transition-colors hover:bg-white/10 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cyan-300">
                  {Icon && item && <span className={cn("grid size-[70%] place-items-center rounded-full bg-[#0d1016]/85 ring-2 animate-in zoom-in-50 duration-200 motion-reduce:animate-none", ITEM_RING[item])}><Icon className="size-[58%]" aria-hidden="true" /></span>}
                  {pulse?.i === i && <span key={pulse.k} className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-white/80 animate-out fade-out zoom-out-150 duration-500 fill-mode-forwards motion-reduce:hidden" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2" role="toolbar" aria-label="Cosa mettere nella piazza">
          {TOOLS.map((t) => <ToolButton key={t.id} icon={t.icon} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)} {...(t.swatch ? { swatch: t.swatch } : {})} badge={counts[t.id] || null} />)}
        </div>
      </div>
    </Studio>
  );
}
