import { useState } from "react";
import { RotateCcw, Sprout, TreePine, Umbrella } from "lucide-react";
import { Card } from "@/views/health";
import { piazzaEstimate } from "@/models/scenarios";
import { setUrban, useLab } from "@/models/lab-store";
import { cn } from "@/lib/utils";
import { Face, LevelPicker, MOOD_TEXT_COLOR, MOOD_VAR, nearestLevel, type Mood } from "./scene-ui";

const TREE_STEPS = [0, 6, 15, 30] as const;
const GRASS_STEPS = [0, 20, 45, 70] as const;
const SHADE_STEPS = [0, 15, 35, 60] as const;

// Posti fissi nella piazza disegnata (prospettiva: più in basso = più vicino = più grande).
const TREE_SPOTS: Array<[number, number]> = [[60, 112], [300, 112], [110, 132], [250, 132], [40, 160], [320, 160], [90, 186], [270, 186], [150, 112], [210, 112], [180, 150], [135, 170], [225, 170], [20, 196], [340, 196], [80, 140], [280, 140], [180, 196], [125, 198], [235, 198], [105, 100], [255, 100], [55, 132], [305, 132], [160, 188], [200, 188], [30, 120], [330, 120], [145, 138], [215, 138]];
const GRASS_SPOTS: Array<[number, number, number]> = [[90, 150, 46], [270, 150, 46], [180, 120, 40], [60, 192, 50], [300, 192, 50], [180, 182, 56], [130, 112, 30]];
const SHADE_SPOTS: Array<[number, number]> = [[130, 150], [230, 150], [180, 108], [80, 176], [280, 176]];

const mix = (hot: number) => `color-mix(in oklab, var(--radar-extreme) ${Math.round(hot * 85)}%, var(--radar-mild))`;

function PiazzaDrawing({ trees, grass, shade, heat, mood }: { trees: number; grass: number; shade: number; heat: number; mood: Mood }) {
  const nTrees = Math.min(TREE_SPOTS.length, trees);
  const nGrass = Math.round((grass / 70) * GRASS_SPOTS.length);
  const nShade = Math.round((shade / 60) * SHADE_SPOTS.length);
  const sunR = 14 + heat * 10;
  return (
    <svg viewBox="0 0 360 210" className="block h-auto w-full" role="img" aria-label={`Piazza con ${nTrees} alberi`}>
      <defs>
        <linearGradient id="v2-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`color-mix(in oklab, var(--radar-hot) ${Math.round(heat * 70)}%, var(--radar-cool))`} />
          <stop offset="1" stopColor="var(--card)" />
        </linearGradient>
      </defs>
      <rect width="360" height="90" fill="url(#v2-sky)" />
      <g fill="var(--muted-foreground)" opacity="0.28">
        <rect x="10" y="38" width="60" height="50" rx="3" /><rect x="76" y="24" width="44" height="64" rx="3" /><rect x="236" y="30" width="52" height="58" rx="3" /><rect x="292" y="46" width="58" height="42" rx="3" />
      </g>
      <g style={{ transition: "all 400ms" }}>
        <circle cx="318" cy="30" r={sunR} fill="var(--warn)" />
        {Array.from({ length: 8 }, (_, k) => { const a = (k * Math.PI) / 4; return <line key={k} x1={318 + Math.cos(a) * (sunR + 4)} y1={30 + Math.sin(a) * (sunR + 4)} x2={318 + Math.cos(a) * (sunR + 4 + heat * 9)} y2={30 + Math.sin(a) * (sunR + 4 + heat * 9)} stroke="var(--warn)" strokeWidth="3" strokeLinecap="round" />; })}
      </g>
      <polygon points="20,86 340,86 360,210 0,210" fill={mix(heat)} style={{ transition: "fill 400ms" }} />
      {GRASS_SPOTS.slice(0, nGrass).map(([x, y, w], k) => <ellipse key={`g${k}`} cx={x} cy={y} rx={w * (0.6 + y / 420)} ry={w * 0.28 * (0.6 + y / 420)} fill="var(--ok)" opacity="0.85" />)}
      {SHADE_SPOTS.slice(0, nShade).map(([x, y], k) => { const s = 0.6 + y / 300; return (
        <g key={`s${k}`} transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="0" cy="8" rx="26" ry="7" fill="var(--foreground)" opacity="0.18" />
          <line x1="0" y1="8" x2="0" y2="-18" stroke="var(--muted-foreground)" strokeWidth="2.5" />
          <path d="M-24 -16 Q0 -38 24 -16 Z" fill="var(--urban)" />
        </g>
      ); })}
      {TREE_SPOTS.slice(0, nTrees).sort((a, b) => a[1] - b[1]).map(([x, y], k) => { const s = 0.45 + y / 260; return (
        <g key={`t${k}`} transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="0" cy="4" rx="18" ry="5" fill="var(--foreground)" opacity="0.2" />
          <rect x="-2.5" y="-14" width="5" height="18" rx="2" fill="oklch(0.45 0.07 60)" />
          <circle cx="0" cy="-24" r="15" fill="var(--leaf)" />
          <circle cx="-6" cy="-28" r="6" fill="var(--ok)" opacity="0.7" />
        </g>
      ); })}
      <g opacity={Math.max(0, heat - 0.15)} stroke="var(--radar-extreme)" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M60 100 q8 -8 16 0 t16 0" /><path d="M170 96 q8 -8 16 0 t16 0" /><path d="M270 104 q8 -8 16 0 t16 0" />
      </g>
      <g transform="translate(180 200)">
        <circle cx="0" cy="-34" r="9" fill={MOOD_VAR[mood]} />
        <rect x="-6" y="-24" width="12" height="20" rx="5" fill="var(--foreground)" opacity="0.75" />
      </g>
    </svg>
  );
}

