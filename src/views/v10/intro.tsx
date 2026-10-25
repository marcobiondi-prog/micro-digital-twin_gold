import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Building2, Grape, ScanLine, X } from "lucide-react";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useSignedIn } from "@/lib/use-signed-in";
import { useInstalledApp } from "@/lib/installed-app";
import aiLogo from "@/assets/ai-logo.png";
import { hapticTick } from "@/lib/haptics";
import { TwinMascot } from "@/views/TwinMascot";
import { THEME_DARK, THEME_META } from "@/views/theme-toggle";
import { introSeen, markIntroSeen } from "@/lib/intro-seen";

/**
 * v10 entrance, two pages that stand alone (no header, no menus), black and white over slowly turning heat lines:
 * the Tutorial (/) — Twin, then four drawn steps, swiped sideways — and the Choice (/scegli). A fresh open shows the
 * tutorial and ends on the choice; the "i" in the header shows the tutorial only and goes back where it was.
 */

type Item = { id: "camera" | "urban" | "vine"; Icon: typeof Building2; name: string; desc: string };
const items: Item[] = [
  { id: "urban", Icon: Building2, name: "Piazza", desc: "Metti alberi, prato e ombra: vedi quanti gradi in meno." },
  { id: "vine", Icon: Grape, name: "Vigneto", desc: "Regola sole, acqua e vento: vedi quanta sete ha la vite." },
  { id: "camera", Icon: ScanLine, name: "Fotocamera AI", desc: "Inquadra una pianta: riconosce la specie e il fresco che regala." },
];

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

/** Where the data points of the sky sit (x %, y %, size px, delay s): fixed, so the server and the phone draw the same sky. */
const DOTS: Array<[number, number, number, number]> = [[8, 12, 2, 0], [22, 26, 1.5, 1.2], [37, 8, 2, 2.4], [63, 15, 1.5, 0.6], [78, 6, 2, 1.8], [90, 22, 1.5, 3], [14, 40, 1.5, 2.1], [86, 38, 2, 0.9], [50, 30, 1.5, 3.4], [70, 44, 1.5, 1.5], [30, 48, 2, 2.7], [5, 58, 1.5, 0.3]];
/** Sparks rising from the floor (x %, size px, duration s, delay s). */
const SPARKS: Array<[number, number, number, number]> = [[12, 3, 14, 0], [27, 2, 18, 4], [41, 3, 16, 9], [55, 2, 20, 2], [68, 3, 15, 7], [82, 2, 19, 11], [93, 3, 17, 5], [5, 2, 21, 13], [48, 2, 13, 15], [74, 3, 22, 1]];

