import { createFileRoute } from "@tanstack/react-router";
import { SimulationGrid } from "@/views/SimulationGrid";
import { SimulationHeader } from "@/views/SimulationHeader";
import { resetUrban, setUrban, useLab } from "@/models/lab-store";

export const Route = createFileRoute("/urbano")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Simulazione urbana" },
      { name: "description", content: "Simula alberi, suolo permeabile e ombra in una piazza e misura il raffrescamento." },
    ],
  }),
  component: Urbano,
});

function Urbano() {
  const urban = useLab().urban;
  return (
    <div className="space-y-6">
      <SimulationHeader kind="urban" location={urban.location.label} />
      <SimulationGrid
        mode="urban"
        trees={urban.trees}
        permeable={urban.permeable}
        shade={urban.shade}
        onTreesChange={(trees) => setUrban({ trees })}
        onPermeableChange={(permeable) => setUrban({ permeable })}
        onShadeChange={(shade) => setUrban({ shade })}
        onReset={resetUrban}
      />
    </div>
  );
}
