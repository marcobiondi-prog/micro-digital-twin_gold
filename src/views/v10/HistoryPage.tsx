import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Ambient, PageHero } from "@/views/v8/console";
import { ArchiveOnly, HistoryBlock } from "@/views/v10/HistoryBlock";
import { backTarget } from "@/lib/back-to";
import { useEffect, useState } from "react";

/** Back to the page the link was tapped on (Benvenuto, the dashboard…), named after it. */
function useBack(here: string) {
  const navigate = useNavigate();
  const [target, setTarget] = useState({ href: "/benvenuto", label: "Benvenuto" });
  useEffect(() => setTarget(backTarget(here)), [here]);
  return { label: target.label, back: () => void navigate({ href: target.href, replace: true }) };
}

/** The whole history on its own page, opened from Benvenuto or the dashboard: back returns there. */
export function HistoryPage() {
  const { back, label } = useBack("/cronologia");
  return (
    <div className="space-y-6">
      <Ambient tone="rgb(40 130 120 / 0.40)" />
      <button type="button" onClick={back} className="-mb-2 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-5" aria-hidden="true" />{label}
      </button>
      <PageHero kicker="Micro Digital Twin" title="Cronologia" />
      <HistoryBlock />
    </div>
  );
}

/** The archive on its own page: only the archived photos and videos, to bring back; back returns where it was opened from. */
export function ArchivePage() {
  const { back, label } = useBack("/archivio");
  return (
    <div className="space-y-6">
      <Ambient tone="rgb(40 130 120 / 0.40)" />
      <button type="button" onClick={back} className="-mb-2 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-5" aria-hidden="true" />{label}
      </button>
      <PageHero kicker="Foto e video" title="Archivio" />
      <ArchiveOnly />
    </div>
  );
}
