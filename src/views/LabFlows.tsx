import { useState } from "react";
import { toast } from "sonner";
import { LabSyncIndicator } from "@/views/LabSyncIndicator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SensorAdvisor } from "@/views/SensorAdvisor";
import { LabMedia } from "@/views/LabMedia";
import { splitLocation } from "@/views/SimulationGrid";
import { UrbanThermometer } from "@/views/v9c/UrbanThermometer";
import { VineThirst } from "@/views/v10/VineThirst";
import { SimShell } from "@/views/v8/SimShell";
import { resetUrban, resetVineyard, setUrban, setVineyard, useLab } from "@/models/lab-store";
import { useServerFn } from "@tanstack/react-start";
import { getRealClimate } from "@/controllers/climate.functions";

/** Simulazione urbana completa: il termometro porta con sé il confronto dei tre livelli, poi luogo, media e sensori. */
export function UrbanFlow() {
  const urban = useLab().urban;
  const { trees, permeable, shade, location } = urban;
  const place = splitLocation(location.label);
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
        simula={<UrbanThermometer onImportWeather={importRealWeather} />}
        media={<LabMedia embedded kind="urban" context={`Alberi ${trees} · prato ${permeable}% · ombra ${shade}%`} />}
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
        simula={<VineThirst onImportWeather={importRealWeather} />}
        media={<LabMedia embedded kind="vineyard" context={`${vineyard.allZones ? "Tutte le zone" : `Zona ${vineyard.selected + 1}`} · ${vineyard.phase}`} />}
        sensori={<SensorAdvisor embedded kind="vineyard" />} />
      <Dialog open={send} onOpenChange={setSend}>
        <DialogContent><DialogHeader><DialogTitle>Inviare i dati all’agronomo?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Verranno condivisi i dati delle tre zone e gli interventi scelti. L’invio è dimostrativo.</p><DialogFooter><Button variant="secondary" onClick={() => setSend(false)}>Annulla</Button><Button className="bg-vine hover:bg-vine/90" onClick={() => { setSend(false); toast.success("Dati inviati all’agronomo"); }}>Invia</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
