import type { LucideIcon } from "lucide-react";
import { Annoyed, Frown, Laugh, Meh, Smile } from "lucide-react";
import { cn } from "@/lib/utils";

/** v2: cinque gradi di benessere, da 0 (male) a 4 (benissimo). */
export type Mood = 0 | 1 | 2 | 3 | 4;
const FACES: LucideIcon[] = [Frown, Annoyed, Meh, Smile, Laugh];
export const MOOD_TEXT = ["Troppo caldo", "Caldo", "Così così", "Bene", "Benissimo"] as const;
export const MOOD_BG = ["bg-danger", "bg-radar-hot", "bg-radar-warm", "bg-radar-mild", "bg-ok"] as const;
export const MOOD_TEXT_COLOR = ["text-danger", "text-radar-hot", "text-radar-warm", "text-radar-mild", "text-ok"] as const;
export const MOOD_VAR = ["var(--danger)", "var(--radar-hot)", "var(--radar-warm)", "var(--radar-mild)", "var(--ok)"] as const;

export function Face({ mood, className, label }: { mood: Mood; className?: string; label?: string }) {
  const Icon = FACES[mood] ?? Meh;
  return (
    <span role="img" aria-label={label ?? MOOD_TEXT[mood]} className={cn("grid shrink-0 place-items-center rounded-full text-white shadow-sm transition-colors duration-300 motion-reduce:transition-none", MOOD_BG[mood], className)}>
      <Icon className="size-[62%]" strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

/**
 * Scelta a figure: quattro livelli (niente, poco, tanto, tantissimo) mostrati come 0–3 icone.
 * Si capisce contando le figure, la parola sotto è solo un aiuto.
 */
export function LevelPicker({ icon: Icon, label, tone, value, onChange, levels = ["Niente", "Poco", "Tanto", "Moltissimo"] }: { icon: LucideIcon; label: string; tone: string; value: number; onChange: (level: number) => void; levels?: readonly string[] }) {
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label={label}>
      <div className="flex items-center gap-2 px-1 text-sm font-semibold"><span className={cn("grid size-7 place-items-center rounded-full text-white", tone)}><Icon className="size-4" aria-hidden="true" /></span>{label}</div>
      <div className={cn("grid gap-1.5 sm:gap-2", levels.length === 2 ? "grid-cols-2" : "grid-cols-4")}>
        {levels.map((name, level) => {
          const on = value === level;
          return (
            <button key={name} type="button" role="radio" aria-checked={on} aria-label={`${label}: ${name}`} onClick={() => onChange(level)}
              className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 outline-none transition-[transform,border-color,background-color] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100", on ? "border-primary bg-primary/10" : "border-transparent bg-muted/60")}>
              <span className="flex h-7 items-center justify-center gap-0.5" aria-hidden="true">
                {level === 0
                  ? <span className="size-5 rounded-full border-2 border-dashed border-muted-foreground/60" />
                  : Array.from({ length: level }, (_, k) => <Icon key={k} className={cn("size-5 sm:size-6", on ? "text-primary" : "text-muted-foreground")} />)}
              </span>
              <span className="max-w-full truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Indice del livello più vicino al valore attuale, per mostrare la scelta corrente anche dopo Confronta. */
export const nearestLevel = (value: number, steps: readonly number[]) => steps.reduce((best, step, i) => (Math.abs(step - value) < Math.abs((steps[best] ?? 0) - value) ? i : best), 0);
