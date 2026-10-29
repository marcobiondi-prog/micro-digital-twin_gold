import type { ReactNode } from "react";
import { Annoyed, Frown, Laugh, Meh, Smile, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** v1: stato in cinque gradi, da "male" (0) a "benissimo" (4); colore e faccina dicono tutto senza leggere. */
export type Mood = 0 | 1 | 2 | 3 | 4;
const FACES: LucideIcon[] = [Frown, Annoyed, Meh, Smile, Laugh];
export const MOOD_TEXT = ["Troppo caldo", "Caldo", "Così così", "Bene", "Benissimo"] as const;
export const MOOD_BG = ["bg-danger", "bg-radar-hot", "bg-radar-warm", "bg-radar-mild", "bg-ok"] as const;
export const MOOD_TEXT_COLOR = ["text-danger", "text-radar-hot", "text-radar-warm", "text-radar-mild", "text-ok"] as const;

export function Face({ mood, className }: { mood: Mood; className?: string }) {
  const Icon = FACES[mood] ?? Meh;
  return (
    <span role="img" aria-label={MOOD_TEXT[mood]} className={cn("grid shrink-0 place-items-center rounded-full text-white shadow-sm transition-colors duration-300 motion-reduce:transition-none", MOOD_BG[mood], className)}>
      <Icon className="size-[62%]" strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

/** Pulsante grande con icona sopra e parola sotto: si riconosce dall'immagine, la parola aiuta chi legge. */
export function BigButton({ icon: Icon, label, active, onClick, tone, badge, pressed }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void; tone: string; badge?: ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed ?? active}
      className={cn(
        "relative flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 bg-card px-1 py-2 text-xs font-semibold outline-none transition-[transform,border-color,background-color] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100 sm:text-sm",
        active ? "border-primary bg-primary/10" : "border-transparent",
      )}
    >
      <span className={cn("grid size-11 place-items-center rounded-full text-white sm:size-12", tone)}><Icon className="size-6 sm:size-7" aria-hidden="true" /></span>
      <span className="max-w-full truncate">{label}</span>
      {badge != null && <span className="absolute right-1.5 top-1.5 min-w-6 rounded-full bg-foreground px-1.5 text-center text-[11.5px] font-bold leading-5 text-background">{badge}</span>}
    </button>
  );
}

/** Cinque pallini pieni o vuoti: la quantità si vede, non serve leggere il numero. */
export function LevelDots({ value, max, tone }: { value: number; max: number; tone: string }) {
  const filled = Math.round((Math.max(0, Math.min(max, value)) / max) * 5);
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn("size-3 rounded-full transition-colors sm:size-3.5", i < filled ? tone : "bg-muted")} />)}
    </span>
  );
}