/**
 * The entrance's backdrop, a digital twin's horizon: an aurora in Twin's turquoise, a cool blue and a warm heat glow, slowly
 * turning and breathing; a sky of twinkling data points; a glowing planet rising behind a perspective grid floor that glides
 * toward you, crossed by a band of light; sparks rising from it. Still with reduced motion.
 */
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#05070c]" aria-hidden="true">
      {/* Aurora: three coloured lights, blended so they brighten where they meet. */}
      <div className="intro-aurora absolute -inset-[20%] opacity-90 [mix-blend-mode:screen]">
        <div className="intro-glow intro-glow-a absolute left-[5%] top-[2%] h-[60vh] w-[75vw] rounded-[45%_55%_60%_40%] bg-[radial-gradient(closest-side,rgb(76_201_189/0.55),transparent)] blur-3xl" />
        <div className="intro-glow intro-glow-b absolute right-[0%] top-[20%] h-[55vh] w-[70vw] rounded-[60%_40%_45%_55%] bg-[radial-gradient(closest-side,rgb(40_100_230/0.5),transparent)] blur-3xl" />
        <div className="intro-glow intro-glow-c absolute bottom-[18%] left-[25%] h-[40vh] w-[60vw] rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_130_60/0.3),transparent)] blur-3xl" />
      </div>
      {DOTS.map(([x, y, r, d]) => <span key={`${x}-${y}`} className="intro-dot absolute rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, width: r, height: r, animationDelay: `${d}s` }} />)}
      {/* The planet: a lit globe rising at the bottom, its atmosphere glowing on the rim, a digital grid turning on it. */}
      <div className="intro-halo absolute bottom-[10vh] left-1/2 h-[36vh] w-[150vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(76_201_189/0.4),rgb(40_100_230/0.18)_60%,transparent)] blur-2xl" />
      <Planet />
      {SPARKS.map(([x, r, t, d]) => <span key={x} className="intro-spark absolute bottom-[8vh] rounded-full bg-[rgb(140_240_225)] shadow-[0_0_8px_rgb(76_201_189)]" style={{ left: `${x}%`, width: r, height: r, animationDuration: `${t}s`, animationDelay: `${d}s` }} />)}
      {/* A soft vignette keeps the text readable. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgb(0_0_0/0.55))]" />
    </div>
  );
}

/**
 * A planet as a digital twin: a sphere lit from the upper left (turquoise to deep blue to night), a glowing atmosphere on its
 * rim, parallels and meridians that turn (the meridians narrow and widen like a spinning globe), and lit points on its face.
 * Only its upper part shows, rising from the bottom of the screen. The grid stands still with reduced motion.
 */
function Planet() {
  const [still, setStill] = useState(true);
  useEffect(() => { setStill(reduceMotion()); }, []);
  const parallels = [-60, -40, -20, 0, 20, 40, 60];
  const meridians = [0, 1, 2, 3, 4, 5];
  const cities: Array<[number, number]> = [[-38, -62], [-12, -70], [20, -58], [44, -40], [-56, -30], [8, -36], [-26, -44], [32, -74], [-4, -52]];
  return (
    <svg viewBox="-110 -110 220 220" className="absolute left-1/2 top-[64vh] aspect-square w-[175vw] max-w-none -translate-x-1/2 sm:top-[72vh] sm:w-[105vw]">
      <defs>
        <radialGradient id="planet-surface" cx="0.36" cy="0.18" r="0.85">
          <stop offset="0" stopColor="#8ff0e2" />
          <stop offset="0.16" stopColor="#2fb4a8" />
          <stop offset="0.42" stopColor="#1b4f9e" />
          <stop offset="0.72" stopColor="#0b1838" />
          <stop offset="1" stopColor="#04060c" />
        </radialGradient>
        <radialGradient id="planet-air" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.86" stopColor="rgb(76 201 189)" stopOpacity="0" />
          <stop offset="0.91" stopColor="rgb(120 235 220)" stopOpacity="0.85" />
          <stop offset="0.95" stopColor="rgb(60 140 240)" stopOpacity="0.35" />
          <stop offset="1" stopColor="rgb(40 100 230)" stopOpacity="0" />
        </radialGradient>
        <clipPath id="planet-clip"><circle r="100" /></clipPath>
      </defs>
      <circle r="110" fill="url(#planet-air)" />
      <circle r="100" fill="url(#planet-surface)" />
      <g clipPath="url(#planet-clip)" fill="none" stroke="rgb(160 245 235)" strokeWidth="0.35">
        {parallels.map((lat) => {
          const y = -Math.sin((lat * Math.PI) / 180) * 100, rx = Math.cos((lat * Math.PI) / 180) * 100;
          return <ellipse key={lat} cx="0" cy={y} rx={rx} ry={rx * 0.18} strokeOpacity={0.28} />;
        })}
        {meridians.map((k) => (
          <ellipse key={k} cx="0" cy="0" rx={100 * Math.abs(Math.cos((k * Math.PI) / 6))} ry="100" strokeOpacity={0.3}>
            {!still && <animate attributeName="rx" dur="24s" repeatCount="indefinite" begin={`${-k * 4}s`} values="100;50;0;50;100" keyTimes="0;0.25;0.5;0.75;1" />}
          </ellipse>
        ))}
        {cities.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="0.9" fill="rgb(200 255 248)" stroke="none" className="intro-dot" style={{ animationDelay: `${i * 0.45}s` }} />)}
      </g>
      {/* Night side: the lower right fades into the dark. */}
      <circle r="100" fill="url(#planet-shade)" />
      <defs>
        <radialGradient id="planet-shade" cx="0.75" cy="0.85" r="0.75">
          <stop offset="0" stopColor="#020308" stopOpacity="0.85" />
          <stop offset="1" stopColor="#020308" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/**
 * The entrance is always dark, whatever theme the app uses: its pages carry the .dark tokens themselves, and while one is
 * open the phone's status bar takes the dark canvas colour (the app's own colour comes back on leaving).
 */
function useDarkChrome() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(THEME_META);
    const before = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", THEME_DARK);
    return () => { if (meta && before !== null) meta.setAttribute("content", before); };
  }, []);
}

/** True when the "i" opened the tutorial: it then ends by going back instead of on the choice. */
const fromInfo = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("rivedi");

/** The tutorial: five screens side by side (hello + four steps), swiped or stepped with the button, dots and arrow keys. */
export function Tutorial() {
  useDarkChrome();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  // The finger drags the screens (dragX) and a swipe past 50 px turns the page; a mostly vertical move is ignored.
  const [dragX, setDragX] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [again, setAgain] = useState(false);
  // Already seen on this device (and not asked for with the "i"): the root moves on to the map, so draw nothing meanwhile.
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAgain(fromInfo());
    setSkip(introSeen() && !params.has("rivedi") && !params.has("scenario"));
    window.scrollTo(0, 0);
  }, []);
  const count = STEPS.length + 1;
  const last = page === count - 1;
  const go = (i: number) => {
    const n = Math.max(0, Math.min(count - 1, i));
    if (n !== page) { hapticTick(); setPage(n); }
  };
  const down = (x: number, y: number) => { start.current = { x, y }; };
  const move = (x: number, y: number) => {
    const s0 = start.current;
    if (!s0) return;
    const dx = x - s0.x, dy = y - s0.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) { start.current = null; setDragX(0); return; }
    // Past the first or the last screen the drag only gives a little.
    const edge = (dx > 0 && page === 0) || (dx < 0 && page === count - 1);
    setDragX(edge ? dx * 0.25 : dx);
  };
  const up = (x: number) => {
    const s0 = start.current;
    start.current = null;
    setDragX(0);
    if (s0 && Math.abs(x - s0.x) > 50) go(page + (x < s0.x ? 1 : -1));
  };
  const finish = () => {
    markIntroSeen();
    if (again && window.history.length > 1) window.history.back();
    else void navigate({ to: again ? "/mappa" : "/scegli" });
  };
  if (skip) return <div className="dark h-dvh bg-background" />;
  return (
    <div className="dark relative isolate flex h-dvh flex-col overflow-hidden bg-background text-foreground [color-scheme:dark]"
      onKeyDown={(e) => { if (e.key === "ArrowRight" && !last) { e.preventDefault(); go(page + 1); } if (e.key === "ArrowLeft" && page > 0) { e.preventDefault(); go(page - 1); } }}>
      <Backdrop />
      <h1 className="sr-only">Come funziona</h1>
      <div className="flex justify-end px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button type="button" onClick={finish} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {again ? <><X className="size-4" aria-hidden="true" />Chiudi</> : "Salta"}
        </button>
      </div>
      {/* Sideways track: the screens sit side by side and slide with the finger, then settle on the next one. */}
      <div className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
        onTouchStart={(e) => { const t = e.touches[0]; if (t && e.touches.length === 1) down(t.clientX, t.clientY); }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }}
        onTouchEnd={(e) => { const t = e.changedTouches[0]; if (t) up(t.clientX); }}
        onTouchCancel={() => { start.current = null; setDragX(0); }}
        onPointerDown={(e) => { if (e.pointerType === "mouse") down(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.pointerType === "mouse" && e.buttons) move(e.clientX, e.clientY); }}
        onPointerUp={(e) => { if (e.pointerType === "mouse") up(e.clientX); }}>
      <div className="flex h-full" style={{ transform: `translateX(calc(${-page * 100}% + ${dragX}px))`, transition: dragX || reduceMotion() ? "none" : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
        <section aria-label="Benvenuto" aria-roledescription="schermata" aria-hidden={page !== 0 || undefined} className="flex w-full shrink-0 select-none flex-col items-center justify-center px-8 text-center">
          <Reveal className="flex flex-col items-center">
            <span className="block h-36 w-40 sm:h-44 sm:w-48"><TwinMascot className="block h-full w-full drop-shadow-[0_12px_40px_rgb(76_201_189/0.25)]" /></span>
            <p className="mt-4 font-display text-xl font-semibold uppercase tracking-[0.18em] text-foreground sm:text-2xl">Micro Digital <span className="text-brand-turquoise">Twin</span></p>
            <h2 className="mt-6 font-display text-[2.6rem] font-extralight leading-[1.02] tracking-tight text-foreground sm:text-6xl">Prova gli interventi<br />prima di farli.</h2>
            <p className="mt-4 text-[15px] text-foreground/60">Ecco come funziona, in quattro passi.</p>
          </Reveal>
        </section>
        {STEPS.map((st, i) => (
          <section key={st.title} aria-label={`Passo ${i + 1} di ${STEPS.length}: ${st.title}`} aria-roledescription="schermata" aria-hidden={page !== i + 1 || undefined} className="flex w-full shrink-0 select-none flex-col justify-center px-8">
            <Reveal className="mx-auto w-full max-w-md">
              <svg viewBox="0 0 160 100" className="intro-draw h-36 w-auto text-foreground sm:h-44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{st.art}</svg>
              <p className="mt-8 font-mono text-sm tabular-nums text-foreground/50">0{i + 1} — 0{STEPS.length}</p>
              <h2 className="mt-2 font-display text-[2.4rem] font-extralight leading-tight tracking-tight text-foreground sm:text-5xl">{st.title}</h2>
              <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-foreground/60">{st.text}</p>
            </Reveal>
          </section>
        ))}
      </div>
      </div>
      {/* Only the swipe moves between screens; the dots show where you are. The white button appears on the last one only. */}
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <div className={`transition-[opacity,transform] duration-300 motion-reduce:transition-none ${last ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`} aria-hidden={!last}>
          <button type="button" onClick={finish} tabIndex={last ? 0 : -1}
            className="inline-flex h-14 items-center gap-2 rounded-full bg-foreground pl-7 pr-2 text-base font-semibold text-background outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100">
            {again ? "Fine" : "Inizia"}
            <span className="grid size-10 place-items-center rounded-full bg-background text-foreground"><ArrowRight className="size-5" aria-hidden="true" /></span>
          </button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Schermate">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-label={`Schermata ${i + 1} di ${count}`} aria-current={i === page ? "step" : undefined}
              className="grid h-8 min-w-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className={`block h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${i === page ? "w-6 bg-foreground" : "w-1.5 bg-foreground/30"}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The choice (/scegli): one big question, three numbered ways in, one white button and the way to the map. */
export function Choice() {
  useDarkChrome();
  useEffect(() => { markIntroSeen(); }, []);
  const navigate = useNavigate();
  const ai = useAiReadyHome();
  const [sel, setSel] = useState(0);
  const item = items[sel] ?? items[0]!;
  const open = (it: Item) => {
    if (it.id === "camera") setCameraSheetOpen(true);
    else void navigate({ to: it.id === "urban" ? "/urbano" : "/vigneto" });
  };
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  const pick = (i: number) => { if (i === sel) return; hapticTick(); setSel(i); };
  return (
    <div className="dark relative isolate min-h-dvh bg-background px-6 text-foreground [color-scheme:dark] sm:px-12">
      <Backdrop />
      <section aria-label="Scelta" className="mx-auto flex min-h-dvh max-w-xl flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]">
        <h1 className="sr-only">Da dove vuoi iniziare</h1>
        <Reveal>
          <h2 aria-hidden="true" className="font-display text-[3.4rem] font-extralight leading-[0.95] tracking-tight text-foreground sm:text-7xl">Da dove<br />vuoi iniziare?</h2>
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

function useAiReadyHome() {
  const { signedIn, demo } = useSignedIn();
  const installed = useInstalledApp();
  return signedIn && (installed || demo);
}
