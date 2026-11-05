import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Grape, LogIn } from "lucide-react";
import { openAccount } from "@/lib/camera-dock";
import { introSeen } from "@/lib/intro-seen";
import { clearSectorGate, saveProId, useLastProId, useProId, useSectorGateAsk } from "@/lib/use-pro-id";
import { proSummary } from "@/models/professional-id";
import { toast } from "sonner";
import { useSignedIn } from "@/lib/use-signed-in";
import { hapticTick } from "@/lib/haptics";
import { type ProKind } from "@/models/professional-id";
import { openSimTab } from "@/views/v8/console";
import { IdentifyForm, profileIntro } from "@/views/v10/Identify";
import { Backdrop, useDarkChrome } from "@/views/v10/intro";

/**
 * With no professional profile (never chosen, or after signing out of the account or of the profile) the app asks
 * first, over everything like a sign-in page: "Da dove vuoi usarmi?" — the urban sector (municipal officers, the
 * piazza) or the agricultural one (agronomists, the vineyard). Choosing shows that profile's identification form,
 * with the way to sign in for whoever already has an account (the account brings its saved profile back). Once a
 * profile is in, the page goes away and its simulation opens on Mappa. Not shown on the tutorial, the choice, the
 * identification pages and the info pages, which have their own way in.
 */
