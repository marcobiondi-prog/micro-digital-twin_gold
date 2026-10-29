import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ResetScenarioButton({ onReset, className }: { onReset: () => void; className?: string }) {
  return <Button type="button" variant="ghost" size="sm" aria-label="Ripristina i valori suggeriti dello scenario" title="Ripristina i valori suggeriti" className={cn("h-7 shrink-0 gap-1 rounded-full border px-2 py-0 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3", className)} onClick={(event) => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const button = event.currentTarget;
      button.getAnimations().forEach((animation) => animation.cancel());
      button.animate([{ transform: "scale(1)" }, { transform: "scale(0.94)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 300, easing: "ease-out" });
      const icon = button.querySelector("svg");
      icon?.getAnimations().forEach((animation) => animation.cancel());
      icon?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-360deg)" }], { duration: 400, easing: "ease-out" });
    }
    onReset();
  }}><RotateCcw aria-hidden="true" />Ripristina</Button>;
}