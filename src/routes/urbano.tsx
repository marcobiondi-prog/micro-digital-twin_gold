import { createFileRoute } from "@tanstack/react-router";
import { UrbanFlow } from "@/views/LabFlows";

export const Route = createFileRoute("/urbano")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Simulazione urbana" },
      { name: "description", content: "Simula alberi, suolo permeabile e ombra in una piazza e confronta gli interventi." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Urbano,
});

function Urbano() {
  return (
    <div className="lab-page">
      <UrbanFlow />
    </div>
  );
}
