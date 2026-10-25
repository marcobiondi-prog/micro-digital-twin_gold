import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Building2, Grape, ScanLine } from "lucide-react";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useSignedIn } from "@/lib/use-signed-in";
import { useInstalledApp } from "@/lib/installed-app";
import aiLogo from "@/assets/ai-logo.png";
import { applySharedScenario } from "@/views/ScenarioTools";
import { setHomeFocus } from "@/lib/home-focus";
import { hapticTick } from "@/lib/haptics";

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
  // The bottom bar points at the chosen line while this page is open, so the tutorial also shows where each one lives.
  useEffect(() => { setHomeFocus(item.id); }, [item.id]);
  useEffect(() => () => setHomeFocus(null), []);
  const rows = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    // The opening page, like a first-run tutorial: no colour, one question, three plain choices, one white button.
    <div className="mx-auto flex min-h-[calc(100dvh-14rem)] max-w-xl flex-col pt-4 sm:pt-12">
      <h1 className="sr-only">Micro Digital Twin</h1>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Benvenuto</p>
      <h2 className="mt-3 font-display text-4xl font-light leading-tight tracking-tight text-foreground sm:text-5xl">Da dove vuoi iniziare?</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">Scegli una delle tre. Poi le ritrovi nel menu in basso.</p>
      <div role="radiogroup" aria-label="Da dove vuoi iniziare" className="mt-8 divide-y divide-foreground/10 border-y border-foreground/10"
        onKeyDown={(e) => {
          const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const n = (sel + d + items.length) % items.length;
          hapticTick(); setSel(n); rows.current[n]?.focus();
        }}>
        {items.map((it, i) => {
          const on = i === sel;
          return (
            <button key={it.id} ref={(el) => { rows.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              onClick={() => { if (on) open(it); else { hapticTick(); setSel(i); } }}
              className="flex w-full items-center gap-4 py-4 text-left outline-none focus-visible:bg-foreground/[0.04]">
              <span className="w-5 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full border transition-colors duration-200 motion-reduce:transition-none ${on ? "border-foreground bg-foreground text-background" : "border-foreground/25 text-foreground/80"}`}>
                {it.id === "camera" && ai ? <img src={aiLogo} alt="" aria-hidden="true" className="size-7" /> : <it.Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-base font-semibold ${on ? "text-foreground" : "text-foreground/80"}`}>{it.name}</span>
                <span className="block text-sm leading-snug text-muted-foreground">{it.desc}</span>
              </span>
              <span className={`size-4 shrink-0 rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none ${on ? "border-foreground bg-foreground shadow-[inset_0_0_0_3px_var(--background)]" : "border-foreground/30"}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col items-stretch gap-2 pt-10 sm:flex-row sm:items-center">
        <button type="button" onClick={() => open(item)}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-foreground px-8 text-base font-semibold text-background outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100">
          Continua<ArrowRight className="size-5" aria-hidden="true" />
        </button>
        <Link to="/mappa" className="inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Salta, vai alla mappa</Link>
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
