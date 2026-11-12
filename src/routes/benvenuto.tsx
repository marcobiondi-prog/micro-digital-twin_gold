import { createFileRoute } from "@tanstack/react-router";
import { Welcome } from "@/views/v10/Welcome";
import { useProId, useGuest } from "@/lib/use-pro-id";

export const Route = createFileRoute("/benvenuto")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Benvenuto" },
      { name: "description", content: "Da dove partire e la cronologia degli interventi fatti nella piazza e nel vigneto." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: BenvenutoRoute,
});

function BenvenutoRoute() {
  const id = useProId();
  const guest = useGuest();
  // Se non c'è un profilo identificato e non si è in modalità ospite, copri Benvenuto con una schermata nera
  // così sotto il SectorGate ("Da dove vuoi usarmi?") non traspare né si intravede mai Benvenuto.
  if (id === null && !guest) {
    return <div className="fixed inset-0 z-[1000000000] bg-black [color-scheme:dark]" aria-hidden="true" />;
  }
  return <Welcome />;
}
