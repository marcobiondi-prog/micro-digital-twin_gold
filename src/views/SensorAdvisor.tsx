import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Lock, Radar, Thermometer } from "lucide-react";
import { Card } from "@/views/health";
import { Button } from "@/components/ui/button";
import { useSignedIn } from "@/lib/use-signed-in";
import { openAccount } from "@/lib/camera-dock";
import { suggestHeatSensors, type NetworkSummary, type SensorPick } from "@/controllers/sensor-ai.functions";
import { useLab } from "@/models/lab-store";
import { exampleSensorSuggestion } from "@/models/sensor-example";

const tone: Record<string, string> = { alta: "bg-danger/15 text-danger", media: "bg-warn/15 text-warn", bassa: "bg-ok/15 text-ok" };

/** `embedded`: inside a page section (Fold) that brings its own title, so no own toggle. */
export function SensorAdvisor({ kind, embedded = false }: { kind: "urban" | "vineyard"; embedded?: boolean }) {
  const suggest = useServerFn(suggestHeatSensors);
  const lab = useLab();
  const location = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const { signedIn, demo } = useSignedIn();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  const [result, setResult] = useState<{ sintesi: string; sensori: SensorPick[]; network: NetworkSummary } | null>(null);

  useEffect(() => { setResult(null); setError(null); }, [kind, location.lat, location.lng]);

  const run = async () => {
    if (loading) return;
    // The suggestion runs on an auth-protected server function: a simulated sign-in shows a labelled example instead.
    if (demo) { setError(null); setExample(true); setResult(exampleSensorSuggestion(kind, location.lat, location.lng)); return; }
    setExample(false);
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await suggest({ data: { kind, label: location.label, lat: location.lat, lng: location.lng } });
      if ("error" in r && r.error) setError(r.error);
      else if ("sensori" in r && r.network) setResult({ sintesi: r.sintesi ?? "", sensori: r.sensori ?? [], network: r.network });
    } catch { setError("Impossibile contattare il servizio AI. Verifica di aver effettuato l’accesso."); }
    finally { setLoading(false); }
  };

  // Guests see what the tool does and a sign-in button instead of the panel (like the AI camera).
  if (!signedIn) {
    if (!embedded) return null;
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Radar className="size-5" aria-hidden="true" /><span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-foreground text-background ring-2 ring-card"><Lock className="size-3" aria-hidden="true" /></span></span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">L’AI suggerisce dove mettere i sensori di calore {kind === "urban" ? "nella piazza" : "nel vigneto"}. Accedi per usarla.</p>
        <Button size="sm" className="shrink-0 rounded-full" onClick={openAccount}>Accedi</Button>
      </Card>
    );
  }

  return (
    <Card className="border p-3 sm:p-5">
      {!embedded && (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`sensor-panel-${kind}`}
        onClick={() => setOpen((o) => !o)}
        className="lab-media-trigger -m-2 flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold"><Radar className="size-4 shrink-0 text-primary" /> Dove installare sensori di calore</span>
        <ChevronDown className="lab-media-chevron size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      )}
      <div id={`sensor-panel-${kind}`} className="lab-media-body" data-open={open} aria-hidden={!open} inert={!open}>
        <div className="lab-media-inner">
          <div className="space-y-3">
      <p className="text-xs text-muted-foreground">L’AI analizza i sensori attivi e i luoghi sensibili attorno alla zona selezionata. Suggerimenti indicativi.</p>
          <Button onClick={run} disabled={loading} className="rounded-full">{loading ? "Analisi della rete…" : "Suggerisci posizioni"}</Button>
          {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
          {result && (
            <div className="mt-4 space-y-2" aria-live="polite">
              <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-muted p-2"><div className="text-muted-foreground">Sensori attivi</div><div className="font-mono font-semibold">{result.network.sensoriEsistenti}</div></div>
                <div className="rounded-lg bg-muted p-2"><div className="text-muted-foreground">Temp. media</div><div className="font-mono font-semibold">{result.network.temperaturaMedia != null ? `${result.network.temperaturaMedia}°C` : "—"}</div></div>
                <div className="rounded-lg bg-muted p-2"><div className="text-muted-foreground">Luoghi sensibili</div><div className="font-mono font-semibold">{result.network.puntiSensibili}</div></div>
                <div className="rounded-lg bg-muted p-2"><div className="text-muted-foreground">Fermate bus</div><div className="font-mono font-semibold">{result.network.fermate}</div></div>
              </div>
              {example && <p className="rounded-xl border border-dashed border-primary/50 bg-primary/5 p-3 text-xs text-muted-foreground"><b className="text-foreground">Esempio</b> (accesso simulato): con un account vero l’AI usa i sensori e i luoghi reali attorno alla zona.</p>}
              {result.sintesi && <p className="text-sm text-muted-foreground">{result.sintesi}</p>}
              {result.sensori.map((s, i) => (
                <div key={i} className="rounded-xl bg-muted p-3 text-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold"><Thermometer className="size-4 shrink-0 text-primary" /><span className="break-words">{s.nome}</span></div>
                      {s.luogo && <p className="mt-0.5 break-words text-xs text-muted-foreground">{s.luogo}</p>}
                      <a className="font-mono text-[11px] text-muted-foreground underline" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</a>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${tone[s.priorita]}`}>{s.priorita}</span>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">{s.motivi.map((m, k) => <li key={k}>{m}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </Card>
  );
}
