import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Grape, ScanLine } from "lucide-react";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useSignedIn } from "@/lib/use-signed-in";
import { useInstalledApp } from "@/lib/installed-app";
import aiLogo from "@/assets/ai-logo.png";
import { applySharedScenario } from "@/views/ScenarioTools";
import { hapticTick } from "@/lib/haptics";
import { TwinMascot } from "@/views/TwinMascot";

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

type Item = { id: "camera" | "urban" | "vine"; Icon: typeof Building2; name: string; desc: string };
const items: Item[] = [
  { id: "urban", Icon: Building2, name: "Piazza", desc: "Metti alberi, prato e ombra: vedi quanti gradi in meno." },
  { id: "vine", Icon: Grape, name: "Vigneto", desc: "Regola sole, acqua e vento: vedi quanta sete ha la vite." },
  { id: "camera", Icon: ScanLine, name: "Fotocamera AI", desc: "Inquadra una pianta: riconosce la specie e il fresco che regala." },
];

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
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const pick = (i: number) => { if (i === sel) return; hapticTick(); setSel(i); };
  // Each block rises in turn when the page opens (none with reduced motion).
  const rise = (i: number) => ({ className: "animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-both duration-700 motion-reduce:animate-none", style: { animationDelay: `${120 + i * 90}ms` } });
  return (
    // The opening page stands alone: it covers the whole app (no logo header, no menus) like a first-run tutorial,
    // all in black and white: drawn heat lines turning slowly behind, one big question, three numbered choices.
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-12">
      <Isolines />
      <h1 className="sr-only">Micro Digital Twin</h1>
      {/* Twin, big, is the page's only colour: the app's own mascot greets before the question. */}
      <div {...rise(0)} className={`${rise(0).className} mx-auto mt-[4vh] w-full max-w-xl`}>
        <span className="block h-32 w-36 sm:h-40 sm:w-44"><TwinMascot className="block h-full w-full drop-shadow-[0_12px_40px_rgb(76_201_189/0.25)]" /></span>
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <h2 {...rise(1)} className={`${rise(1).className} mt-8 font-display text-[3.4rem] font-extralight leading-[0.95] tracking-tight text-foreground sm:text-7xl`}>Da dove<br />vuoi iniziare?</h2>
        <p {...rise(2)} className={`${rise(2).className} mt-5 max-w-xs text-[15px] leading-relaxed text-foreground/60`}>Scegli una strada. Le altre restano a un tocco, nel menu.</p>
        <div role="radiogroup" aria-label="Da dove vuoi iniziare" className="mt-10 space-y-1"
          onKeyDown={(e) => {
            const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const n = (sel + d + items.length) % items.length;
            pick(n); rows.current[n]?.focus();
          }}>
          {items.map((it, i) => {
            const on = i === sel;
            return (
              <button key={it.id} ref={(el) => { rows.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                onClick={() => (on ? open(it) : pick(i))} {...rise(3 + i)}
                className={`${rise(3 + i).className} group relative flex w-full items-start gap-5 py-3 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
                {/* The chosen one carries a white line on its left edge, the others fade back. */}
                <span className={`absolute left-0 top-3 w-[2px] rounded-full bg-foreground transition-all duration-300 motion-reduce:transition-none ${on ? "h-[calc(100%-1.5rem)] opacity-100" : "h-0 opacity-0"}`} aria-hidden="true" />
                <span className={`font-mono text-sm tabular-nums transition-colors duration-300 ${on ? "text-foreground" : "text-foreground/35"}`}>0{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={`flex items-center gap-3 font-display text-[1.75rem] font-light leading-tight transition-colors duration-300 ${on ? "text-foreground" : "text-foreground/40 group-hover:text-foreground/70"}`}>
                    {it.name}
                    {it.id === "camera" && ai ? <img src={aiLogo} alt="" aria-hidden="true" className={`size-6 rounded-md bg-white p-0.5 ${on ? "" : "opacity-50 grayscale"}`} /> : <it.Icon className="size-5 opacity-70" strokeWidth={1.5} aria-hidden="true" />}
                  </span>
                  <span className={`grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <span className="overflow-hidden text-[15px] leading-snug text-foreground/60"><span className="block pt-1">{it.desc}</span></span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div {...rise(6)} className={`${rise(6).className} mt-auto flex flex-col items-stretch gap-1 pt-10`}>
          <button type="button" onClick={() => open(item)}
            className="inline-flex h-14 items-center justify-between rounded-full bg-foreground pl-7 pr-2 text-base font-semibold text-background outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100">
            <span>Inizia con {item.name}</span>
            <span className="grid size-10 place-items-center rounded-full bg-background text-foreground"><ArrowRight className="size-5" aria-hidden="true" /></span>
          </button>
          <Link to="/mappa" className="inline-flex h-12 items-center justify-center rounded-full text-sm font-semibold text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Salta, vai alla mappa</Link>
        </div>
      </div>
    </div>
  );
}

/** The page's only drawing: heat lines like a weather map, white and faint, turning very slowly behind the text. */
function Isolines() {
  const rings = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      <svg viewBox="-200 -200 400 400" className="intro-isolines absolute -right-[93vw] -top-[38vh] h-[120vh] w-[120vh] max-w-none text-foreground sm:-right-[20vw] sm:-top-[20vh]">
        {rings.map((k) => {
          const r = 30 + k * 21, w = 6 + k * 2.2;
          // A wobbly ring: radius bent by two slow waves, so it reads as a drawn contour, not a target.
          const d = Array.from({ length: 73 }, (_, i) => {
            const t = (i / 72) * Math.PI * 2, rr = r + Math.sin(t * 3 + k * 0.7) * w * 0.6 + Math.cos(t * 2 - k) * w * 0.4;
            return `${i ? "L" : "M"}${(Math.cos(t) * rr).toFixed(1)} ${(Math.sin(t) * rr).toFixed(1)}`;
          }).join(" ") + "Z";
          return <path key={k} d={d} fill="none" stroke="currentColor" strokeOpacity={0.16 - k * 0.012} strokeWidth="0.8" />;
        })}
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_10%,transparent_30%,var(--background)_85%)]" />
    </div>
  );
}

/** AI ready on Home: signed in (or simulated in a preview) and, for real accounts, the installed app. */
function useAiReadyHome() {
  const { signedIn, demo } = useSignedIn();
  const installed = useInstalledApp();
  return signedIn && (installed || demo);
}
