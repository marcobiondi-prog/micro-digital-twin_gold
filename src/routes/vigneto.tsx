import { createFileRoute } from "@tanstack/react-router";
import { VineyardFlow } from "@/views/LabFlows";
import { SimulationHeader } from "@/views/SimulationHeader";

export const Route = createFileRoute("/vigneto")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Simulazione vigneto" },
      { name: "description", content: "Monitora le zone del vigneto, l'indice di stress e confronta gli interventi." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Vigneto,
});

function Vigneto() {
  return (
    <div className="lab-page">
      <SimulationHeader kind="vineyard" />
      <VineyardFlow />
    </div>
  );
}
