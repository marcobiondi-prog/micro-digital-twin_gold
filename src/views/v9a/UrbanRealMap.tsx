import { useState } from "react";
import { Eraser, Moon, Sprout, Sun, Sunrise, Sunset, TreePine, Umbrella, type LucideIcon } from "lucide-react";
import { piazzaEstimate } from "@/models/scenarios";
import { setUrban, splitLabel, useLab } from "@/models/lab-store";
import { COLS, PERMEABLE_POSITIONS, ROWS, SHADE_POSITIONS, TREE_POSITIONS } from "@/views/SimulationGrid";
import { GAIN_TEXT, HEAT_VAR, ToolButton } from "@/views/v7/studio-ui";
import { Slider } from "@/components/ui/slider";
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
const FIRST_HOUR = 8, LAST_HOUR = 20, PEAK_HOUR = 15;

const pick = (cells: number[] | null, positions: readonly number[], n: number) => new Set(cells && cells.length === n ? cells : positions.slice(0, n));
const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** How strong the sun is at an hour of the day, 0 at dawn and dusk, 1 at the hottest hour. */
const sunAt = (h: number) => clamp(Math.cos(((h - PEAK_HOUR) / 9) * (Math.PI / 2)), 0, 1);
/** Sun exposure of the bare piazza: the west edge keeps a little shade (3), the open rest bakes (4). */
const exposure = (i: number) => ((i % COLS) < 3 && Math.floor(i / COLS) > 1 ? 3 : 4);

