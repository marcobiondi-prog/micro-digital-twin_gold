import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Grape, LayoutDashboard } from "lucide-react";
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

type Tile = { to: "/urbano" | "/vigneto" | "/dashboard"; Icon: typeof Building2; title: string; desc: string; meta: string; art: "urban" | "vine" | "dash" };
const tiles: Tile[] = [
  { to: "/urbano", Icon: Building2, title: "Simulazione urbana", desc: "Alberi, prato e ombra in una piazza: quanti gradi si risparmiano.", meta: "Piazza · 1 minuto", art: "urban" },
  { to: "/vigneto", Icon: Grape, title: "Simulazione vigneto", desc: "Sole, acqua e vento sulle zone del vigneto: quanta sete ha la vite.", meta: "Vigneto · 1 minuto", art: "vine" },
  { to: "/dashboard", Icon: LayoutDashboard, title: "Dashboard", desc: "I risultati delle due simulazioni e il report da scaricare.", meta: "Risultati e report", art: "dash" },
];

const HEAT = ["var(--radar-cool)", "var(--radar-mild)", "var(--radar-warm)", "var(--radar-hot)", "var(--radar-extreme)"];

/** Riquadro "immagine" della mattonella: un disegno essenziale al posto della foto. */
function TileArt({ art }: { art: Tile["art"] }) {
  if (art === "urban") return (
    <svg viewBox="0 0 180 90" className="h-full w-full" aria-hidden="true">
      {Array.from({ length: 54 }, (_, i) => { const x = i % 9, y = Math.floor(i / 9); const h = Math.min(4, Math.max(0, Math.round(x * 0.55 + (y % 2) * 0.4 - (x < 3 && y > 1 ? 1.5 : 0)))); return <rect key={i} x={9 + x * 18.4} y={4 + y * 14} width="16" height="12" rx="3" fill={HEAT[h]} opacity="0.9" />; })}
      {[[1, 2], [2, 3], [1, 4], [3, 1]].map(([x = 0, y = 0]) => <circle key={`${x}${y}`} cx={9 + x * 18.4 + 8} cy={4 + y * 14 + 6} r="5" fill="var(--ok)" stroke="#fff" strokeWidth="1.5" />)}
    </svg>
  );
  if (art === "vine") return (
    <svg viewBox="0 0 180 90" className="h-full w-full" aria-hidden="true">
      <path d="M0 52 Q90 30 180 52 V90 H0 Z" fill="color-mix(in oklab, var(--leaf) 55%, #3b2f1f)" />
      {[0, 1, 2].map((row) => Array.from({ length: 9 }, (_, k) => { const x = 12 + k * 20, y = 56 + row * 11 - Math.sin((k / 8) * Math.PI) * 6; return <g key={`${row}-${k}`}><circle cx={x} cy={y} r="4.5" fill={row === 0 && k > 5 ? "var(--radar-hot)" : "var(--leaf)"} /><circle cx={x + 2} cy={y + 4} r="2" fill="var(--vine)" /></g>; }))}
      <circle cx="150" cy="20" r="10" fill="var(--warn)" />
    </svg>
  );
  return (
    <svg viewBox="0 0 180 90" className="h-full w-full" aria-hidden="true">
      {[30, 52, 40, 64, 48, 72].map((h, k) => <rect key={k} x={16 + k * 16} y={80 - h} width="10" height={h} rx="3" fill={k % 2 ? "var(--urban)" : "var(--vine)"} opacity="0.85" />)}
      <circle cx="146" cy="44" r="22" fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="7" />
      <circle cx="146" cy="44" r="22" fill="none" stroke="var(--ok)" strokeWidth="7" strokeDasharray="96 200" strokeLinecap="round" transform="rotate(-90 146 44)" />
    </svg>
  );
}

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
    <div className="mx-auto max-w-5xl space-y-6 py-2 sm:space-y-8 sm:py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold leading-tight sm:text-4xl">Dal rischio climatico <span className="text-primary">alla scelta informata.</span></h1>
        <p className="max-w-xl text-sm text-muted-foreground sm:text-base">Scegli da dove partire. I risultati sono indicativi.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ to, Icon, title, desc, meta, art }) => (
          <Link key={to} to={to} className="group overflow-hidden rounded-2xl border bg-card shadow-sm outline-none transition-[transform,box-shadow] duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100">
            <div className="relative aspect-[2/1] bg-[linear-gradient(160deg,#1b2029,#0f1218)]">
              <TileArt art={art} />
              <span className={`absolute left-3 top-3 grid size-10 place-items-center rounded-xl text-white shadow ${art === "urban" ? "bg-urban" : art === "vine" ? "bg-vine" : "bg-primary"}`}><Icon className="size-5" aria-hidden="true" /></span>
            </div>
            <div className="space-y-1 p-4 sm:p-5">
              <h2 className="text-lg font-semibold leading-snug sm:text-xl">{title}</h2>
              <p className="text-sm text-muted-foreground">{desc}</p>
              <p className="flex items-center justify-between pt-1 text-xs font-medium text-muted-foreground"><span>{meta}</span><ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