const SECTORS: Array<{ kind: ProKind; Icon: typeof Building2; name: string; who: string; opens: string }> = [
  { kind: "funzionario", Icon: Building2, name: "Settore urbano", who: "Per i funzionari del Comune", opens: "Si apre la piazza: alberi, aiuole e ombra contro il caldo." },
  { kind: "agronomo", Icon: Grape, name: "Settore agricolo", who: "Per gli agronomi", opens: "Si apre il vigneto: acqua, ombra e vento per le viti." },
];
const FREE_PATHS = ["/", "/scegli", "/identificazione", "/privacy", "/legale", "/faq", "/chi-siamo", "/contatti", "/piani", "/reset-password", "/admin"];
const shownOn = (path: string) => !FREE_PATHS.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`)));

export function SectorGate() {
  const id = useProId();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [seen, setSeen] = useState(false);
  useEffect(() => setSeen(introSeen()), [pathname]);
  // Asked for by name (leaving a profile or the account, the account panel's rows): shown on any page, on that form.
  const ask = useSectorGateAsk();
  const shown = id === null && seen && (shownOn(pathname) || ask.at > 0);
  // Signing in to an account that had a profile brings it back: the page goes away and that simulation opens on Mappa.
  const wasShown = useRef(false);
  useEffect(() => {
    if (shown) { wasShown.current = true; return; }
    if (id) clearSectorGate();
    if (wasShown.current && id) {
      wasShown.current = false;
      const section = id.kind === "agronomo" ? "vineyard" : "urban";
      openSimTab(section, "mappa");
      void navigate({ to: section === "urban" ? "/urbano" : "/vigneto", replace: true });
    }
  }, [shown, id, navigate]);
  if (!shown) return null;
  // Over everything (menus and bottom bar too), under the account dialog, which opens above it to sign in.
  return createPortal(<SectorPage key={ask.at} start={ask.kind} />, document.body);
}

function SectorPage({ start }: { start: ProKind | null }) {
  useDarkChrome();
  const { signedIn } = useSignedIn();
  const [kind, setKind] = useState<ProKind | null>(start);
  // The profile of this kind registered before (on this device or in the account): recognised, one tap brings it back
  // with its project's history.
  const previous = useLastProId(kind);
  // The page behind does not scroll while this one is up.
  useEffect(() => {
    const html = document.documentElement, before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = before; };
  }, []);
  const sector = SECTORS.find((s) => s.kind === kind) ?? null;
  // Once identified the page goes away by itself and SectorGate opens the simulation.
  const done = () => undefined;
  const signIn = !signedIn && (
    <button type="button" onClick={openAccount} className="flex w-full items-center gap-3 rounded-3xl bg-foreground/[0.06] px-5 py-4 text-left outline-none transition-colors hover:bg-foreground/[0.1] focus-visible:ring-2 focus-visible:ring-ring">
      <LogIn className="size-5 shrink-0 text-brand-turquoise" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Hai già un account? Accedi</span><span className="block text-xs text-foreground/60">Il profilo che avevi salvato torna da solo.</span></span>
      <ArrowRight className="size-4 shrink-0 text-foreground/60" aria-hidden="true" />
    </button>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label="Da dove vuoi usarmi?" className="dark fixed inset-0 z-[999999999] isolate overflow-y-auto overscroll-contain bg-background px-6 text-foreground [color-scheme:dark] sm:px-12">
      <Backdrop />
      <section className="mx-auto flex min-h-full max-w-xl flex-col gap-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]">
        {sector ? (
          <>
            <button type="button" onClick={() => setKind(null)} className="-ml-1 inline-flex h-10 w-fit items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowLeft className="size-5" aria-hidden="true" />Indietro
            </button>
            <h1 className="font-display text-[2.6rem] font-extralight leading-[1] tracking-tight">{sector.name}</h1>
            <p className="text-[15px] leading-relaxed text-foreground/60">{profileIntro(sector.kind)}</p>
            {previous && (
              <div className="space-y-3 rounded-3xl bg-foreground/[0.08] p-5 ring-1 ring-brand-turquoise/40">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-turquoise">Ti abbiamo riconosciuto</p>
                <div>
                  <p className="text-xl font-semibold">{previous.name}</p>
                  <p className="text-sm text-foreground/70">{proSummary(previous)}</p>
                </div>
                <p className="text-xs text-foreground/60">Ti eri già registrato con questo profilo: continua e ritrovi la cronologia {sector.kind === "funzionario" ? "della piazza" : "del vigneto"}.</p>
                <button type="button" onClick={() => { void saveProId(previous); toast.success(`Bentornato, ${previous.name}`, { description: `Ritrovi la cronologia ${sector.kind === "funzionario" ? "della piazza" : "del vigneto"}.` }); }}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">
                  Continua come {previous.name}<ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            )}
            {signIn}
            {previous && <p className="px-1 pt-2 text-sm font-semibold text-foreground/70">Oppure registra un altro profilo</p>}
            <IdentifyForm kind={sector.kind} onDone={done} />
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-foreground/60">Micro Digital <span className="text-brand-turquoise">Twin</span></p>
            <h1 className="font-display text-[3.2rem] font-extralight leading-[0.95] tracking-tight sm:text-7xl">Da dove<br />vuoi usarmi?</h1>
            <p className="max-w-xs text-[15px] leading-relaxed text-foreground/60">Scegli il tuo settore e identificati: si apre la tua simulazione. Un settore alla volta.</p>
            <div role="radiogroup" aria-label="Settore" className="mt-4 space-y-3">
              {SECTORS.map((s) => (
                <button key={s.kind} type="button" role="radio" aria-checked={false} onClick={() => { hapticTick(); setKind(s.kind); document.querySelector('[aria-label="Da dove vuoi usarmi?"]')?.scrollTo({ top: 0 }); }}
                  className="flex w-full items-center gap-4 rounded-3xl bg-foreground/[0.07] p-5 text-left outline-none ring-1 ring-foreground/10 transition-colors hover:bg-foreground/[0.11] focus-visible:ring-2 focus-visible:ring-foreground">
                  <s.Icon className="size-8 shrink-0 text-brand-turquoise" strokeWidth={1.5} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xl font-semibold">{s.name}</span>
                    <span className="block text-sm text-foreground/70">{s.who}</span>
                    <span className="mt-1 block text-xs text-foreground/55">{s.opens}</span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-foreground/60" aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="mt-auto pt-4">{signIn}</div>
          </>
        )}
      </section>
    </div>
  );
}
