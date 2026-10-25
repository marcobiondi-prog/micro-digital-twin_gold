import { createFileRoute } from "@tanstack/react-router";
import { Choice } from "@/views/v10/intro";

export const Route = createFileRoute("/scegli")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Da dove vuoi iniziare" }, { property: "og:type", content: "website" }] }),
  component: Choice,
});
