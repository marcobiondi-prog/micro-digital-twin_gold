import { createFileRoute } from "@tanstack/react-router";
import { PlansPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/piani")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Piani e business" }] }),
  component: PlansPage,
});
