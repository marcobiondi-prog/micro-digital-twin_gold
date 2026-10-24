import { useState } from "react";
import { ArrowRight, Eraser, RotateCcw, Snowflake, Flame, Sprout, Thermometer, TreePine, Umbrella, type LucideIcon } from "lucide-react";
import { Card } from "@/views/health";
import { piazzaEstimate } from "@/models/scenarios";
import { setUrban, useLab } from "@/models/lab-store";
import { COLS, PERMEABLE_POSITIONS, ROWS, SHADE_POSITIONS, TREE_POSITIONS } from "@/views/SimulationGrid";
import { cn } from "@/lib/utils";
import { BigButton, Face, MOOD_TEXT_COLOR, type Mood } from "./play-ui";

type Tool = "albero" | "prato" | "ombra" | "gomma";
type Item = Exclude<Tool, "gomma">;
const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => i);
const TOOLS: Array<{ id: Tool; label: string; icon: LucideIcon; tone: string }> = [
  { id: "albero", label: "Albero", icon: TreePine, tone: "bg-ok" },
  { id: "prato", label: "Prato", icon: Sprout, tone: "bg-radar-mild" },
  { id: "ombra", label: "Ombra", icon: Umbrella, tone: "bg-urban" },
  { id: "gomma", label: "Togli", icon: Eraser, tone: "bg-muted-foreground" },
];
const ITEM_ICON: Record<Item, LucideIcon> = { albero: TreePine, prato: Sprout, ombra: Umbrella };
const ITEM_TONE: Record<Item, string> = { albero: "bg-ok", prato: "bg-radar-mild", ombra: "bg-urban" };
const OWN_COOLING: Record<Item, number> = { albero: 2.6, prato: 1.4, ombra: 2 };
const HEAT_BG = ["bg-radar-cool", "bg-radar-mild", "bg-radar-warm", "bg-radar-hot", "bg-radar-extreme"] as const;

const pick = (cells: number[] | null, positions: readonly number[], n: number) => new Set(cells && cells.length === n ? cells : positions.slice(0, n));

