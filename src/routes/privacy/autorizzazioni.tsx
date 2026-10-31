import { createFileRoute } from "@tanstack/react-router";
import { PermissionsPage } from "@/views/v10/Permissions";

export const Route = createFileRoute("/privacy/autorizzazioni")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Autorizzazioni" }] }),
  component: PermissionsPage,
});
