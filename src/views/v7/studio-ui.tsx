import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Colour of a result on the five-step heat scale: 0 = worst (red) … 4 = best (green). */
export const GAIN_TEXT = ["text-radar-extreme", "text-radar-hot", "text-radar-warm", "text-radar-mild", "text-ok"] as const;
export const GAIN_BG = ["bg-radar-extreme", "bg-radar-hot", "bg-radar-warm", "bg-radar-mild", "bg-ok"] as const;
export const HEAT_VAR = ["var(--radar-cool)", "var(--radar-mild)", "var(--radar-warm)", "var(--radar-hot)", "var(--radar-extreme)"] as const;

/** v7 "strumento": the instrument surface, a card that follows the light or dark theme. */
export function Studio({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("studio relative overflow-hidden rounded-2xl bg-card p-3 text-card-foreground sm:p-5", className)}>{children}</section>;
}

/** Big live reading: one number, its unit, and an icon that says what it is. */
export function Readout({ icon: Icon, value, unit, tone, caption, children }: { icon: LucideIcon; value: string; unit: string; tone: string; caption?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3" aria-live="polite">
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl bg-foreground/[0.06] ring-1 ring-foreground/10", tone)}><Icon className="size-6" aria-hidden="true" /></span>
      <div className="min-w-0">
        <div className={cn("flex items-baseline gap-1 font-display text-5xl font-light leading-none tracking-tight tabular-nums transition-colors duration-300 sm:text-6xl", tone)}>{value}<span className="text-lg font-semibold text-foreground/60">{unit}</span></div>
        {caption && <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground/60 sm:text-sm">{caption}</div>}
      </div>
      {children}
    </div>
  );
}

/** Tool in the dock: big icon, short word, a PS5 focus frame in the text colour when active. */
export function ToolButton({ icon: Icon, label, active, onClick, swatch, badge, pressed }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void; swatch?: string; badge?: ReactNode; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed ?? active}
      className={cn("relative flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2 text-[11px] font-semibold uppercase tracking-wide outline-none transition-[background-color,box-shadow,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
        active ? "bg-foreground/[0.12] text-foreground shadow-[0_0_0_2px_var(--foreground),0_0_20px_-2px_color-mix(in_oklab,var(--foreground)_45%,transparent)]" : "bg-foreground/[0.05] text-foreground/60 hover:bg-foreground/[0.08]")}>
      <span className="relative grid size-8 place-items-center">
        <Icon className="size-7" aria-hidden="true" />
        {swatch && <span className={cn("absolute -bottom-1 -right-1 size-3 rounded-full ring-2 ring-card", swatch)} aria-hidden="true" />}
      </span>
      <span className="max-w-full truncate">{label}</span>
      {badge != null && <span className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-foreground/15 px-1 text-center font-mono text-[10px] leading-4 text-foreground">{badge}</span>}
    </button>
  );
}

/** Five segments you can touch directly: the level is visible as filled blocks, the value is written once. */
export function LevelBar({ icon: Icon, label, level, onChange, color, value }: { icon: LucideIcon; label: string; level: number; onChange: (level: number) => void; color: string; value: string }) {
  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_3.75rem] items-center gap-2" role="radiogroup" aria-label={label}>
      <span className="grid size-11 place-items-center rounded-xl bg-foreground/[0.06] text-foreground/80" role="img" aria-label={label}><Icon className="size-6" aria-hidden="true" /></span>
      <div className="grid grid-cols-5 gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={level === i} aria-label={`${label}: livello ${i + 1} di 5`} onClick={() => onChange(i)}
            className="group h-11 rounded-lg bg-foreground/[0.07] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring">
            <span className={cn("block h-full rounded-lg transition-[opacity] duration-200 motion-reduce:transition-none", i <= level ? "opacity-100" : "opacity-0")} style={{ background: color }} />
          </button>
        ))}
      </div>
      <span className="text-right font-mono text-sm font-semibold tabular-nums text-foreground/80">{value}</span>
    </div>
  );
}

/** Thin before → after bar on the heat scale, readable without words. */
export function HeatBar({ from, to, min, max }: { from: number; to: number; min: number; max: number }) {
  const pos = (t: number) => `${Math.max(0, Math.min(100, ((t - min) / (max - min)) * 100))}%`;
  return (
    <div className="relative h-2.5 rounded-full bg-[linear-gradient(90deg,var(--radar-cool),var(--radar-mild),var(--radar-warm),var(--radar-hot),var(--radar-extreme))]" aria-hidden="true">
      <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 bg-[#0d1016]" style={{ left: pos(from) }} />
      <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow-[0_0_10px_rgb(255_255_255/0.7)] transition-[left] duration-500 motion-reduce:transition-none" style={{ left: pos(to) }} />
    </div>
  );
}
