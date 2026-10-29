import { createFileRoute } from "@tanstack/react-router";
import { HistoryDetail } from "@/views/v10/HistoryDetail";

export const Route = createFileRoute("/cronologia_/$id")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Intervento" }] }),
  component: function InterventionPage() {
    const { id } = Route.useParams();
    return <HistoryDetail id={id} />;
  },
});
