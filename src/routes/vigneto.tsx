import { createFileRoute } from "@tanstack/react-router";
import { SimulationGrid } from "@/views/SimulationGrid";
import { SimulationHeader } from "@/views/SimulationHeader";
import { resetVineyard, useLab } from "@/models/lab-store";

export const Route = createFileRoute("/vigneto")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Simulazione vigneto" },
      { name: "description", content: "Simula temperatura, umidità del suolo e vento sulle zone del vigneto e leggi l'indice di stress." },
    ],
  }),
  component: Vigneto,
});

function Vigneto() {
  const vineyard = useLab().vineyard;
  return (
    <div className="space-y-6">
      <SimulationHeader kind="vineyard" location={vineyard.location.label} />
      <SimulationGrid mode="vineyard" onReset={resetVineyard} />
    </div>
  );
}
