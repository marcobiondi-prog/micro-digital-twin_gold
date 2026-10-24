import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useLab } from "@/models/lab-store";
import { cn } from "@/lib/utils";

/**
 * Brief notice while simulation values are saved and sent to the dashboards: "Salvataggio…",
 * then "Salvato" for a moment, then nothing visible (the status stays for screen readers).
 * It floats at the top of the page, so it never takes a row of its own.
 */
export function LabSyncIndicator({ className }: { className?: string }) {
  const { savedAt } = useLab();
  const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setPhase("saving");
    const saved = window.setTimeout(() => setPhase("saved"), 700);
    const idle = window.setTimeout(() => setPhase("idle"), 1900);
    return () => { window.clearTimeout(saved); window.clearTimeout(idle); };
  }, [savedAt]);
  return (
    <div role="status" aria-live="polite" className={cn(phase === "idle" ? "sr-only" : "pointer-events-none fixed inset-x-0 top-[calc(var(--nav-h)+0.75rem)] z-[999999999] flex justify-center px-4 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none", className)}>
      {phase === "idle" ? "Dati delle simulazioni salvati" : (
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-md">
          {phase === "saving" ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden="true" />}
          {phase === "saving" ? "Salvataggio…" : "Salvato"}
        </span>
      )}
    </div>
  );
}
