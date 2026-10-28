import { createFileRoute } from "@tanstack/react-router";
import { Welcome } from "@/views/v10/Welcome";

export const Route = createFileRoute("/benvenuto")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Benvenuto" },
      { name: "description", content: "Da dove partire e la cronologia degli interventi fatti nella piazza e nel vigneto." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Welcome,
});
