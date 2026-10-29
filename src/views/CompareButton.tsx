import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CompareLevel = "zero" | "mvp" | "roadmap";

/** Etichette dei tre livelli di intervento, usate anche come indizio live sul pulsante. */
const levelTag: Record<CompareLevel, string> = {
  zero: "gratis",
  mvp: "pochi sensori",
  roadmap: "completo",
};

/**
 * Invoco principale al confronto scenari: più grande dei pulsanti vicini,
 * nel blu del sito, con una luce che corre lungo il bordo come nei pannelli IA.
 * La piccola etichetta mostra il livello oggi in evidenza nella griglia.
 */
export function CompareButton({ level, onClick, className }: { level: CompareLevel; onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      aria-label={`Apri il confronto degli scenari · livello ${levelTag[level]}`}
      className={cn(
        "compare-cta h-10 shrink-0 gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 sm:px-5",
        className,
      )}
    >
      <span className="compare-cta-glow" aria-hidden="true" />
      <Scale />
      Confronta
      <span className="hidden items-center rounded-full bg-primary-foreground px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary sm:inline-flex">
        {levelTag[level]}
      </span>
    </Button>
  );
}
