import { useState } from "react";
import { ArrowRight, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/views/health";
import { LabSyncIndicator } from "@/views/LabSyncIndicator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SensorAdvisor } from "@/views/SensorAdvisor";
import { LabMedia } from "@/views/LabMedia";
import { splitLocation } from "@/views/SimulationGrid";
import { UrbanThermometer } from "@/views/v9c/UrbanThermometer";
import { VineThirst } from "@/views/v10/VineThirst";
import { VINE_LEVELS, vineMixOf } from "@/models/vine-interventions";
import { SimShell } from "@/views/v8/SimShell";
import { comparison, levelTone, nextPhase, prototypeChoice, type PrototypeId } from "@/models/scenarios";
import { resetUrban, resetVineyard, setUrban, setVineyard, useLab, type LabState } from "@/models/lab-store";
import { useServerFn } from "@tanstack/react-start";
import { getRealClimate } from "@/controllers/climate.functions";



function urbanPrototypeLevel(trees: number, permeable: number, shade: number): PrototypeId {
  const intensity = (trees / 30 + permeable / 100 + shade / 100) / 3;
  return intensity < 0.2 ? "zero" : intensity < 0.65 ? "mvp" : "roadmap";
}



function PrototypeMatrix({ kind, activeLevel }: { kind: "urban" | "vineyard"; activeLevel: PrototypeId }) {
  return (
    <section aria-labelledby={`proto-${kind}`} className="space-y-3">
      <div className="flex items-center gap-2"><FlaskConical className="size-5 shrink-0 text-primary" /><h3 id={`proto-${kind}`} className="font-semibold">Quanto costa e cosa si impara</h3></div>
      <div className="grid gap-3 md:grid-cols-3">
        {comparison.map((l) => {
          const selected = l.id === activeLevel;
          const tone = levelTone[l.id];
          return (
          <div key={l.id} className={`min-w-0 rounded-lg border p-3 ${tone.border} ${selected ? tone.sel : "bg-card"}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-semibold"><span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />{l.s}</h4>
              {selected && <StatusBadge level="basso">In evidenza</StatusBadge>}
            </div>
            <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.value}`}>{l.dt}</p>
            <p className="mt-2 text-xs text-muted-foreground">{l.def}</p>
            <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Costo</dt><dd className="font-mono text-xs font-semibold">{l.cost}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Precisione</dt><dd className="break-words font-mono text-xs font-semibold">{l.prec}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Tempi</dt><dd className="break-words font-mono text-xs font-semibold">{l.time}</dd></div>
            </dl>
            <div className="mt-3 border-t pt-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Cosa vogliamo scoprire</span>
              <p className="mt-1 text-sm">{l.test[kind]}</p>
            </div>
          </div>
        );})}
      </div>
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"><span className="font-semibold">Perché pochi sensori: </span>{prototypeChoice}</div>
      <p className="flex items-start gap-2 text-sm font-medium"><ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />{nextPhase}</p>
    </section>
  );
}

/** Simulazione urbana completa: il termometro porta con sé il confronto dei tre livelli, poi luogo, media e sensori. */
export function UrbanFlow() {
  const urban = useLab().urban;
  const { trees, permeable, shade, location } = urban;
  const place = splitLocation(location.label);
  const activeLevel = urbanPrototypeLevel(trees, permeable, shade);
  const fetchClimate = useServerFn(getRealClimate);
  const importRealWeather = async () => {
    const r = await fetchClimate({ data: { lat: location.lat, lng: location.lng } }).catch(() => null);
    const t = r?.openMeteo?.temp;
    if (t == null) { toast.error("Meteo reale non disponibile, riprova tra poco"); return; }
    setUrban({ realTemp: Math.round(t * 10) / 10 });
    toast.success(`Importati ${t.toLocaleString("it-IT")}°C dal meteo reale`);
  };

  return (
    <div className="space-y-4">
      <LabSyncIndicator />
      {/* No Confronta here: the three levels are compared inside the thermometer itself. */}
      <SimShell kind="urban" place={place.name} onReset={resetUrban}
        simula={<UrbanThermometer onImportWeather={importRealWeather} matrix={<PrototypeMatrix kind="urban" activeLevel={activeLevel} />} />}
        media={<LabMedia embedded kind="urban" context={`Scenario: ${comparison.find((l) => l.id === activeLevel)?.s ?? "attuale"}`} />}
        sensori={<SensorAdvisor embedded kind="urban" />} />
    </div>
  );
}

/** Simulazione del vigneto completa: riepilogo con Confronta e invio, dati reali, media, griglia. */
export function VineyardFlow() {
  const [send, setSend] = useState(false);
  const vineyard = useLab().vineyard;
  const fetchClimate = useServerFn(getRealClimate);
  // Signed-in only: real weather values land on every zone; the interventions stay as they are.
  const importRealWeather = async () => {
    const { lat, lng } = vineyard.location;
    const r = await fetchClimate({ data: { lat, lng } }).catch(() => null);
    const om = r?.openMeteo;
    if (!om || om.temp == null) { toast.error("Meteo reale non disponibile, riprova tra poco"); return; }
    const soil = om.soilMoisture != null ? om.soilMoisture * 100 : null;
    const zones = vineyard.zones.map((z) => ({
      ...z,
      temperature: Math.max(0, Math.min(45, Math.round(om.temp!))),
      moisture: soil == null ? z.moisture : Math.max(0, Math.min(60, Math.round(soil))),
      wind: om.wind != null ? Math.max(0, Math.min(30, Math.round(om.wind))) : z.wind,
    }));
    setVineyard({ zones });
    toast.success(`Importati ${om.temp.toLocaleString("it-IT")}°C${soil != null ? ` e umidità suolo ${Math.round(soil)}%` : ""} dal meteo reale`);
  };
  const place = splitLocation(vineyard.location.label).name;

  return (
    <div className="space-y-4">
      <LabSyncIndicator />
      {/* v10: built like the piazza (the arc of the vines' thirst with the three levels on it), so no Confronta here either. */}
      <SimShell kind="vineyard" place={place} onReset={resetVineyard} onSend={() => setSend(true)}
        simula={<VineThirst onImportWeather={importRealWeather} matrix={<PrototypeMatrix kind="vineyard" activeLevel={closestVineLevel(vineyard)} />} />}
        media={<LabMedia embedded kind="vineyard" context={`Tutte le zone · ${vineyard.phase}`} />}
        sensori={<SensorAdvisor embedded kind="vineyard" />} />
      <Dialog open={send} onOpenChange={setSend}>
        <DialogContent><DialogHeader><DialogTitle>Inviare i dati all’agronomo?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Verranno condivisi i dati delle tre zone e gli interventi scelti. L’invio è dimostrativo.</p><DialogFooter><Button variant="secondary" onClick={() => setSend(false)}>Annulla</Button><Button className="bg-vine hover:bg-vine/90" onClick={() => { setSend(false); toast.success("Dati inviati all’agronomo"); }}>Invia</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

/** The level whose ready vineyard is closest to the interventions in place (for the costs-and-times table). */
function closestVineLevel(v: LabState["vineyard"]): PrototypeId {
  const m = vineMixOf(v);
  return VINE_LEVELS.reduce((b, p) => {
    const d = (x: typeof p) => Math.abs(x.irrigation - m.irrigation) * 5 + Math.abs(x.shade - m.shade) + Math.abs(x.windbreak - m.windbreak);
    return d(p) < d(VINE_LEVELS.find((q) => q.id === b)!) ? p.id : b;
  }, "zero" as PrototypeId);
}
