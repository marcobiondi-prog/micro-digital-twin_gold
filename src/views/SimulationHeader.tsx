import { Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, Grape } from "lucide-react";
import { splitLocation } from "@/views/SimulationGrid";

/** Intestazione delle pagine di simulazione: ritorno alla Home, titolo e luogo. */
export function SimulationHeader({ kind, location }: { kind: "urban" | "vineyard"; location: string }) {
  const place = splitLocation(location);
  const Icon = kind === "urban" ? Building2 : Grape;
  // Home arrived by push: going back keeps the history flat, so Back from Home leaves the app.
  const back = (e: { preventDefault: () => void }) => {
    if ((window.history.state?.__TSR_index ?? 0) > 0) { e.preventDefault(); window.history.back(); }
  };
  return (
    <div className="space-y-3">
      <Link to="/" onClick={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />Home
      </Link>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-primary-foreground ${kind === "urban" ? "bg-urban" : "bg-vine"}`}><Icon className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{kind === "urban" ? "Simulazione urbana" : "Simulazione vigneto"}</h1>
          <p className="truncate text-sm text-muted-foreground">{place.name}{place.sub ? ` · ${place.sub}` : ""}</p>
        </div>
      </div>
    </div>
  );
}
