import { createFileRoute } from "@tanstack/react-router";
import { LicensesPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/legale/licenze")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Licenze" }] }),
  component: LicensesPage,
});