/** v2 "Prima e dopo": la piazza disegnata cambia con tre scelte a figure; si confronta prima e dopo con un tocco. */
export function UrbanScene({ onReset }: { onReset: () => void }) {
  const urban = useLab().urban;
  const [view, setView] = useState<"prima" | "dopo">("dopo");
  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  const before = urban.realTemp ?? 40;
  const moodOf = (dT: number) => (dT < 0.8 ? 0 : dT < 1.8 ? 1 : dT < 2.8 ? 2 : dT < 3.8 ? 3 : 4) as Mood;
  const mood = moodOf(est.dT);
  const showing = view === "prima" ? { trees: 0, grass: 0, shade: 0, heat: 1, mood: 0 as Mood } : { trees: urban.trees, grass: urban.permeable, shade: urban.shade, heat: Math.max(0, 1 - est.dT / 5.2), mood };
  const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const set = (patch: Partial<typeof urban>) => { setView("dopo"); setUrban({ ...patch, treeCells: null, permeableCells: null, shadeCells: null }); };

  return (
    <Card className="p-3 sm:p-5">
      <div className="mx-auto w-full max-w-[44rem] space-y-4 sm:space-y-5">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Prima o dopo gli interventi">
          {(["prima", "dopo"] as const).map((v) => {
            const on = view === v, m = v === "prima" ? 0 : mood, t = v === "prima" ? before : before - est.dT;
            return (
              <button key={v} type="button" role="tab" aria-selected={on} onClick={() => setView(v)}
                className={cn("flex items-center gap-2.5 rounded-2xl border-2 p-2.5 text-left outline-none transition-[border-color,background-color] focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-3", on ? "border-primary bg-primary/10" : "border-transparent bg-muted/60")}>
                <Face mood={m as Mood} className="size-11 sm:size-14" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold capitalize">{v}</span>
                  <span className={cn("block font-display text-2xl font-bold leading-tight sm:text-3xl", MOOD_TEXT_COLOR[m as Mood])}>{fmt(t)}°</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-card">
          <PiazzaDrawing {...showing} />
          <span className={cn("absolute left-2 top-2 rounded-full px-3 py-1 text-sm font-bold text-white shadow sm:left-3 sm:top-3 sm:text-base", view === "prima" ? "bg-danger" : "bg-ok")} aria-live="polite">{view === "prima" ? "Prima" : `−${fmt(est.dT)}°`}</span>
          <button type="button" onClick={() => { setView("dopo"); onReset(); }} aria-label="Ricomincia" className="absolute bottom-2 right-2 grid size-11 place-items-center rounded-full border-2 bg-card/90 text-muted-foreground shadow-sm transition-transform active:scale-95 motion-reduce:active:scale-100 sm:bottom-3 sm:right-3"><RotateCcw className="size-5" aria-hidden="true" /></button>
        </div>

        <div className="space-y-3">
          <LevelPicker icon={TreePine} label="Alberi" tone="bg-ok" value={nearestLevel(urban.trees, TREE_STEPS)} onChange={(l) => set({ trees: TREE_STEPS[l] ?? 0 })} />
          <LevelPicker icon={Sprout} label="Prato" tone="bg-radar-mild" value={nearestLevel(urban.permeable, GRASS_STEPS)} onChange={(l) => set({ permeable: GRASS_STEPS[l] ?? 0 })} />
          <LevelPicker icon={Umbrella} label="Ombra" tone="bg-urban" value={nearestLevel(urban.shade, SHADE_STEPS)} onChange={(l) => set({ shade: SHADE_STEPS[l] ?? 0 })} />
        </div>
      </div>
    </Card>
  );
}
