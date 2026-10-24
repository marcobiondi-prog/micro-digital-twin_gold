import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Grape, ScanLine } from "lucide-react";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useSignedIn } from "@/lib/use-signed-in";
import { useInstalledApp } from "@/lib/installed-app";
import aiLogo from "@/assets/ai-logo.png";
import { applySharedScenario } from "@/views/ScenarioTools";
import { Ambient } from "@/views/v8/console";

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

type Item = { id: "camera" | "urban" | "vine"; Icon: typeof Building2; name: string; title: string; desc: string; action: string; tone: string; tile: string };
const items: Item[] = [
  { id: "camera", Icon: ScanLine, name: "Fotocamera AI", title: "Inquadra una pianta o il terreno", desc: "Riconosce la specie, stima il fresco che regala e salva la foto.", action: "Apri la fotocamera", tone: "rgb(20 150 190 / 0.45)", tile: "bg-[linear-gradient(135deg,#1b6fd8,#0b3f8c)]" },
  { id: "urban", Icon: Building2, name: "Piazza", title: "Rinfresca la piazza", desc: "Metti alberi, prato e ombra: vedi subito quanti gradi in meno.", action: "Apri la simulazione", tone: "rgb(28 112 210 / 0.45)", tile: "bg-urban" },
  { id: "vine", Icon: Grape, name: "Vigneto", title: "Disseta il vigneto", desc: "Regola sole, acqua e vento: vedi subito quanta sete ha la vite.", action: "Apri la simulazione", tone: "rgb(150 36 110 / 0.45)", tile: "bg-vine" },
];

const HEAT = ["var(--radar-cool)", "var(--radar-mild)", "var(--radar-warm)", "var(--radar-hot)", "var(--radar-extreme)"];

