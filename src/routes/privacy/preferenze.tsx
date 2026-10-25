import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPrefsPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/privacy/preferenze")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Preferenze privacy" }] }),
  component: PrivacyPrefsPage,
});
