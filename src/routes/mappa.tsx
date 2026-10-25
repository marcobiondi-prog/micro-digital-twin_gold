import { createFileRoute } from "@tanstack/react-router";
import { PlacesMap } from "@/views/v10/PlacesMap";

export const Route = createFileRoute("/mappa")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Mappa" },
      { name: "description", content: "I luoghi delle due simulazioni, la piazza e il vigneto, sulla mappa." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PlacesMap,
});
