import { createFileRoute } from "@tanstack/react-router";
import { ArchivePage } from "@/views/v10/HistoryPage";

export const Route = createFileRoute("/archivio")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Archivio" }] }),
  component: ArchivePage,
});
