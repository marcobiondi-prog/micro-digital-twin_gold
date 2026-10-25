import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/legale/termini")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Termini di servizio" }] }),
  component: TermsPage,
});
