import { CloudRain, Droplets, Flower2, Grape, RotateCcw, Sprout, Sun, Wind, Wine, type LucideIcon } from "lucide-react";
import { Card } from "@/views/health";
import { phenoPhases, type Pheno } from "@/models/data";
import { setVineyard, useLab, vineMetrics, type VineZoneState } from "@/models/lab-store";
import { updateVineyardControl, type VineyardControl } from "@/models/vineyard-controls";
import { cn } from "@/lib/utils";
import { Face, LevelPicker, MOOD_TEXT_COLOR, MOOD_VAR, nearestLevel, type Mood } from "./scene-ui";

const STEPS: Record<VineyardControl, readonly number[]> = { temperature: [26, 32, 36, 40], moisture: [10, 20, 35, 50], wind: [2, 8, 15, 25] };
const vineMood = (s: number) => (s >= 80 ? 0 : s >= 65 ? 1 : s >= 45 ? 2 : s >= 25 ? 3 : 4) as Mood;
const VINE_TEXT = ["Vite in pericolo", "Vite stanca", "Da guardare", "Vite sana", "Vite in forma"] as const;
const PHASE_ICON: Record<Pheno, LucideIcon> = { Germogliamento: Sprout, Fioritura: Flower2, Invaiatura: Grape, Maturazione: Wine };
const PHASE_SHORT: Record<Pheno, string> = { Germogliamento: "Germogli", Fioritura: "Fiori", Invaiatura: "Acini", Maturazione: "Vendemmia" };

