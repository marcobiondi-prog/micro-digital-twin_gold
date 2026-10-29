import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/views/v10/HistoryPage";

export const Route = createFileRoute("/cronologia")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Cronologia" }] }),
  component: HistoryPage,
});
