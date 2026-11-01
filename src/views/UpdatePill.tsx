import { Download, Check } from "lucide-react";
import { useUpdateProgress } from "@/lib/update-progress";

/**
 * While a new version installs (found on return to the app, every 15 minutes or by "Cerca aggiornamenti"), a small
 * glass pill at the top of the screen with a filling bar and the percentage; "Installata" for a moment at the end,
 * then the lasting "Nuova versione dell'app pronta" toast offers Aggiorna.
 */
export function UpdatePill() {
  const { phase, pct } = useUpdateProgress();
  // While "Cerca aggiornamenti" is only asking, the account panel's own bar is enough.
  if (phase === "idle" || phase === "checking") return null;
  const done = phase === "ready";
  return (
    <div role="status" aria-live="polite" className="update-pill pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+8px)] z-[70] w-[min(18rem,calc(100vw-32px))] -translate-x-1/2 rounded-2xl bg-black/55 px-3 py-2 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        {done ? <Check className="size-4 text-[var(--brand-turquoise)]" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
        <span className="flex-1">{done ? "Nuova versione installata" : phase === "applying" ? "Carico la nuova versione" : "Installo la nuova versione"}</span>
        <span className="tabular-nums text-white/80">{pct} %</span>
      </p>
      <div role="progressbar" aria-label="Installazione della nuova versione" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-[var(--brand-turquoise)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
