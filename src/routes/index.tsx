import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Building2, Grape, ScanLine } from "lucide-react";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useSignedIn } from "@/lib/use-signed-in";
import { useInstalledApp } from "@/lib/installed-app";
import aiLogo from "@/assets/ai-logo.png";
import { applySharedScenario } from "@/views/ScenarioTools";
import { PsCardBody, psCardClass } from "@/views/v7/PsCard";

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
  { to: "/urbano", Icon: Building2, title: "Simulazione piazza", desc: "Metti alberi, prato e ombra: vedi subito quanti gradi in meno.", meta: "Rinfresca la piazza", art: "urban" },
  { to: "/vigneto", Icon: Grape, title: "Simulazione vigneto", desc: "Regola sole, acqua e vento: vedi subito quanta sete ha la vite.", meta: "Disseta il vigneto", art: "vine" },
];

const HEAT = ["var(--radar-cool)", "var(--radar-mild)", "var(--radar-warm)", "var(--radar-hot)", "var(--radar-extreme)"];

/** Riquadro "immagine" della mattonella: un disegno essenziale al posto della foto. */
function TileArt({ art }: { art: Tile["art"] }) {
  if (art === "urban") return (
    <svg viewBox="0 0 180 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      {Array.from({ length: 54 }, (_, i) => { const x = i % 9, y = Math.floor(i / 9); const h = Math.min(4, Math.max(0, Math.round(x * 0.55 + (y % 2) * 0.4 - (x < 3 && y > 1 ? 1.5 : 0)))); return <rect key={i} x={9 + x * 18.4} y={4 + y * 14} width="16" height="12" rx="3" fill={HEAT[h]} opacity="0.9" />; })}
      {[[1, 2], [2, 3], [1, 4], [3, 1]].map(([x = 0, y = 0]) => <circle key={`${x}${y}`} cx={9 + x * 18.4 + 8} cy={4 + y * 14 + 6} r="5" fill="var(--ok)" stroke="#fff" strokeWidth="1.5" />)}
    </svg>
  );
  if (art === "vine") return (
    <svg viewBox="0 0 180 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
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
    <div className="mx-auto max-w-5xl py-1 sm:py-6">
      <h1 className="sr-only">Micro Digital Twin</h1>
      {/* PlayStation-app feed: the AI camera first, then the two simulators, each a card with a picture. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" onClick={() => setCameraSheetOpen(true)} className={psCardClass}>
          <PsCardBody iconImg={ai ? aiLogo : undefined} icon={ScanLine} tone={ai ? "bg-white" : "bg-[linear-gradient(135deg,#1b6fd8,#0b3f8c)]"} source="Fotocamera AI"
            art={<CameraArt />} title="Inquadra una pianta o il terreno" desc="Riconosce la specie, stima il fresco che regala e salva la foto." meta="Specie · fresco · foto" />
        </button>
        {tiles.map(({ to, Icon, title, desc, meta, art }) => (
          <Link key={to} to={to} className={psCardClass}>
            <PsCardBody icon={Icon} tone={art === "urban" ? "bg-urban" : "bg-vine"} source={title} art={<TileArt art={art} />} title={meta} desc={desc} meta={art === "urban" ? "Piazza · calore percepito" : "Vigneto · sete della vite"} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Picture of the camera card: a dark viewfinder with its corner marks around a leaf. */
function CameraArt() {
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs><radialGradient id="cam-art-bg" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stopColor="#24415a" /><stop offset="1" stopColor="#0b0f15" /></radialGradient></defs>
      <rect width="160" height="90" fill="url(#cam-art-bg)" />
      <path d="M80 22 C100 28 106 48 96 62 C88 72 72 72 66 62 C58 48 62 30 80 22 Z" fill="var(--leaf)" opacity="0.9" />
      <path d="M80 26 C78 40 76 54 72 68" stroke="#0b2a17" strokeWidth="1.5" fill="none" opacity="0.6" />
      {[[52, 14, 1, 1], [108, 14, -1, 1], [52, 76, 1, -1], [108, 76, -1, -1]].map(([x = 0, y = 0, dx = 1, dy = 1]) => <path key={`${x}${y}`} d={`M${x} ${y + dy * 10} V${y} H${x + dx * 10}`} stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />)}
      <rect x="20" y="40" width="120" height="1.5" fill="rgb(103 232 249 / 0.7)" />
    </svg>
  );
}

/** AI ready on Home: signed in (or simulated in a preview) and, for real accounts, the installed app. */
function useAiReadyHome() {
  const { signedIn, demo } = useSignedIn();
  const installed = useInstalledApp();
  return signedIn && (installed || demo);
}
