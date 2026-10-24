import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Building2, Grape, ScanLine } from "lucide-react";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useSignedIn } from "@/lib/use-signed-in";
import { useInstalledApp } from "@/lib/installed-app";
import aiLogo from "@/assets/ai-logo.png";
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

type Tile = { to: "/urbano" | "/vigneto"; Icon: typeof Building2; title: string; desc: string; meta: string; art: "urban" | "vine" };
const tiles: Tile[] = [
  { to: "/urbano", Icon: Building2, title: "Piazza", desc: "Alberi, prato e ombra: quanti gradi in meno.", meta: "Simulazione", art: "urban" },
  { to: "/vigneto", Icon: Grape, title: "Vigneto", desc: "Sole, acqua e vento: quanta sete ha la vite.", meta: "Simulazione", art: "vine" },
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
  return null;
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
  const ai = useAiReadyHome();
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-2 sm:space-y-6 sm:py-8">
      <h1 className="sr-only">Micro Digital Twin</h1>
      <button type="button" onClick={() => setCameraSheetOpen(true)} className="group relative block w-full overflow-hidden rounded-3xl bg-[#0d1016] p-5 text-left text-white shadow-xl outline-none ring-1 ring-white/10 transition-transform focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-[0.99] motion-reduce:active:scale-100 sm:p-8">
        <span className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-[radial-gradient(circle,rgb(103_232_249/0.35),transparent_65%)]" aria-hidden="true" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:24px_24px]" aria-hidden="true" />
        <span className="relative flex items-center gap-4">
          <span className={`grid size-16 shrink-0 place-items-center rounded-2xl shadow-[0_0_0_2px_rgb(103_232_249/0.85),0_0_24px_rgb(103_232_249/0.45)] ${ai ? "bg-white" : "bg-[#151a24]"}`}>
            {ai ? <img src={aiLogo} alt="" aria-hidden="true" className="size-10" /> : <ScanLine className="size-8 text-cyan-300" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block text-2xl font-semibold sm:text-3xl">Fotocamera AI</span>
            <span className="block text-sm text-white/65 sm:text-base">Inquadra una pianta o il terreno: specie, fresco e foto.</span>
          </span>
        </span>
      </button>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {tiles.map(({ to, Icon, title, desc, meta, art }) => (
          <Link key={to} to={to} className="group overflow-hidden rounded-3xl bg-[#0d1016] text-white shadow-lg outline-none ring-1 ring-white/10 transition-transform focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-[0.99] motion-reduce:active:scale-100">
            <div className="relative aspect-[4/3] sm:aspect-[2/1]">
              <TileArt art={art} />
              <span className={`absolute left-2.5 top-2.5 grid size-9 place-items-center rounded-xl text-white shadow ${art === "urban" ? "bg-urban" : "bg-vine"}`}><Icon className="size-5" aria-hidden="true" /></span>
            </div>
            <div className="space-y-1 p-3 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300/80">{meta}</p>
              <h2 className="text-lg font-semibold leading-tight sm:text-2xl">{title}</h2>
              <p className="text-xs text-white/60 sm:text-sm">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** AI ready on Home: signed in (or simulated in a preview) and, for real accounts, the installed app. */
function useAiReadyHome() {
  const { signedIn, demo } = useSignedIn();
  const installed = useInstalledApp();
  return signedIn && (installed || demo);
}
