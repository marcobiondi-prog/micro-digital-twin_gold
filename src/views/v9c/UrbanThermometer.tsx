import { useRef, useState } from "react";
import { CloudRain, Leaf, Minus, Plus, RotateCcw, Sprout, Sun, TreePine, Umbrella, Wallet, type LucideIcon } from "lucide-react";
import { comparison, piazzaEstimate, type PrototypeId } from "@/models/scenarios";
import { setUrban, useLab } from "@/models/lab-store";
import { GAIN_BG, GAIN_TEXT } from "@/views/v7/studio-ui";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Dial range of perceived heat: the gauge empties toward MIN as the piazza cools. */
const MIN = 30, MAX = 42;
const MARKS = 10;
/** The three ready piazzas: one touch to start, then fine-tune with the levers. */
const PRESETS: Array<{ id: PrototypeId; trees: number; permeable: number; shade: number }> = [
  { id: "zero", trees: 3, permeable: 10, shade: 10 },
  { id: "mvp", trees: 6, permeable: 20, shade: 15 },
  { id: "roadmap", trees: 12, permeable: 40, shade: 30 },
];
/** The level whose ready piazza gains the closest number of degrees: it names the cost of what is on screen. */
const levelOf = (dT: number): PrototypeId => {
  const gainOf = (p: (typeof PRESETS)[number]) => piazzaEstimate(p.trees, p.permeable, p.shade).dT;
  return PRESETS.reduce((best, p) => (Math.abs(gainOf(p) - dT) < Math.abs(gainOf(best) - dT) ? p : best)).id;
};
/** How it feels at the hottest hours, in plain words and on the five-step scale (0 = worst). */
const feeling = (t: number): { text: string; step: number } =>
  t >= 39 ? { text: "Troppo caldo", step: 0 } : t >= 36 ? { text: "Molto caldo", step: 1 } : t >= 33 ? { text: "Caldo", step: 2 } : { text: "Si sta bene", step: 4 };

/** Half-ring gauge: the coloured arc and the white dot show how hot the piazza feels now, the faint ring where today starts. */
function Gauge({ before, after }: { before: number; after: number }) {
  const R = 88, C = Math.PI * R;
  const share = (t: number) => clamp((t - MIN) / (MAX - MIN), 0, 1);
  const angle = (t: number) => Math.PI * (1 - share(t));
  const at = (t: number) => ({ x: 100 + Math.cos(angle(t)) * R, y: 100 - Math.sin(angle(t)) * R });
  const b = at(before), a = at(after);
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[22rem]" aria-hidden="true">
      <defs>
        <linearGradient id="thermo-scale" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--radar-cool)" /><stop offset="0.3" stopColor="var(--radar-mild)" /><stop offset="0.55" stopColor="var(--radar-warm)" /><stop offset="0.78" stopColor="var(--radar-hot)" /><stop offset="1" stopColor="var(--radar-extreme)" />
        </linearGradient>
      </defs>
      <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="14" strokeLinecap="round" />
      <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="url(#thermo-scale)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${C * share(after)} ${C}`} className="transition-[stroke-dasharray] duration-500 motion-reduce:transition-none" />
      <circle cx={b.x} cy={b.y} r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
      <circle cx={a.x} cy={a.y} r="8" fill="#fff" stroke="#0d1016" strokeWidth="2.5" className="transition-[cx,cy] duration-500 motion-reduce:transition-none" />
      <text x="12" y="111" fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.55">{MIN}°</text>
      <text x="188" y="111" fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.55">{MAX}°</text>
    </svg>
  );
}

/**
 * One intervention: big − / +, its icon and name, a row of ten marks that fill as it grows (the quantity is seen,
 * not read) and how many degrees it takes away on its own.
 */
function Lever({ icon: Icon, label, value, step, max, color, swatch, cooling, onChange }: { icon: LucideIcon; label: string; value: number; step: number; max: number; color: string; swatch: string; cooling: number; onChange: (v: number) => void }) {
  const set = (v: number) => { const n = clamp(v, 0, max); if (n !== value) { hapticTick(); onChange(n); } };
  const filled = Math.round((value / max) * MARKS);
  const unit = step === 1 ? "" : "%";
  const btn = "grid size-14 shrink-0 place-items-center rounded-2xl bg-foreground/[0.07] text-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring active:scale-90 disabled:opacity-30 motion-reduce:active:scale-100";
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-foreground/[0.04] p-3" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= 0} aria-label={`Meno ${label.toLowerCase()}`}><Minus className="size-6" aria-hidden="true" /></button>
      <div className="min-w-0 flex-1" aria-live="polite">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-6 shrink-0", color)} aria-hidden="true" />
          <span className="truncate text-base font-semibold">{label}</span>
          <span className="ml-auto shrink-0 font-mono text-sm font-semibold tabular-nums">{value}{unit}</span>
        </div>
        <div className="mt-2 grid grid-cols-10 gap-1" aria-hidden="true">
          {Array.from({ length: MARKS }, (_, k) => <span key={k} className={cn("h-2.5 rounded-full transition-colors duration-200 motion-reduce:transition-none", k < filled ? swatch : "bg-foreground/10")} />)}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">−{fmt(cooling)} °C da sola</p>
      </div>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label={`Più ${label.toLowerCase()}`}><Plus className="size-6" aria-hidden="true" /></button>
    </div>
  );
}