/** Big picture of the selected item, drawn rather than photographed. */
function Art({ id }: { id: Item["id"] }) {
  if (id === "camera") return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs><radialGradient id="home-cam-bg" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stopColor="#24415a" /><stop offset="1" stopColor="#0b0f15" /></radialGradient></defs>
      <rect width="160" height="90" fill="url(#home-cam-bg)" />
      <path d="M80 22 C100 28 106 48 96 62 C88 72 72 72 66 62 C58 48 62 30 80 22 Z" fill="var(--leaf)" opacity="0.9" />
      <path d="M80 26 C78 40 76 54 72 68" stroke="#0b2a17" strokeWidth="1.5" fill="none" opacity="0.6" />
      {[[52, 14, 1, 1], [108, 14, -1, 1], [52, 76, 1, -1], [108, 76, -1, -1]].map(([x = 0, y = 0, dx = 1, dy = 1]) => <path key={`${x}${y}`} d={`M${x} ${y + dy * 10} V${y} H${x + dx * 10}`} stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />)}
      <rect className="home-scan-line" x="20" y="40" width="120" height="1.5" fill="rgb(103 232 249 / 0.8)" />
    </svg>
  );
  if (id === "urban") return (
    <svg viewBox="0 0 180 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <rect width="180" height="90" fill="#0b0f15" />
      {Array.from({ length: 54 }, (_, i) => { const x = i % 9, y = Math.floor(i / 9); const h = Math.min(4, Math.max(0, Math.round(x * 0.55 + (y % 2) * 0.4 - (x < 3 && y > 1 ? 1.5 : 0)))); return <rect key={i} x={9 + x * 18.4} y={4 + y * 14} width="16" height="12" rx="3" fill={HEAT[h]} opacity="0.9" />; })}
      {[[1, 2], [2, 3], [1, 4], [3, 1]].map(([x = 0, y = 0]) => <circle key={`${x}${y}`} cx={9 + x * 18.4 + 8} cy={4 + y * 14 + 6} r="5" fill="var(--ok)" stroke="#fff" strokeWidth="1.5" />)}
    </svg>
  );
  return (
    <svg viewBox="0 0 180 90" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs><linearGradient id="home-vine-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a1630" /><stop offset="1" stopColor="#0b0f15" /></linearGradient></defs>
      <rect width="180" height="90" fill="url(#home-vine-sky)" />
      <path d="M0 52 Q90 30 180 52 V90 H0 Z" fill="color-mix(in oklab, var(--leaf) 55%, #3b2f1f)" />
      {[0, 1, 2].map((row) => Array.from({ length: 9 }, (_, k) => { const x = 12 + k * 20, y = 56 + row * 11 - Math.sin((k / 8) * Math.PI) * 6; return <g key={`${row}-${k}`}><circle cx={x} cy={y} r="4.5" fill={row === 0 && k > 5 ? "var(--radar-hot)" : "var(--leaf)"} /><circle cx={x + 2} cy={y + 4} r="2" fill="var(--vine)" /></g>; }))}
      <circle cx="150" cy="20" r="10" fill="var(--warn)" />
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
  const ai = useAiReadyHome();
  const [sel, setSel] = useState(0);
  const item = items[sel] ?? items[0]!;
  const open = (it: Item) => {
    if (it.id === "camera") setCameraSheetOpen(true);
    else void navigate({ to: it.id === "urban" ? "/urbano" : "/vigneto" });
  };
  // Swipe the picture to move between the three, like the PS5 home row.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const tiles = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (d: number) => setSel((i) => (i + d + items.length) % items.length);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="sr-only">Micro Digital Twin</h1>
      <Ambient tone={item.tone} />
      {/* PS5 home: a big picture of the selected item, a row of square tiles, then its name, one line and one white button. */}
      {/* Phones: the picture runs up behind the transparent header and fades in from the page's ambient light at the top and back into the page at the bottom, so the header takes the same shades. */}
      <div className="home-art relative -z-[5] -mx-4 -mt-[calc(5rem+env(safe-area-inset-top))] aspect-[4/3.6] max-h-[56vh] w-[calc(100%+2rem)] overflow-hidden sm:z-auto sm:mx-0 sm:mt-0 sm:aspect-[21/9] sm:max-h-[46vh] sm:w-full sm:rounded-3xl"
        onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => { const s = swipe.current; swipe.current = null; if (!s) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - s.y)) move(dx < 0 ? 1 : -1); }}>
        <div key={item.id} className="absolute inset-0 animate-in fade-in-0 zoom-in-[1.03] duration-500 motion-reduce:animate-none"><Art id={item.id} /></div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,var(--background))] sm:block max-sm:hidden" aria-hidden="true" />
      </div>
      <div role="tablist" aria-label="Cosa vuoi fare" className="relative -mt-14 flex items-end gap-3 sm:-mt-16"
        onKeyDown={(e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); const n = (sel + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length; setSel(n); tiles.current[n]?.focus(); }}>
        {items.map((it, i) => {
          const on = i === sel;
          return (
            <button key={it.id} ref={(el) => { tiles.current[i] = el; }} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} aria-label={it.name}
              onClick={() => (on ? open(it) : setSel(i))}
              className={`ps5-tile relative grid shrink-0 place-items-center overflow-hidden rounded-2xl text-white outline-none ${it.tile} ${on ? "ps5-tile-on size-24 sm:size-28" : "size-[4.5rem] opacity-80 sm:size-20"}`}>
              {it.id === "camera" && ai ? <span className="grid size-full place-items-center bg-white"><img src={aiLogo} alt="" aria-hidden="true" className="size-14" /></span> : <it.Icon className={on ? "size-11" : "size-8"} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div key={item.id} className="mt-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 motion-reduce:animate-none" role="tabpanel">
        <p className="text-sm font-medium text-muted-foreground">{item.name}</p>
        <h2 className="mt-1 font-display text-3xl font-light leading-tight tracking-tight text-foreground sm:text-4xl">{item.title}</h2>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">{item.desc}</p>
        <button type="button" onClick={() => open(item)}
          className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground px-8 text-base font-semibold text-background shadow-[0_8px_30px_rgb(255_255_255/0.12)] outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100 sm:w-auto">
          {item.action}<ArrowRight className="size-5" aria-hidden="true" />
        </button>
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
