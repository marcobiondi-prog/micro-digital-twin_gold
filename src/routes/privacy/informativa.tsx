import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/privacy/informativa")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Informativa sulla privacy" }] }),
  component: PrivacyPage,
});
