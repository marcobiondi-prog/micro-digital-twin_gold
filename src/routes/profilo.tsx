import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/views/v10/ProfilePage";

export const Route = createFileRoute("/profilo")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Profilo" }] }),
  component: ProfilePage,
});
