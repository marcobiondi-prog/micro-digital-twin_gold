import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { SEASON_LABEL } from "@/models/season-climate";
import { Ambient, PageHero, openSimTab } from "@/views/v8/console";
import { DashCard, DashSection } from "@/views/v10/Dashboard";
import { reopenHistory, useHistory } from "@/lib/use-history";
import { mixRows, whenOf, type HistoryEntry, type SourcedEntry } from "@/models/intervention-history";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[16px] font-medium tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

/** One recorded intervention to read: when it was saved, the season and hour simulated, and what was set. */
export function HistoryDetail({ id }: { id: string }) {
  const { entries, loading } = useHistory();
  const navigate = useNavigate();
  const e: SourcedEntry | undefined = entries.find((x) => x.id === id);
  const back = () => {
    if ((window.history.state?.__TSR_index ?? 0) > 0) window.history.back();
    else void navigate({ to: "/cronologia", replace: true });
  };
  // Only on request: the same interventions, season and hour back in the simulation.
  const resume = (entry: HistoryEntry) => {
    if (!entry.mix) return;
    reopenHistory(entry.mix, whenOf(entry));
    openSimTab(entry.flow === "piazza" ? "urban" : "vineyard", "simula");
    toast.success("Intervento ripreso nella simulazione", { description: entry.text });
    void navigate({ to: entry.flow === "piazza" ? "/urbano" : "/vigneto" });
  };
  const w = e ? whenOf(e) : null;
  const d = e ? new Date(e.at) : null;
  return (
    <div className="space-y-6">
      <Ambient tone="rgb(40 130 120 / 0.40)" />
      <button type="button" onClick={back} className="-mb-2 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-5" aria-hidden="true" />Cronologia
      </button>
      <PageHero kicker={e ? `${e.flow === "piazza" ? "Piazza" : "Vigneto"}${e.place ? ` · ${e.place}` : ""}` : "Cronologia"} title="Intervento" />
      {!e || !d ? (
        <DashCard><p className="text-[16px]">{loading ? "Carico l’intervento…" : "Questo intervento non è più nella cronologia."}</p></DashCard>
      ) : (
        <>
          <DashSection title="Quando">
            <DashCard className="py-1 sm:py-1">
              <dl className="divide-y divide-foreground/10">
                <Row label="Registrato il" value={d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
                <Row label="Ora di registrazione" value={d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} />
                <Row label="Stagione simulata" value={w ? SEASON_LABEL[w.season] : "Non registrata"} />
                <Row label="Ora simulata" value={w ? `ore ${w.hour}` : "Non registrata"} />
                <Row label="Salvato" value={e.source === "account" ? "Con accesso, nel tuo account" : "Senza accesso, su questo dispositivo"} />
              </dl>
            </DashCard>
          </DashSection>
          <DashSection title="Interventi fatti">
            {e.mix ? mixRows(e.mix).map((g) => (
              <div key={g.title} className="space-y-2">
                <h3 className="px-1 text-sm font-medium text-muted-foreground">{g.title}</h3>
                <DashCard className="py-1 sm:py-1">
                  <dl className="divide-y divide-foreground/10">{g.rows.map((r) => <Row key={r.label} {...r} />)}</dl>
                </DashCard>
              </div>
            )) : <DashCard><p className="text-[16px]">{e.text}</p></DashCard>}
          </DashSection>
          {e.mix && (
            <button type="button" onClick={() => resume(e)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-sm font-semibold outline-none hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring">
              <RotateCcw className="size-4" aria-hidden="true" />Riprendi nella simulazione
            </button>
          )}
        </>
      )}
    </div>
  );
}
