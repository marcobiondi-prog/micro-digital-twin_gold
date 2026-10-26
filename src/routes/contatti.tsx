import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/contatti")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Contatti" }] }),
  component: ContactsPage,
});
