import { CloudRain, Leaf, Minus, Plus, Sprout, Sun, TreePine, Umbrella, Wallet, type LucideIcon } from "lucide-react";
import { comparison, piazzaEstimate, type PrototypeId } from "@/models/scenarios";
import { setUrban, useLab } from "@/models/lab-store";
import { GAIN_TEXT } from "@/views/v7/studio-ui";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Dial range of perceived heat: the gauge empties toward MIN as the piazza cools. */
const MIN = 30, MAX = 42;
/** Same reading of the three levels as the comparison: how much the piazza has been changed. */
const levelOf = (trees: number, permeable: number, shade: number): PrototypeId => {
  const intensity = (trees / 30 + permeable / 100 + shade / 100) / 3;
  return intensity < 0.2 ? "zero" : intensity < 0.65 ? "mvp" : "roadmap";
};

/** Half-ring gauge: the coloured arc shows how hot the piazza feels, the faint tick where it started. */
function Gauge({ before, after, tone }: { before: number; after: number; tone: string }) {
  const R = 88, C = Math.PI * R;
  const share = (t: number) => clamp((t - MIN) / (MAX - MIN), 0, 1);
  const angle = (t: number) => Math.PI * (1 - share(t));
  const tick = (t: number) => ({ x: 100 + Math.cos(angle(t)) * R, y: 100 - Math.sin(angle(t)) * R });
  const b = tick(before);
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[22rem]" aria-hidden="true">
      <defs>
        <linearGradient id="thermo-scale" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--radar-cool)" /><stop offset="0.3" stopColor="var(--radar-mild)" /><stop offset="0.55" stopColor="var(--radar-warm)" /><stop offset="0.78" stopColor="var(--radar-hot)" /><stop offset="1" stopColor="var(--radar-extreme)" />
        </linearGradient>
      </defs>
      <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="14" strokeLinecap="round" />
      <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="url(#thermo-scale)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${C * share(after)} ${C}`} className={cn("transition-[stroke-dasharray] duration-500 motion-reduce:transition-none", tone)} />
      <circle cx={b.x} cy={b.y} r="5" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" />
    </svg>
  );
}

function Counter({ icon: Icon, label, value, unit, step, max, swatch, onChange }: { icon: LucideIcon; label: string; value: number; unit: string; step: number; max: number; swatch: string; onChange: (v: number) => void }) {
  const set = (v: number) => { const n = clamp(v, 0, max); if (n !== value) { hapticTick(); onChange(n); } };
  const btn = "grid size-14 shrink-0 place-items-center rounded-2xl bg-foreground/[0.07] text-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring active:scale-90 disabled:opacity-30 motion-reduce:active:scale-100";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-foreground/[0.06]" aria-hidden="true">
        <Icon className="size-6" /><span className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-background", swatch)} />
      </span>
      <span className="min-w-0 flex-1 text-base font-semibold">{label}</span>
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= 0} aria-label={`Meno ${label.toLowerCase()}`}><Minus className="size-6" aria-hidden="true" /></button>
      <output className="w-16 text-center font-display text-3xl font-light tabular-nums" aria-live="polite">{value}<span className="text-base text-muted-foreground">{unit}</span></output>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label={`Più ${label.toLowerCase()}`}><Plus className="size-6" aria-hidden="true" /></button>
    </div>
  );
}

/**
 * v9 "C · Termometro": no grid. One big gauge of perceived heat that empties as the piazza cools, three huge
 * + / − counters for trees, lawn and shade, and the yearly benefits and the cost written as plain cards.
 */
export function UrbanThermometer() {
  const urban = useLab().urban;
  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  const before = urban.realTemp ?? 40;
  const after = before - est.dT;
  const gain = est.dT < 0.8 ? 0 : est.dT < 1.8 ? 1 : est.dT < 2.8 ? 2 : est.dT < 3.8 ? 3 : 4;
  const level = comparison.find((l) => l.id === levelOf(urban.trees, urban.permeable, urban.shade)) ?? comparison[0]!;
  // Same yearly estimates as the dashboard (reference piazza of 4000 m², 700 mm of rain).
  const co2 = Math.round(urban.trees * 22);
  const water = Math.round(4000 * (urban.permeable / 100) * 0.7 * 0.6);
  const shadeM2 = Math.round(4000 * (urban.shade / 100) + urban.trees * 30);
  // Counters set totals, so the squares are placed again from the default layout.
  const change = (patch: Partial<typeof urban>) => setUrban({ ...patch, treeCells: null, permeableCells: null, shadeCells: null });

  const facts: Array<{ icon: LucideIcon; value: string; label: string }> = [
    { icon: Leaf, value: `${co2} kg`, label: "CO₂ assorbita" },
    { icon: CloudRain, value: `${water} m³`, label: "Pioggia trattenuta" },
    { icon: Sun, value: `${shadeM2} m²`, label: "All'ombra" },
    { icon: Wallet, value: level.cost, label: level.s },
  ];

  return (
    <section className="fuse-canvas space-y-6 rounded-t-3xl px-3 pb-6 pt-5 text-foreground sm:px-5" aria-label="Termometro della piazza">
      <div className="relative mx-auto flex max-w-[22rem] flex-col items-center">
        <Gauge before={before} after={after} tone={GAIN_TEXT[gain]} />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center" aria-live="polite">
          <span className="font-display text-6xl font-light leading-none tracking-tight tabular-nums">{fmt(after)}°</span>
          <span className={cn("mt-1 font-mono text-lg font-semibold tabular-nums", GAIN_TEXT[gain])}>−{fmt(est.dT)} °C</span>
        </div>
      </div>
      <p className="-mt-3 text-center text-sm text-muted-foreground">calore percepito alle 14–17 · oggi {fmt(before)}°</p>

      <div className="space-y-3">
        <Counter icon={TreePine} label="Alberi" value={urban.trees} unit="" step={1} max={30} swatch="bg-ok" onChange={(v) => change({ trees: v })} />
        <Counter icon={Sprout} label="Prato" value={urban.permeable} unit="%" step={5} max={100} swatch="bg-radar-mild" onChange={(v) => change({ permeable: v })} />
        <Counter icon={Umbrella} label="Ombra" value={urban.shade} unit="%" step={5} max={100} swatch="bg-urban" onChange={(v) => change({ shade: v })} />
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {facts.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl bg-foreground/[0.05] p-3">
            <Icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex min-w-0 flex-col-reverse"><dt className="truncate text-xs text-muted-foreground">{label}</dt><dd className="font-mono text-lg font-semibold tabular-nums">{value}</dd></div>
          </div>
        ))}
      </dl>
    </section>
  );
}
