import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Domande frequenti" }] }),
  component: FaqPage,
});
