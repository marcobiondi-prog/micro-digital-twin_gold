import { createFileRoute } from "@tanstack/react-router";
import { IdentifyPage } from "@/views/v10/Identify";

export const Route = createFileRoute("/identificazione/funzionario")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Identificazione funzionario comunale" }] }),
  component: () => <IdentifyPage kind="funzionario" />,
});
