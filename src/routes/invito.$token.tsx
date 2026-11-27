import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "@/views/v10/InvitePage";

export const Route = createFileRoute("/invito/$token")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Invito" }] }),
  component: InvitePage,
});
