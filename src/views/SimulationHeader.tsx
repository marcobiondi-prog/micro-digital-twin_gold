import { Building2, Grape } from "lucide-react";

/** Intestazione delle pagine di simulazione: titolo (il luogo è nel riepilogo sotto). */
export function SimulationHeader({ kind }: { kind: "urban" | "vineyard" }) {
  const Icon = kind === "urban" ? Building2 : Grape;
  return (
    <div className="mb-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-primary-foreground ${kind === "urban" ? "bg-urban" : "bg-vine"}`}><Icon className="size-5" aria-hidden="true" /></span>
        <h1 className="min-w-0 text-2xl font-semibold leading-tight sm:text-3xl">{kind === "urban" ? "Simulazione urbana" : "Simulazione vigneto"}</h1>
      </div>
    </div>
  );
}