/**
 * v9 "C · Termometro": no grid. Pick a ready piazza or move the three levers; a big gauge with a dot shows how hot
 * the piazza feels and says it in words, a chip tells what the last touch gained, and four cards give benefits and cost.
 */
export function UrbanThermometer() {
  const urban = useLab().urban;
  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  const before = urban.realTemp ?? 40;
  const after = before - est.dT;
  const gain = est.dT < 0.8 ? 0 : est.dT < 1.8 ? 1 : est.dT < 2.8 ? 2 : est.dT < 3.8 ? 3 : 4;
  const feel = feeling(after);
  const preset = PRESETS.find((p) => p.trees === urban.trees && p.permeable === urban.permeable && p.shade === urban.shade)?.id ?? null;
  const level = comparison.find((l) => l.id === (preset ?? levelOf(est.dT))) ?? comparison[0]!;
  // Same yearly estimates as the dashboard (reference piazza of 4000 m², 700 mm of rain).
  const co2 = Math.round(urban.trees * 22);
  const water = Math.round(4000 * (urban.permeable / 100) * 0.7 * 0.6);
  const shadeM2 = Math.round(4000 * (urban.shade / 100) + urban.trees * 30);

  // The last change, shown as a short-lived chip ("−0,3°") so every touch answers.
  const [delta, setDelta] = useState<{ v: number; k: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Levers set totals, so the squares are placed again from the default layout.
  const change = (patch: { trees?: number; permeable?: number; shade?: number }) => {
    const next = { trees: urban.trees, permeable: urban.permeable, shade: urban.shade, ...patch };
    const d = piazzaEstimate(next.trees, next.permeable, next.shade).dT - est.dT;
    setUrban({ ...patch, treeCells: null, permeableCells: null, shadeCells: null });
    window.clearTimeout(timer.current);
    setDelta((p) => ({ v: d, k: (p?.k ?? 0) + 1 }));
    timer.current = window.setTimeout(() => setDelta(null), 1600);
  };

  const facts: Array<{ icon: LucideIcon; value: string; label: string }> = [
    { icon: Leaf, value: `${co2} kg`, label: "CO₂ assorbita" },
    { icon: CloudRain, value: `${water} m³`, label: "Pioggia trattenuta" },
    { icon: Sun, value: `${shadeM2} m²`, label: "All'ombra" },
    { icon: Wallet, value: level.cost, label: level.s },
  ];

  return (
    <section className="fuse-canvas space-y-5 rounded-t-3xl px-3 pb-6 pt-4 text-foreground sm:px-5" aria-label="Termometro della piazza">
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-2" role="group" aria-label="Piazze già pronte">
        {PRESETS.map((p) => {
          const l = comparison.find((c) => c.id === p.id)!, on = preset === p.id;
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => change({ trees: p.trees, permeable: p.permeable, shade: p.shade })}
              className={cn("flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 py-1.5 text-center outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:active:scale-100",
                on ? "bg-foreground/[0.12] shadow-[0_0_0_2px_var(--foreground)]" : "bg-foreground/[0.05] hover:bg-foreground/[0.08]")}>
              <span className="text-[12px] font-semibold leading-tight">{l.s}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{l.cost}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => { hapticTick(); change({ trees: 0, permeable: 0, shade: 0 }); }} aria-label="Piazza vuota: si riparte da zero" title="Piazza vuota"
          className="grid min-h-14 w-12 place-items-center rounded-2xl bg-foreground/[0.05] outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring"><RotateCcw className="size-5" aria-hidden="true" /></button>
      </div>

      <div className="relative mx-auto flex max-w-[22rem] flex-col items-center">
        <Gauge before={before} after={after} />
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center" aria-live="polite">
          <span className={cn("rounded-full px-3 py-0.5 text-sm font-semibold text-white transition-colors duration-300", GAIN_BG[feel.step])}>{feel.text}</span>
          <span className="mt-1 font-display text-6xl font-light leading-none tracking-tight tabular-nums">{fmt(after)}°</span>
        </div>
        {delta && Math.abs(delta.v) >= 0.05 && (
          <span key={delta.k} className="absolute right-3 top-12 rounded-full bg-foreground px-2.5 py-1 font-mono text-sm font-bold text-background animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none" aria-hidden="true">
            {delta.v > 0 ? "−" : "+"}{fmt(Math.abs(delta.v))}°
          </span>
        )}
      </div>
      <p className="-mt-2 text-center text-sm text-muted-foreground">
        alle 14–17 · oggi {fmt(before)}° · <b className={cn("font-semibold", GAIN_TEXT[gain])}>−{fmt(est.dT)} °C</b>
      </p>

      <div className="space-y-2.5">
        <Lever icon={TreePine} label="Alberi" value={urban.trees} step={1} max={30} color="text-ok" swatch="bg-ok" cooling={urban.trees * 0.25} onChange={(v) => change({ trees: v })} />
        <Lever icon={Sprout} label="Prato" value={urban.permeable} step={10} max={100} color="text-radar-mild" swatch="bg-radar-mild" cooling={urban.permeable * 0.04} onChange={(v) => change({ permeable: v })} />
        <Lever icon={Umbrella} label="Ombra" value={urban.shade} step={10} max={100} color="text-urban" swatch="bg-urban" cooling={urban.shade * 0.03} onChange={(v) => change({ shade: v })} />
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