/** Una zona del vigneto disegnata: sole grande col caldo, terra più verde con l'acqua, foglie che ingialliscono con lo stress. */
function ZoneDrawing({ zone, mood }: { zone: VineZoneState; mood: Mood }) {
  const heat = Math.max(0, Math.min(1, (zone.temperature - 22) / 20));
  const wet = Math.max(0, Math.min(1, zone.moisture / 50));
  const sunR = 7 + heat * 9;
  const leaf = MOOD_VAR[mood];
  return (
    <svg viewBox="0 0 120 130" className="block h-auto w-full" aria-hidden="true">
      <rect width="120" height="60" fill={`color-mix(in oklab, var(--radar-hot) ${Math.round(heat * 60)}%, var(--radar-cool))`} opacity="0.35" />
      {!zone.rain && <g><circle cx="96" cy="20" r={sunR} fill="var(--warn)" />{Array.from({ length: 8 }, (_, k) => { const a = (k * Math.PI) / 4; return <line key={k} x1={96 + Math.cos(a) * (sunR + 3)} y1={20 + Math.sin(a) * (sunR + 3)} x2={96 + Math.cos(a) * (sunR + 3 + heat * 6)} y2={20 + Math.sin(a) * (sunR + 3 + heat * 6)} stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" />; })}</g>}
      {zone.rain && <g><ellipse cx="60" cy="18" rx="30" ry="11" fill="var(--muted-foreground)" opacity="0.7" />{[42, 54, 66, 78].map((x) => <line key={x} x1={x} y1="32" x2={x - 4} y2="44" stroke="var(--water)" strokeWidth="2.5" strokeLinecap="round" />)}</g>}
      <g stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" opacity={Math.min(0.8, zone.wind / 20)}>
        <path d="M8 30 h22" fill="none" /><path d="M14 40 h30" fill="none" /><path d="M6 50 h18" fill="none" />
      </g>
      <path d="M0 70 Q60 52 120 70 V130 H0 Z" fill={`color-mix(in oklab, var(--leaf) ${Math.round(wet * 70)}%, oklch(0.62 0.08 60))`} style={{ transition: "fill 400ms" }} />
      {[24, 60, 96].map((x, k) => (
        <g key={x} transform={`translate(${x} ${96 + (k % 2) * 6})`}>
          <rect x="-1.5" y="-4" width="3" height="22" fill="oklch(0.42 0.06 50)" />
          <circle cx="-7" cy="-8" r="9" fill={leaf} style={{ transition: "fill 400ms" }} />
          <circle cx="7" cy="-10" r="9" fill={leaf} style={{ transition: "fill 400ms" }} />
          <circle cx="0" cy="-18" r="8" fill={leaf} style={{ transition: "fill 400ms" }} />
          <circle cx="2" cy="2" r="3.2" fill="var(--vine)" /><circle cx="-2" cy="5" r="3.2" fill="var(--vine)" /><circle cx="1" cy="8" r="2.8" fill="var(--vine)" />
        </g>
      ))}
    </svg>
  );
}

/** v2 "Prima e dopo" per il vigneto: tre zone disegnate da toccare, scelte a figure per sole, acqua, vento e pioggia. */
export function VineScene({ onReset, onZonesEdit }: { onReset: () => void; onZonesEdit?: () => void }) {
  const vine = useLab().vineyard;
  const { results } = vineMetrics(vine);
  const selected = vine.selected;
  const zone = vine.zones[selected];
  const result = results[selected];
  if (!zone || !result) return null;
  const mood = vineMood(result.s);
  const setControl = (key: VineyardControl, level: number) => {
    onZonesEdit?.();
    setVineyard((v) => ({ zones: updateVineyardControl(v.zones, v.selected, key, STEPS[key][level] ?? 0) }));
  };
  const setRain = (rain: boolean) => { onZonesEdit?.(); setVineyard((v) => ({ zones: v.zones.map((z, i) => (i === v.selected ? { ...z, rain } : z)) })); };

  return (
    <Card className="p-3 sm:p-5">
      <div className="mx-auto w-full max-w-[44rem] space-y-4 sm:space-y-5">
        <div className="relative grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl border bg-card p-1.5 sm:gap-2 sm:p-2" role="radiogroup" aria-label="Scegli la zona del vigneto">
          {vine.zones.map((z, i) => {
            const r = results[i];
            if (!r) return null;
            const m = vineMood(r.s), on = i === selected;
            return (
              <button key={i} type="button" role="radio" aria-checked={on} aria-label={`Zona ${i + 1}: ${VINE_TEXT[m]}`} onClick={() => setVineyard({ selected: i, allZones: false })}
                className={cn("relative overflow-hidden rounded-xl border-[3px] outline-none transition-[border-color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100", on ? "border-vine" : "border-transparent")}>
                <ZoneDrawing zone={z} mood={m} />
                <span className="absolute left-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-card/90 text-sm font-bold shadow-sm">{i + 1}</span>
                <Face mood={m} className="absolute bottom-1.5 right-1.5 size-8 ring-2 ring-white sm:size-10" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 sm:gap-4" aria-live="polite">
          <Face mood={mood} className="size-14 sm:size-16" />
          <div className="min-w-0 flex-1">
            <div className={cn("font-display text-2xl font-bold leading-tight sm:text-3xl", MOOD_TEXT_COLOR[mood])}>{VINE_TEXT[mood]}</div>
            <div className="mt-1 text-sm text-muted-foreground">Zona {selected + 1} · stress {result.s}/100</div>
          </div>
          <button type="button" onClick={onReset} aria-label="Ricomincia" className="grid size-11 shrink-0 place-items-center rounded-full border-2 bg-card text-muted-foreground transition-transform active:scale-95 motion-reduce:active:scale-100"><RotateCcw className="size-5" aria-hidden="true" /></button>
        </div>

        <div className="space-y-3">
          <LevelPicker icon={Sun} label="Sole" tone="bg-warn" value={nearestLevel(zone.temperature, STEPS.temperature)} onChange={(l) => setControl("temperature", l)} levels={["Fresco", "Tiepido", "Caldo", "Rovente"]} />
          <LevelPicker icon={Droplets} label="Acqua nel terreno" tone="bg-urban" value={nearestLevel(zone.moisture, STEPS.moisture)} onChange={(l) => setControl("moisture", l)} levels={["Secco", "Poca", "Giusta", "Tanta"]} />
          <LevelPicker icon={Wind} label="Vento" tone="bg-muted-foreground" value={nearestLevel(zone.wind, STEPS.wind)} onChange={(l) => setControl("wind", l)} levels={["Fermo", "Brezza", "Vento", "Forte"]} />
          <LevelPicker icon={CloudRain} label="Pioggia" tone="bg-water" value={zone.rain ? 1 : 0} onChange={(l) => setRain(l === 1)} levels={["No", "Sì"]} />
        </div>

        <div className="space-y-1.5" role="radiogroup" aria-label="Momento della vite">
          <div className="flex items-center gap-2 px-1 text-sm font-semibold"><span className="grid size-7 place-items-center rounded-full bg-vine text-white"><Grape className="size-4" aria-hidden="true" /></span>Momento della vite</div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {phenoPhases.map((p) => { const Icon = PHASE_ICON[p], on = vine.phase === p; return (
              <button key={p} type="button" role="radio" aria-checked={on} onClick={() => setVineyard({ phase: p })} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 outline-none transition-[transform,border-color] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100", on ? "border-vine bg-vine/10" : "border-transparent bg-muted/60")}>
                <Icon className={cn("size-6", on ? "text-vine" : "text-muted-foreground")} aria-hidden="true" />
                <span className="max-w-full truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{PHASE_SHORT[p]}</span>
              </button>
            ); })}
          </div>
        </div>
      </div>
    </Card>
  );
}