/** The real piazza seen from above, behind the heat. With the browser key the official embed, else Google's keyless one. */
function SatelliteView({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const src = key
    ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(key)}&center=${lat},${lng}&zoom=19&maptype=satellite&language=it`
    : `https://maps.google.com/maps?ll=${lat},${lng}&z=19&t=k&hl=it&output=embed`;
  // Oversized and offset so the embed's own controls fall outside the frame; it only shows, never takes touches.
  return <iframe title={`Vista dall'alto di ${label}`} src={src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" tabIndex={-1} aria-hidden="true"
    className="pointer-events-none absolute -inset-x-[12%] -top-[22%] h-[144%] w-[124%] border-0 grayscale-[35%]" />;
}

/**
 * v9 "A · Piazza vera": the real piazza from above with the heat painted over it. Pick a tool, touch the piazza to put
 * or take away a tree, a lawn or a shade; move the hour to see how the heat changes during the day.
 */
export function UrbanRealMap() {
  const urban = useLab().urban;
  const [tool, setTool] = useState<Tool>("albero");
  const [hour, setHour] = useState(PEAK_HOUR);
  const [pulse, setPulse] = useState<{ i: number; k: number } | null>(null);
  const total = CELLS.length;
  const trees = pick(urban.treeCells, TREE_POSITIONS, urban.trees);
  const grass = pick(urban.permeableCells, PERMEABLE_POSITIONS, Math.round((urban.permeable / 100) * total));
  const shade = pick(urban.shadeCells, SHADE_POSITIONS, Math.round((urban.shade / 100) * total));
  // One thing per square: a tree covers shade, shade covers grass.
  const itemAt = (i: number): Item | null => (trees.has(i) ? "albero" : shade.has(i) ? "ombra" : grass.has(i) ? "prato" : null);

  const sun = sunAt(hour);
  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  // Shade and trees matter most when the sun is high: the gain follows the hour.
  const dT = est.dT * (0.35 + 0.65 * sun);
  const peak = urban.realTemp ?? 40;
  const before = 24 + (peak - 24) * sun;
  const after = before - dT;
  const gain = dT < 0.8 ? 0 : dT < 1.8 ? 1 : dT < 2.8 ? 2 : dT < 3.8 ? 3 : 4;

  const cooling = (i: number) => { const item = itemAt(i); return item ? OWN_COOLING[item] : 0; };
  /** Heat step of a square at this hour: its exposure scaled by the sun, minus what it and its neighbours cool. */
  const heatAt = (i: number) => {
    const x = i % COLS, y = Math.floor(i / COLS);
    let near = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS) near += cooling(ny * COLS + nx);
    }
    const d = (cooling(i) + Math.min(2.4, near * 0.3) + est.dT * 0.3) * (0.4 + 0.6 * sun);
    const steps = d < 0.8 ? 0 : d < 1.8 ? 1 : d < 2.8 ? 2 : d < 3.8 ? 3 : 4;
    return clamp(Math.round(exposure(i) * (0.3 + 0.7 * sun)) - steps, 0, 4);
  };

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

  const HourIcon = hour <= 9 ? Sunrise : hour >= 19 ? Sunset : sun < 0.15 ? Moon : Sun;
  const name = splitLabel(urban.location.label);

  return (
    <section className="fuse-canvas space-y-4 rounded-t-3xl px-3 pb-6 pt-4 text-foreground sm:px-5 sm:pt-5" aria-label="Simulazione sulla piazza vera">
      <div className="flex items-end justify-between gap-3" aria-live="polite">
        <div className="min-w-0">
          <div className={cn("font-display text-5xl font-light leading-none tracking-tight tabular-nums sm:text-6xl", GAIN_TEXT[gain])}>−{fmt(dT)}<span className="ml-1 text-lg font-semibold text-muted-foreground">°C</span></div>
          <p className="mt-1.5 text-sm text-muted-foreground">calore percepito alle {hour}:00</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm text-muted-foreground tabular-nums">{fmt(before)}° →</div>
          <div className="font-mono text-2xl font-semibold tabular-nums">{fmt(after)}°</div>
        </div>
      </div>

      <div className="relative aspect-[9/6] select-none overflow-hidden rounded-3xl bg-[#1b2027]">
        <SatelliteView lat={urban.location.lat} lng={urban.location.lng} label={name} />
        {/* The heat over the real piazza: blurred colour, see-through so the place stays recognisable. */}
        <div className="pointer-events-none absolute inset-0 grid scale-110 grid-cols-9 opacity-60 mix-blend-multiply blur-lg dark:mix-blend-normal dark:opacity-55" aria-hidden="true">
          {CELLS.map((i) => <span key={i} style={{ background: HEAT_VAR[heatAt(i)] }} className="transition-[background-color] duration-500 motion-reduce:transition-none" />)}
        </div>
        <div className="absolute inset-0 grid grid-cols-9" role="grid" aria-label="Piazza vista dall'alto: tocca per mettere o togliere">
          {CELLS.map((i) => {
            const item = itemAt(i), Icon = item ? ITEM_ICON[item] : null;
            return (
              <button key={i} type="button" onClick={() => place(i)} aria-label={`Punto ${i + 1}${item ? `, ${item}` : ""}`}
                className="relative grid place-items-center outline-none hover:bg-white/15 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-white">
                {Icon && item && <span className={cn("grid size-[70%] place-items-center rounded-full bg-[#0d1016]/85 ring-2 animate-in zoom-in-50 duration-200 motion-reduce:animate-none", ITEM_RING[item])}><Icon className="size-[58%]" aria-hidden="true" /></span>}
                {pulse?.i === i && <span key={pulse.k} className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-white/80 animate-out fade-out zoom-out-150 duration-500 fill-mode-forwards motion-reduce:hidden" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <span className="pointer-events-none absolute left-2 top-2 max-w-[70%] truncate rounded-full bg-[#0d1016]/75 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">{name}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-radar-hot" aria-hidden="true"><HourIcon className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <Slider value={[hour]} min={FIRST_HOUR} max={LAST_HOUR} step={1} onValueChange={(v) => setHour(v[0] ?? PEAK_HOUR)} aria-label={`Ora del giorno: ${hour}:00`} />
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted-foreground" aria-hidden="true"><span>8</span><span>12</span><span>16</span><span>20</span></div>
        </div>
        <span className="w-14 shrink-0 text-right font-mono text-lg font-semibold tabular-nums">{hour}:00</span>
      </div>

      <div className="grid grid-cols-4 gap-2" role="toolbar" aria-label="Cosa mettere nella piazza">
        {TOOLS.map((t) => <ToolButton key={t.id} icon={t.icon} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)} {...(t.swatch ? { swatch: t.swatch } : {})} badge={(t.id === "albero" ? trees.size : t.id === "prato" ? grass.size : t.id === "ombra" ? shade.size : 0) || null} />)}
      </div>
    </section>
  );
}
