import { createFileRoute } from "@tanstack/react-router";
import { IdentifyPage } from "@/views/v10/Identify";

export const Route = createFileRoute("/identificazione/agronomo")({
  head: () => ({ meta: [{ title: "MICRO DIGITAL TWIN — Identificazione agronomo" }] }),
  component: () => <IdentifyPage kind="agronomo" />,
});
