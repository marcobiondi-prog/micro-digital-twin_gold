import { CloudRain, Droplets, Flower2, Grape, Sprout, Sun, Wind, Wine, type LucideIcon } from "lucide-react";
import { phenoPhases, type Pheno } from "@/models/data";
import { setVineyard, useLab, vineMetrics } from "@/models/lab-store";
import { updateVineyardControl, type VineyardControl } from "@/models/vineyard-controls";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { GAIN_BG, GAIN_TEXT, HEAT_VAR, LevelBar, Readout, Studio, ToolButton } from "./studio-ui";

const STEPS: Record<VineyardControl, readonly number[]> = { temperature: [24, 28, 32, 36, 40], moisture: [8, 16, 24, 32, 44], wind: [0, 5, 10, 18, 26] };
const nearest = (v: number, steps: readonly number[]) => steps.reduce((b, s, i) => (Math.abs(s - v) < Math.abs((steps[b] ?? 0) - v) ? i : b), 0);
/** Stress 0–100 → five-step scale, 0 = worst. */
const stressGain = (s: number) => (s >= 80 ? 0 : s >= 65 ? 1 : s >= 45 ? 2 : s >= 25 ? 3 : 4);
const PHASE_ICON: Record<Pheno, LucideIcon> = { Germogliamento: Sprout, Fioritura: Flower2, Invaiatura: Grape, Maturazione: Wine };
const PHASE_SHORT: Record<Pheno, string> = { Germogliamento: "Germogli", Fioritura: "Fiori", Invaiatura: "Acini", Maturazione: "Vendemmia" };
const ROWS = 6;

/**
 * v7 vineyard simulator: the field split into three zones, coloured by how thirsty the vines are.
 * Touch a zone, then set sun, water and wind by touching the level bars; the reading updates at once.
 */
export function VineStudio({ onZonesEdit }: { onZonesEdit?: () => void }) {
  const vine = useLab().vineyard;
  const { results } = vineMetrics(vine);
  const sel = vine.selected;
  const zone = vine.zones[sel];
  const result = results[sel];
  if (!zone || !result) return null;
  const gain = stressGain(result.s);

  const set = (key: VineyardControl, level: number) => {
    onZonesEdit?.(); hapticTick();
    setVineyard((v) => ({ zones: updateVineyardControl(v.zones, v.selected, key, STEPS[key][level] ?? 0) }));
  };
  const toggleRain = () => { onZonesEdit?.(); hapticTick(); setVineyard((v) => ({ zones: v.zones.map((z, i) => (i === v.selected ? { ...z, rain: !z.rain } : z)) })); };

  return (
    <Studio>
      <div className="mx-auto w-full max-w-[46rem] space-y-4">
        <Readout icon={Droplets} value={`${result.s}`} unit="/100" tone={GAIN_TEXT[gain]}
          caption={<><span className={cn("size-2 rounded-full", GAIN_BG[gain])} aria-hidden="true" /><span className="text-foreground">Sete della vite · zona {sel + 1}</span></>}>
          <button type="button" onClick={toggleRain} aria-pressed={zone.rain} aria-label={`Pioggia sulla zona ${sel + 1}`}
            className={cn("ml-auto flex shrink-0 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide outline-none transition-[background-color,box-shadow,color] duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              zone.rain ? "bg-foreground/[0.12] text-sky-600 dark:text-sky-200 shadow-[0_0_0_2px_var(--foreground),0_0_20px_-2px_color-mix(in_oklab,var(--foreground)_45%,transparent)]" : "bg-foreground/[0.05] text-foreground/60")}>
            <CloudRain className="size-7" aria-hidden="true" />Pioggia
          </button>
        </Readout>

        <div className="grid grid-cols-3 gap-1.5 rounded-2xl p-1.5" role="radiogroup" aria-label="Zona del vigneto">
          {vine.zones.map((z, i) => {
            const r = results[i];
            if (!r) return null;
            const g = stressGain(r.s), on = i === sel;
            return (
              <button key={i} type="button" role="radio" aria-checked={on} aria-label={`Zona ${i + 1}, sete ${r.s} su 100`}
                onClick={() => { hapticTick(); setVineyard({ selected: i, allZones: false }); }}
                className={cn("relative overflow-hidden rounded-xl outline-none transition-[box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring", on ? "shadow-[0_0_0_2.5px_var(--foreground),0_0_20px_-2px_color-mix(in_oklab,var(--foreground)_45%,transparent)]" : "")}>
                <span className="pointer-events-none absolute inset-0 scale-110 blur-lg transition-[background-color] duration-500 motion-reduce:transition-none" style={{ background: HEAT_VAR[4 - g] }} aria-hidden="true" />
                <span className="relative grid grid-cols-3 gap-1 p-2" aria-hidden="true">
                  {Array.from({ length: ROWS * 3 }, (_, k) => <span key={k} className={cn("mx-auto size-2.5 rounded-full sm:size-3", z.rain ? "bg-sky-200/90" : "bg-[#0d1016]/70")} />)}
                </span>
                <span className="relative flex items-center justify-between bg-[#0d1016]/70 px-2 py-1 font-mono text-xs font-semibold text-white"><span>Z{i + 1}</span><span className={GAIN_TEXT[g]}>{r.s}</span></span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2" role="group" aria-label={`Comandi della zona ${sel + 1}`}>
          <LevelBar icon={Sun} label="Sole" level={nearest(zone.temperature, STEPS.temperature)} onChange={(l) => set("temperature", l)} color="var(--radar-hot)" value={`${Math.round(zone.temperature)}°`} />
          <LevelBar icon={Droplets} label="Acqua nel terreno" level={nearest(zone.moisture, STEPS.moisture)} onChange={(l) => set("moisture", l)} color="var(--radar-cool)" value={`${Math.round(zone.moisture)}%`} />
          <LevelBar icon={Wind} label="Vento" level={nearest(zone.wind, STEPS.wind)} onChange={(l) => set("wind", l)} color="color-mix(in oklab, var(--foreground) 50%, transparent)" value={`${Math.round(zone.wind)}`} />
        </div>

        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Fase della vite">
          {phenoPhases.map((p) => <ToolButton key={p} icon={PHASE_ICON[p]} label={PHASE_SHORT[p]} active={vine.phase === p} onClick={() => { hapticTick(); setVineyard({ phase: p }); }} />)}
        </div>
      </div>
    </Studio>
  );
}
