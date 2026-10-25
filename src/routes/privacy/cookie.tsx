import { createFileRoute } from "@tanstack/react-router";
import { CookiePage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/privacy/cookie")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Informativa sui cookie" }] }),
  component: CookiePage,
});
