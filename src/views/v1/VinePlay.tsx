import { CloudRain, Droplets, Flower2, Grape, Minus, Plus, RotateCcw, Sprout, Sun, Wind, Wine, type LucideIcon } from "lucide-react";
import { Card } from "@/views/health";
import { phenoPhases, type Pheno } from "@/models/data";
import { setVineyard, useLab, vineMetrics } from "@/models/lab-store";
import { updateVineyardControl, vineyardLimits, type VineyardControl } from "@/models/vineyard-controls";
import { cn } from "@/lib/utils";
import { BigButton, Face, LevelDots, MOOD_BG, MOOD_TEXT_COLOR, type Mood } from "./play-ui";

const VINE_TEXT = ["Vite in pericolo", "Vite stanca", "Da guardare", "Vite sana", "Vite in forma"] as const;
const vineMood = (s: number) => (s >= 80 ? 0 : s >= 65 ? 1 : s >= 45 ? 2 : s >= 25 ? 3 : 4) as Mood;
const CONTROLS: Array<{ key: VineyardControl; label: string; icon: LucideIcon; tone: string; step: number; unit: string }> = [
  { key: "temperature", label: "Sole", icon: Sun, tone: "bg-warn", step: 1, unit: "°" },
  { key: "moisture", label: "Acqua", icon: Droplets, tone: "bg-urban", step: 3, unit: "%" },
  { key: "wind", label: "Vento", icon: Wind, tone: "bg-muted-foreground", step: 2, unit: "" },
];
const PHASE_ICON: Record<Pheno, LucideIcon> = { Germogliamento: Sprout, Fioritura: Flower2, Invaiatura: Grape, Maturazione: Wine };
const PHASE_SHORT: Record<Pheno, string> = { Germogliamento: "Germogli", Fioritura: "Fiori", Invaiatura: "Acini", Maturazione: "Vendemmia" };

/** v1 "Tocca e pianta" per il vigneto: tre zone con la faccina della vite, comandi a icone per la zona scelta. */
export function VinePlay({ onReset, onZonesEdit }: { onReset: () => void; onZonesEdit?: () => void }) {
  const vine = useLab().vineyard;
  const { results } = vineMetrics(vine);
  const selected = vine.selected;
  const zone = vine.zones[selected];
  const result = results[selected];
  if (!zone || !result) return null;
  const mood = vineMood(result.s);

  const change = (key: VineyardControl, delta: number) => {
    onZonesEdit?.();
    setVineyard((v) => ({ zones: updateVineyardControl(v.zones, v.selected, key, Math.max(0, Math.min(vineyardLimits[key], (v.zones[v.selected]?.[key] ?? 0) + delta))) }));
  };
  const toggleRain = () => { onZonesEdit?.(); setVineyard((v) => ({ zones: v.zones.map((z, i) => (i === v.selected ? { ...z, rain: !z.rain } : z)) })); };

  return (
    <Card className="p-3 sm:p-5">
      <div className="mx-auto w-full max-w-[44rem] space-y-4 sm:space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Scegli la zona del vigneto">
        {vine.zones.map((_, i) => {
          const r = results[i];
          if (!r) return null;
          const m = vineMood(r.s), on = i === selected;
          return (
            <button key={i} type="button" role="radio" aria-checked={on} onClick={() => setVineyard({ selected: i, allZones: false })}
              className={cn("flex min-w-0 flex-col items-center gap-2 rounded-2xl border-2 p-2.5 outline-none transition-[transform,border-color] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100 sm:p-4", on ? "border-vine bg-vine/10" : "border-transparent bg-muted/60")}>
              <span className="flex items-center gap-1" aria-hidden="true">{[0, 1, 2].map((k) => <Grape key={k} className={cn("size-5 sm:size-7", MOOD_TEXT_COLOR[m])} />)}</span>
              <Face mood={m} className="size-11 sm:size-14" />
              <span className="text-sm font-bold">{i + 1}</span>
              <span className="h-2 w-full overflow-hidden rounded-full bg-background" aria-hidden="true"><span className={cn("block h-full rounded-full transition-[width] duration-300", MOOD_BG[m])} style={{ width: `${r.s}%` }} /></span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 sm:gap-5 sm:p-4" aria-live="polite">
        <Face mood={mood} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <div className={cn("font-display text-2xl font-bold leading-tight sm:text-3xl", MOOD_TEXT_COLOR[mood])}>{VINE_TEXT[mood]}</div>
          <div className="mt-1 text-sm text-muted-foreground">Zona {selected + 1} · stress {result.s}/100</div>
        </div>
        <button type="button" onClick={onReset} aria-label="Ricomincia" className="grid size-12 shrink-0 place-items-center rounded-full border-2 bg-card text-muted-foreground transition-transform active:scale-95 motion-reduce:active:scale-100"><RotateCcw className="size-5" aria-hidden="true" /></button>
      </div>

      <div className="space-y-2" role="group" aria-label={`Comandi della zona ${selected + 1}`}>
        {CONTROLS.map(({ key, label, icon: Icon, tone, step, unit }) => (
          <div key={key} className="flex items-center gap-2 rounded-2xl bg-muted/40 p-2 sm:gap-3 sm:p-2.5">
            <span className={cn("grid size-11 shrink-0 place-items-center rounded-full text-white sm:size-12", tone)} role="img" aria-label={label}><Icon className="size-6" aria-hidden="true" /></span>
            <button type="button" onClick={() => change(key, -step)} aria-label={`Meno ${label.toLowerCase()}`} className="grid size-12 shrink-0 place-items-center rounded-full border-2 bg-card transition-transform active:scale-90 motion-reduce:active:scale-100"><Minus className="size-6" aria-hidden="true" /></button>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <LevelDots value={zone[key]} max={vineyardLimits[key]} tone={tone} />
              <span className="text-xs font-semibold text-muted-foreground">{Math.round(zone[key])}{unit}</span>
            </div>
            <button type="button" onClick={() => change(key, step)} aria-label={`Più ${label.toLowerCase()}`} className="grid size-12 shrink-0 place-items-center rounded-full border-2 bg-card transition-transform active:scale-90 motion-reduce:active:scale-100"><Plus className="size-6" aria-hidden="true" /></button>
          </div>
        ))}
        <button type="button" onClick={toggleRain} aria-pressed={zone.rain} className={cn("flex w-full items-center justify-center gap-3 rounded-2xl border-2 p-2.5 text-sm font-semibold transition-colors", zone.rain ? "border-urban bg-urban/15" : "border-transparent bg-muted/40")}>
          <span className={cn("grid size-11 place-items-center rounded-full text-white", zone.rain ? "bg-urban" : "bg-muted-foreground/60")}><CloudRain className="size-6" aria-hidden="true" /></span>Pioggia
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Momento della vite">
        {phenoPhases.map((p) => <BigButton key={p} icon={PHASE_ICON[p]} label={PHASE_SHORT[p]} tone="bg-vine" active={vine.phase === p} onClick={() => setVineyard({ phase: p })} />)}
      </div>
      </div>
    </Card>
  );
}
