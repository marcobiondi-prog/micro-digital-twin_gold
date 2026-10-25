import { createFileRoute } from "@tanstack/react-router";
import { PlansPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/piani")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Free e Premium" }] }),
  component: PlansPage,
});
