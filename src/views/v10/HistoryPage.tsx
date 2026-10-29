import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Ambient, PageHero } from "@/views/v8/console";
import { HistoryBlock } from "@/views/v10/HistoryBlock";

/** The whole history on its own page, opened from Benvenuto: back returns there. */
export function HistoryPage() {
  const navigate = useNavigate();
  const back = () => {
    if ((window.history.state?.__TSR_index ?? 0) > 0) window.history.back();
    else void navigate({ to: "/benvenuto", replace: true });
  };
  return (
    <div className="space-y-6">
      <Ambient tone="rgb(40 130 120 / 0.40)" />
      <button type="button" onClick={back} className="-mb-2 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-5" aria-hidden="true" />Benvenuto
      </button>
      <PageHero kicker="Micro Digital Twin" title="Cronologia" />
      <HistoryBlock />
    </div>
  );
}
