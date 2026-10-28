import { createFileRoute, redirect } from "@tanstack/react-router";

// The map now lives in the Mappa tab of the simulations; old links and saved apps land on the welcome page.
export const Route = createFileRoute("/mappa")({
  beforeLoad: () => { throw redirect({ to: "/benvenuto", replace: true }); },
});
