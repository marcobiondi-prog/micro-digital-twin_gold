import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, ChevronDown, Grape, ScanLine } from "lucide-react";
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
  const choice = useRef<HTMLElement>(null);
  // The tutorial always starts from its top (the "i" brings the page back after scrolling elsewhere).
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const toChoice = () => choice.current?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  return (
    // The opening page stands alone: it covers the whole app (no logo header, no menus), all in black and white with
    // drawn heat lines turning slowly behind. It opens on a short drawn tutorial (Twin, then four steps, one per screen
    // as you scroll), then the choice. The "i" in the header brings it back from the top.
    <div className="relative isolate px-6 sm:px-12">
      <Isolines />
      <h1 className="sr-only">Micro Digital Twin</h1>

      {/* Hello: Twin in the middle, one line, a hint to scroll and a way to skip straight to the choice. */}
      <section aria-label="Benvenuto" className="mx-auto flex min-h-dvh max-w-xl flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <div className="flex justify-end">
          <button type="button" onClick={toChoice} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Salta</button>
        </div>
        <Reveal className="my-auto flex flex-col items-center text-center">
          <span className="block h-36 w-40 sm:h-44 sm:w-48"><TwinMascot className="block h-full w-full drop-shadow-[0_12px_40px_rgb(76_201_189/0.25)]" /></span>
          <h2 className="mt-8 font-display text-[2.6rem] font-extralight leading-[1.02] tracking-tight text-foreground sm:text-6xl">Prova gli interventi<br />prima di farli.</h2>
          <p className="mt-4 text-[15px] text-foreground/60">Ecco come funziona, in quattro passi.</p>
        </Reveal>
        <button type="button" onClick={() => document.getElementById("intro-step-1")?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" })}
          className="mx-auto flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          Scorri<ChevronDown className="size-5 animate-bounce motion-reduce:animate-none" aria-hidden="true" />
        </button>
      </section>

      {/* The four steps: one screen each, a line drawing that draws itself as it comes into view. */}
      {STEPS.map((st, i) => (
        <section key={st.title} id={`intro-step-${i + 1}`} aria-label={`Passo ${i + 1} di ${STEPS.length}: ${st.title}`} className="mx-auto flex min-h-[85dvh] max-w-xl flex-col justify-center py-12">
          <Reveal>
            <svg viewBox="0 0 160 100" className="intro-draw h-36 w-auto text-foreground sm:h-44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{st.art}</svg>
            <p className="mt-8 font-mono text-sm tabular-nums text-foreground/50">0{i + 1} — 0{STEPS.length}</p>
            <h2 className="mt-2 font-display text-[2.4rem] font-extralight leading-tight tracking-tight text-foreground sm:text-5xl">{st.title}</h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-foreground/60">{st.text}</p>
          </Reveal>
        </section>
      ))}

      {/* The choice, at the end of the tutorial. */}
      <section ref={choice} id="scelta" aria-label="Scelta" className="mx-auto flex min-h-dvh max-w-xl scroll-mt-0 flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]">
        <Reveal>
          <h2 className="font-display text-[3.4rem] font-extralight leading-[0.95] tracking-tight text-foreground sm:text-7xl">Da dove<br />vuoi iniziare?</h2>
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-foreground/60">Scegli una strada. Le altre restano a un tocco, nel menu.</p>
        </Reveal>
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
                onClick={() => (on ? open(it) : pick(i))}
                className="group relative flex w-full items-start gap-5 py-3 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
        <div className="mt-auto flex flex-col items-stretch gap-1 pt-10">
          <button type="button" onClick={() => open(item)}
            className="inline-flex h-14 items-center justify-between rounded-full bg-foreground pl-7 pr-2 text-base font-semibold text-background outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100">
            <span>Inizia con {item.name}</span>
            <span className="grid size-10 place-items-center rounded-full bg-background text-foreground"><ArrowRight className="size-5" aria-hidden="true" /></span>
          </button>
          <Link to="/mappa" className="inline-flex h-12 items-center justify-center rounded-full text-sm font-semibold text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Salta, vai alla mappa</Link>
        </div>
      </section>
    </div>
  );
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fades and lifts its content in once it scrolls into view (at once with reduced motion); drawings inside draw themselves. */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion() || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} data-shown={shown || undefined} className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"} ${className}`}>{children}</div>;
}

/** The four steps of the tutorial, each with a white line drawing (every stroke has pathLength 1, so it can draw itself). */
const STEPS: Array<{ title: string; text: string; art: ReactNode }> = [
  { title: "Trova il luogo", text: "Nella Mappa cerchi la piazza o il vigneto e lo guardi in 2D o in 3D.",
    art: <>
      <path pathLength={1} d="M20 30 L55 20 L105 30 L140 20 V75 L105 85 L55 75 L20 85 Z" />
      <path pathLength={1} d="M55 20 V75 M105 30 V85" strokeOpacity="0.5" />
      <path pathLength={1} d="M80 64 C74 56 66 48 66 40 A14 14 0 0 1 94 40 C94 48 86 56 80 64 Z" />
      <circle pathLength={1} cx="80" cy="40" r="5" />
    </> },
  { title: "Muovi il punto", text: "Sull'arco scegli quanto rinfrescare: vedi subito i gradi in meno e quanto costa.",
    art: <>
      <path pathLength={1} d="M30 84 A50 50 0 0 1 130 84" strokeWidth="6" strokeOpacity="0.25" />
      <path pathLength={1} d="M30 84 A50 50 0 0 1 98 37" strokeWidth="6" />
      <circle cx="98" cy="37" r="7" fill="currentColor" stroke="none" className="intro-pop" />
      <path pathLength={1} d="M66 70 H94" strokeOpacity="0.6" />
    </> },
  { title: "Inquadra una pianta", text: "La fotocamera AI riconosce la specie e ti dice quanto fresco regala.",
    art: <>
      <path pathLength={1} d="M40 22 V12 H52 M120 22 V12 H108 M40 78 V88 H52 M120 78 V88 H108" />
      <path pathLength={1} d="M80 24 C100 32 104 56 92 68 C84 76 70 74 66 64 C60 50 66 32 80 24 Z" />
      <path pathLength={1} d="M80 28 C78 44 76 58 70 72" strokeOpacity="0.6" />
      <path pathLength={1} d="M30 50 H130" strokeOpacity="0.35" className="intro-scan" />
    </> },
  { title: "Raccogli i risultati", text: "Nella Dashboard trovi tutto e lo esporti in un report da condividere.",
    art: <>
      {[45, 80, 115].map((x) => <circle key={x} pathLength={1} cx={x} cy="40" r="15" strokeOpacity="0.25" />)}
      <path pathLength={1} d="M45 25 A15 15 0 1 1 31 45" />
      <path pathLength={1} d="M80 25 A15 15 0 0 1 95 40" />
      <path pathLength={1} d="M115 25 A15 15 0 1 1 101 34" />
      <path pathLength={1} d="M30 72 H130 M30 84 H100" strokeOpacity="0.6" />
    </> },
];

/** The page's only drawing: heat lines like a weather map, white and faint, turning very slowly behind the text. */
function Isolines() {
  const rings = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
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
