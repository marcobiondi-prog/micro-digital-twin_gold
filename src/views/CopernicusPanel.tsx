import { useEffect, useState } from "react";
import { ChevronDown, Leaf, Satellite, Thermometer } from "lucide-react";
import { Card } from "@/views/health";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loadCopernicus } from "@/views/copernicus-client";
import { ndviLabel, type CopernicusReading } from "@/models/copernicus";
import { useLab } from "@/models/lab-store";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

/** Premium (signed-in): real Copernicus satellite readings for the selected place, on demand. */
export function CopernicusPanel({ kind }: { kind: "urban" | "vineyard" }) {
  const lab = useLab();
  const location = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopernicusReading | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { setResult(null); setError(null); }, [kind, location.lat, location.lng]);

  const run = async () => {
    if (loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await loadCopernicus(location.lat, location.lng);
      if (!r.configured) setError("Copernicus non è ancora configurato sul server (CDSE_CLIENT_ID e CDSE_CLIENT_SECRET).");
      else setResult(r);
    } catch { setError("Impossibile contattare Copernicus. Verifica di aver effettuato l’accesso e riprova."); }
    finally { setLoading(false); }
  };

  if (signedIn !== true) return null;
  const ndvi = result?.ndvi, temp = result?.surfaceTemp;

  return (
    <Card className="border p-3 sm:p-5">
      <button type="button" aria-expanded={open} aria-controls={`copernicus-panel-${kind}`} onClick={() => setOpen((o) => !o)}
        className="lab-media-trigger -m-2 flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold"><Satellite className="size-4 shrink-0 text-primary" /> Satellite Copernicus</span>
        <ChevronDown className="lab-media-chevron size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <div id={`copernicus-panel-${kind}`} className="lab-media-body" data-open={open} aria-hidden={!open} inert={!open}>
        <div className="lab-media-inner">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Gli stessi dati accompagnano la fotocamera IA: compaiono nella stima termica, guidano la nota sul calore e finiscono nella didascalia delle foto. Ultime immagini senza nuvole di Sentinel-2 (vegetazione, ~250 m attorno al punto) e Sentinel-3 (temperatura della superficie al passaggio del mattino, ~1 km). Dati reali informativi: la griglia del Lab resta una simulazione.</p>
            <Button onClick={run} disabled={loading} className="rounded-full">{loading ? "Lettura dei satelliti…" : "Leggi i dati satellitari"}</Button>
            {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
            {result && <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-muted p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Leaf className="size-3.5" />Indice di vegetazione (NDVI) · Sentinel-2</div>
                {ndvi ? <>
                  <div className="font-display text-2xl font-semibold">{ndvi.value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-sm">{ndviLabel(ndvi.value)}</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">Immagine del {day(ndvi.date)} · scala da −1 a 1</div>
                </> : <p className="mt-1 text-sm text-muted-foreground">Nessuna immagine senza nuvole negli ultimi 60 giorni.</p>}
              </div>
              <div className="rounded-xl bg-muted p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Thermometer className="size-3.5" />Temperatura della superficie · Sentinel-3</div>
                {temp ? <>
                  <div className="font-display text-2xl font-semibold">{temp.value.toLocaleString("it-IT", { maximumFractionDigits: 1 })} °C</div>
                  <div className="text-sm">Suolo, tetti e asfalto, non l’aria</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">Passaggio del {day(temp.date)} · temperatura di brillanza, ~1 km</div>
                </> : <p className="mt-1 text-sm text-muted-foreground">Nessun passaggio senza nuvole negli ultimi 14 giorni.</p>}
              </div>
            </div>}
            {result?.errors.map((e) => <p key={e} role="status" className="text-xs text-danger">{e}</p>)}
            <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noreferrer" className="inline-block text-[11.5px] text-muted-foreground underline">Fonte: Copernicus Data Space Ecosystem (ESA / Commissione europea)</a>
          </div>
        </div>
      </div>
    </Card>
  );
}
