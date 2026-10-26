import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/views/v10/legal-pages";

export const Route = createFileRoute("/chi-siamo")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Chi siamo" }] }),
  component: AboutPage,
});