/** v1 "Tocca e pianta": si sceglie un'icona grande e si tocca la piazza; termometro e faccina mostrano l'effetto. */
export function UrbanPlay({ onReset }: { onReset: () => void }) {
  const urban = useLab().urban;
  const [tool, setTool] = useState<Tool>("albero");
  const total = CELLS.length;
  const trees = pick(urban.treeCells, TREE_POSITIONS, urban.trees);
  const grass = pick(urban.permeableCells, PERMEABLE_POSITIONS, Math.round((urban.permeable / 100) * total));
  const shade = pick(urban.shadeCells, SHADE_POSITIONS, Math.round((urban.shade / 100) * total));
  // Una cosa per tessera: l'albero copre l'ombra, l'ombra copre il prato.
  const itemAt = (i: number): Item | null => (trees.has(i) ? "albero" : shade.has(i) ? "ombra" : grass.has(i) ? "prato" : null);

  const place = (i: number) => {
    const t = new Set(trees), g = new Set(grass), s = new Set(shade);
    const current = itemAt(i);
    [t, g, s].forEach((set) => set.delete(i));
    // Toccare di nuovo la stessa cosa la toglie: niente bisogno della gomma per correggere.
    if (tool !== "gomma" && current !== tool) (tool === "albero" ? t : tool === "prato" ? g : s).add(i);
    setUrban({ treeCells: [...t], trees: t.size, permeableCells: [...g], permeable: Math.round((g.size / total) * 100), shadeCells: [...s], shade: Math.round((s.size / total) * 100) });
  };

  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  const before = urban.realTemp ?? 40;
  const after = before - est.dT;
  const mood = (est.dT < 0.8 ? 0 : est.dT < 1.8 ? 1 : est.dT < 2.8 ? 2 : est.dT < 3.8 ? 3 : 4) as Mood;
  const cooling = (i: number) => { const item = itemAt(i); return item ? OWN_COOLING[item] : 0; };
  const cellTemp = (i: number) => {
    const x = i % COLS, y = Math.floor(i / COLS);
    let near = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS) near += cooling(ny * COLS + nx);
    }
    return before - cooling(i) - Math.min(2.4, near * 0.3) - est.dT * 0.3;
  };
  const heatStep = (t: number) => { const d = before - t; return d < 0.8 ? 4 : d < 1.8 ? 3 : d < 2.8 ? 2 : d < 3.8 ? 1 : 0; };
  const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const counts: Record<Tool, number | null> = { albero: trees.size, prato: grass.size, ombra: shade.size, gomma: null };

  return (
    <Card className="p-3 sm:p-5">
      <div className="mx-auto w-full max-w-[44rem] space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 sm:gap-5 sm:p-4" aria-live="polite">
        <Face mood={mood} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <div className={cn("font-display text-4xl font-bold leading-none sm:text-5xl", MOOD_TEXT_COLOR[mood])}>−{fmt(est.dT)}°</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-muted-foreground sm:text-base">
            <Thermometer className="size-4 text-danger" aria-hidden="true" /><span aria-label={`Prima ${fmt(before)} gradi`}>{fmt(before)}°</span>
            <ArrowRight className="size-4" aria-hidden="true" />
            <Thermometer className={cn("size-4", MOOD_TEXT_COLOR[mood])} aria-hidden="true" /><span aria-label={`Dopo ${fmt(after)} gradi`} className="text-foreground">{fmt(after)}°</span>
          </div>
        </div>
        <button type="button" onClick={onReset} aria-label="Ricomincia" className="grid size-12 shrink-0 place-items-center rounded-full border-2 bg-card text-muted-foreground transition-transform active:scale-95 motion-reduce:active:scale-100"><RotateCcw className="size-5" aria-hidden="true" /></button>
      </div>

      <div className="grid grid-cols-4 gap-2" role="toolbar" aria-label="Cosa mettere nella piazza">
        {TOOLS.map((t) => <BigButton key={t.id} icon={t.icon} label={t.label} tone={t.tone} active={tool === t.id} onClick={() => setTool(t.id)} badge={counts[t.id] || null} />)}
      </div>

      <div className="w-full rounded-2xl bg-lab-surface p-1.5 sm:p-2.5">
        <div className="grid grid-cols-9 gap-1 sm:gap-1.5" role="grid" aria-label="Piazza: tocca una tessera per mettere o togliere">
          {CELLS.map((i) => {
            const item = itemAt(i), Icon = item ? ITEM_ICON[item] : null;
            return (
              <button
                key={i}
                type="button"
                onClick={() => place(i)}
                aria-label={`Tessera ${i + 1}${item ? `, ${item}` : ", vuota"}`}
                className={cn("grid aspect-square place-items-center rounded-[6px] outline-none transition-[background-color,transform] duration-300 active:scale-90 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100 sm:rounded-[12px]", HEAT_BG[heatStep(cellTemp(i))])}
              >
                {Icon && item && <span className={cn("grid size-[78%] place-items-center rounded-full text-white shadow-md ring-2 ring-white/80 animate-in zoom-in-50 duration-200 motion-reduce:animate-none", ITEM_TONE[item])}><Icon className="size-[60%]" aria-hidden="true" /></span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 px-1" aria-label="Colori: dal fresco al caldo">
        <Snowflake className="size-5 shrink-0 text-radar-cool" aria-hidden="true" />
        <div className="h-3 flex-1 rounded-full bg-[linear-gradient(90deg,var(--radar-cool),var(--radar-mild),var(--radar-warm),var(--radar-hot),var(--radar-extreme))]" />
        <Flame className="size-5 shrink-0 text-radar-extreme" aria-hidden="true" />
      </div>
      </div>
    </Card>
  );
}
