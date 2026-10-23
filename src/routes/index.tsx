import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Grape } from "lucide-react";
import { applySharedScenario } from "@/views/ScenarioTools";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MICRO DIGITAL TWIN — Dal rischio climatico alla scelta informata" },
      { name: "description", content: "Due simulazioni, urbana e del vigneto, per confrontare interventi di adattamento climatico." },
      { property: "og:title", content: "MICRO DIGITAL TWIN — Dal rischio climatico alla scelta informata" },
      { property: "og:description", content: "Simula una piazza o un vigneto e misura l'effetto degli interventi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const starts = [
  { to: "/urbano", Icon: Building2, tone: "bg-urban", title: "Simulazione urbana", desc: "Alberi, suolo permeabile e ombra in una piazza: quanti gradi si risparmiano." },
  { to: "/vigneto", Icon: Grape, tone: "bg-vine", title: "Simulazione vigneto", desc: "Temperatura, umidità e vento sulle zone del vigneto: l'indice di stress della vite." },
] as const;

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("scenario");
    if (!raw) return;
    const flow = applySharedScenario(raw);
    if (!flow) { toast.error("Link dello scenario non valido"); return; }
    toast.success("Scenario condiviso caricato");
    // Wait for the landing page to settle before moving (see AGENTS back-navigation rule).
    const id = setTimeout(() => void navigate({ to: flow === "urban" ? "/urbano" : "/vigneto", replace: true }), 300);
    return () => clearTimeout(id);
  }, [navigate]);
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4 sm:py-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">Dal rischio climatico <span className="text-primary">alla scelta informata.</span></h1>
        <p className="max-w-xl text-base text-muted-foreground sm:text-lg">Scegli una simulazione e prova gli interventi di adattamento. I risultati sono indicativi.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {starts.map(({ to, Icon, tone, title, desc }) => (
          <Link key={to} to={to} className="group flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6">
            <span className={`grid size-12 place-items-center rounded-xl text-primary-foreground ${tone}`}><Icon className="size-6" aria-hidden="true" /></span>
            <span className="space-y-1">
              <span className="block text-xl font-semibold">{title}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">Inizia<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
