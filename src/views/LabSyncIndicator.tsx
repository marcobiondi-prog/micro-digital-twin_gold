import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { SyncIndicatorText, useLab } from "@/models/lab-store";
import { cn } from "@/lib/utils";

/** Shows when Decision Lab values are saved and propagated to the operational dashboards. */
export function LabSyncIndicator({ className }: { className?: string }) {
  const { savedAt, syncedAt } = useLab();
  const [pulse, setPulse] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 700);
    return () => window.clearTimeout(t);
  }, [savedAt]);
  const time = SyncIndicatorText(syncedAt ?? savedAt);
  return (
    <div role="status" aria-live="polite" className={cn("inline-flex max-w-full items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium", className)}>
      {pulse ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" /> : <CheckCircle2 className="size-4 shrink-0 text-ok" />}
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {pulse
          ? "Salvataggio e aggiornamento dashboard…"
          : time
            ? <span>Ultima sincronizzazione completata alle {time}</span>
            : "Dati delle simulazioni sincronizzati"}
      </span>
    </div>
  );
}
