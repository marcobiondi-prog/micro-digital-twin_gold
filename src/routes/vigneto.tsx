import { createFileRoute } from "@tanstack/react-router";
import { VineyardFlow } from "@/views/LabFlows";
import { SectionGate } from "@/views/v10/ProfileGate";

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
      {/* Open only to its profile (the agronomist): otherwise the lock and the way to identify. */}
      <SectionGate section="vineyard"><VineyardFlow /></SectionGate>
    </div>
  );
}
