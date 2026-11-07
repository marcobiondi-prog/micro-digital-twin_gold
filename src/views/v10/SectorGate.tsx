import { useCallback, useEffect, useRef, useState } from "react";
import { useSwipeBack } from "@/lib/use-swipe-back";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Grape, LogIn, Mail, Trash2, UserRound, X } from "lucide-react";
import { openAccount } from "@/lib/camera-dock";
import { introSeen } from "@/lib/intro-seen";
import { clearSectorGate, enterAsGuest, forgetKnownProId, type KnownProId, saveProId, useAccountSector, useGuest, useKnownProIds, useProId, useSectorGateAsk } from "@/lib/use-pro-id";
import { proSummary } from "@/models/professional-id";
import { toast } from "sonner";
import { useSignedIn } from "@/lib/use-signed-in";
import { useAccountAvatar } from "@/lib/account-avatar";
import { hapticTick } from "@/lib/haptics";
import { type ProId, type ProKind } from "@/models/professional-id";
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
  { kind: "agronomo", Icon: Grape, name: "Settore agricolo", who: "Per chi lavora nel settore agricolo", opens: "Si apre il vigneto: acqua, ombra e frangivento contro la sete delle viti." },
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
  // A guest passes it (until asked for by name, e.g. from the account panel's identification rows).
  const guest = useGuest();
  const shown = id === null && seen && ((shownOn(pathname) && !guest) || ask.at > 0);
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


/**
 * "Ti abbiamo riconosciuto": the profiles of this kind registered before on this phone (or brought by the account), to
 * continue as one of them — one as a card, more as a list to choose from, each with an ✕ to take it off the phone.
 * Shown on the sector page's form and on a locked section's page.
 */
export function KnownProfiles({ kind }: { kind: ProKind }) {
  const known = useKnownProIds(kind);
  const avatar = useAccountAvatar();
  const acc = useAccountSector();
  const pick = async (k: ProId) => { if (!(await saveProId(k))) return; toast.success(`Bentornato, ${k.name}`, { description: `Ritrovi la cronologia ${k.kind === "funzionario" ? "della piazza" : "del vigneto"}.` }); };
  // Signed in to an account of the other sector, these profiles cannot be used (the form below says why).
  if (!known.length || (acc?.kind && acc.kind !== kind)) return null;
  return (
              <div className="space-y-3 rounded-3xl bg-foreground/[0.08] p-5 ring-1 ring-brand-turquoise/40">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-turquoise">Ti abbiamo riconosciuto</p>
                {known.length === 1 ? (
                  <>
                    <div className="flex items-center gap-3.5">
                      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/10 ring-2 ring-brand-turquoise/50">
                        {(known[0]!.acct?.pic ?? avatar) ? <img src={known[0]!.acct?.pic ?? avatar!} alt="Immagine dell'account" referrerPolicy="no-referrer" className="size-full object-cover" /> : <UserRound className="size-7 text-foreground/60" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xl font-semibold">{known[0]!.name}</p>
                        <p className="text-sm text-foreground/70">{proSummary(known[0]!)}</p>
                        {known[0]!.acct?.email && <p className="text-xs text-foreground/55 [overflow-wrap:anywhere]">{known[0]!.acct.email}</p>}
                      </div>
                    </div>
                    <p className="text-xs text-foreground/60">Ti eri già registrato con questo profilo: continua e ritrovi la cronologia {kind === "funzionario" ? "della piazza" : "del vigneto"}.</p>
                    <button type="button" onClick={() => void pick(known[0]!)}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">
                      Continua come {known[0]!.name}<ArrowRight className="size-4" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-foreground/70">Su questo telefono si sono registrati {known.length} profili {kind === "funzionario" ? "del settore urbano" : "del settore agricolo"}: scegli chi sei e ritrovi la tua cronologia.</p>
                    <ProfileCarousel known={known} onPick={(k) => void pick(k)} />
                  </>
                )}
              </div>
  );
}


/**
 * More profiles of one sector on this phone, as a 3D carousel of cards: the cards slide sideways (scroll snap, one in
 * the middle), the ones aside turn away and step back in depth; each card shows the account picture (else the
 * initials), the name, the profile, the account's email, a white "Continua come …" and a bin that asks in place before
 * taking the profile off the phone. Flat with reduced motion.
 */
/** The card's line under the name: the licence and region, or the town and office (the kind is in the card's chip). */
const detailOf = (k: ProId) => k.kind === "agronomo"
  ? (k.licence ? `Patentino ${k.licence} · ${k.region}` : `Regione ${k.region}`)
  : `Comune di ${k.comune} · ${k.office}`;

function ProfileCarousel({ known, onPick }: { known: KnownProId[]; onPick: (k: KnownProId) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);
  const keyOf = (k: KnownProId) => `${k.kind}-${k.name}-${k.at}`;
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bestD = Infinity;
      Array.from(el.children).forEach((c, i) => {
        const card = c as HTMLElement;
        const d = (card.offsetLeft + card.offsetWidth / 2 - mid) / card.offsetWidth; // −1 … 1 for the neighbours
        if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
        if (reduce) return;
        const t = Math.max(-1.5, Math.min(1.5, d));
        const inner = card.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transform = `perspective(900px) translateZ(${-Math.abs(t) * 120}px) rotateY(${-t * 38}deg)`;
          inner.style.opacity = String(1 - Math.min(0.55, Math.abs(t) * 0.45));
        }
      });
      setActive(best);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [known.length]);
  const go = (i: number) => {
    const el = row.current, card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: "smooth" });
  };
  return (
    <div className="space-y-3">
      <div ref={row} role="list" aria-label="Profili registrati" data-map-gestures=""
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[13%] py-3 touch-pan-x [scrollbar-width:none]">
        {known.map((k, i) => (
          <div key={keyOf(k)} role="listitem" className="w-[74%] shrink-0 snap-center">
            <div data-active={i === active || undefined}
              className={`group relative flex h-full flex-col items-center overflow-hidden rounded-[28px] p-5 pt-4 text-center ring-1 transition-[box-shadow,opacity] duration-300 will-change-transform ${k.kind === "agronomo" ? "bg-[linear-gradient(165deg,oklch(0.36_0.07_150/0.95),oklch(0.22_0.03_200)_55%,oklch(0.17_0.015_258))]" : "bg-[linear-gradient(165deg,oklch(0.38_0.08_250/0.95),oklch(0.23_0.04_240)_55%,oklch(0.17_0.015_258))]"} ring-white/12 shadow-[0_22px_44px_-16px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.14)] data-[active]:shadow-[0_22px_48px_-14px_rgb(0_0_0/0.8),0_0_34px_-6px_rgb(45_212_191/0.45),inset_0_1px_0_rgb(255_255_255/0.18)] data-[active]:ring-brand-turquoise/45`}>
              {/* A soft light from the top, like the app's ambient. */}
              <span aria-hidden="true" className="pointer-events-none absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex w-full items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85 ring-1 ring-white/10">
                  {k.kind === "agronomo" ? <Grape className="size-3.5 text-emerald-300" aria-hidden="true" /> : <Building2 className="size-3.5 text-sky-300" aria-hidden="true" />}
                  {k.kind === "agronomo" ? "Agricoltore" : "Funzionario"}
                </span>
                <button type="button" onClick={() => setAsking(asking === keyOf(k) ? null : keyOf(k))} aria-label={`Elimina ${k.name} da questo telefono`} title="Elimina da questo telefono"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-black/25 text-white/70 outline-none ring-1 ring-white/10 transition-colors hover:bg-red-500/80 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-turquoise">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
              {/* The account picture in a turquoise ring with a glow (the initials without one). */}
              <span className="relative mt-3 rounded-full bg-[conic-gradient(from_200deg,#2dd4bf,#38bdf8,#a78bfa,#2dd4bf)] p-[3px] shadow-[0_0_28px_-4px_rgb(45_212_191/0.55)]" aria-hidden="true">
                <span className="grid size-[84px] place-items-center overflow-hidden rounded-full bg-[oklch(0.2_0.02_220)] text-2xl font-semibold text-brand-turquoise ring-2 ring-black/40">
                  {k.acct?.pic ? <img src={k.acct.pic} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : initials(k.name)}
                </span>
              </span>
              <p className="relative mt-3 w-full truncate font-display text-xl font-semibold tracking-tight text-white">{k.name}</p>
              <p className="relative mt-0.5 text-[13px] leading-snug text-white/70 [overflow-wrap:anywhere]">{detailOf(k)}</p>
              {k.acct?.email && (
                <span className="relative mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-2xl bg-black/25 px-3 py-1.5 text-left text-[11.5px] leading-tight text-white/80 ring-1 ring-white/10">
                  <Mail className="size-3.5 shrink-0 text-brand-turquoise" aria-hidden="true" /><span className="min-w-0 break-normal">{/* A long address breaks before the @, never inside the domain. */}{k.acct.email.split("@")[0]}<wbr />@{k.acct.email.split("@").slice(1).join("@")}</span>
                </span>
              )}
              <span aria-hidden="true" className="min-h-4 flex-1" />
              {asking === keyOf(k) ? (
                <div role="alertdialog" aria-label={`Eliminare ${k.name}?`} className="relative w-full space-y-2">
                  <p className="text-xs text-white/75">Eliminare questo profilo dal telefono? Resta nel suo account.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAsking(null)} className="h-10 flex-1 rounded-full bg-white/12 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">Annulla</button>
                    <button type="button" onClick={() => { setAsking(null); forgetKnownProId(k); toast(`${k.name} eliminato da questo telefono`); }} className="h-10 flex-1 rounded-full bg-red-500 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white">Elimina</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => (i === active ? onPick(k) : go(i))} aria-label={`Continua come ${k.name}`}
                  className="relative inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-black shadow-[0_8px_20px_-8px_rgb(0_0_0/0.6)] outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">
                  <span className="truncate">Continua</span><ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden="true">
        {known.map((k, i) => <button key={keyOf(k)} type="button" tabIndex={-1} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-brand-turquoise" : "w-1.5 bg-white/30"}`} />)}
      </div>
    </div>
  );
}

/** Two letters for a profile's round badge in the list ("Marco Biondi" → "MB"). */
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

function SectorPage({ start }: { start: ProKind | null }) {
  useDarkChrome();
  const { signedIn } = useSignedIn();
  const [kind, setKind] = useState<ProKind | null>(start);
  // On a sector's form a swipe to the right goes back to the two sectors, like "Indietro".
  const formRef = useRef<HTMLElement>(null);
  const backToSectors = useCallback(() => setKind(null), []);
  useSwipeBack(formRef, kind ? backToSectors : null);
  // The phone's Back closes the form and shows the two sectors again: a same-page history step while a form is open,
  // taken back when the form is closed by hand — but not when the whole page goes away because a profile is in (the
  // gate then moves to the simulation, and a Back here would undo that move).
  const formStep = useRef(false);
  useEffect(() => {
    if (!kind) {
      if (formStep.current) { formStep.current = false; if (window.history.state?.__sectorForm) window.history.back(); }
      return;
    }
    if (!formStep.current) { window.history.pushState({ ...(window.history.state ?? {}), __sectorForm: true }, ""); formStep.current = true; }
    const onPop = () => { formStep.current = false; setKind(null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [kind]);
  // The profile of this kind registered before (on this device or in the account): recognised, one tap brings it back
  // with its project's history.
  const known = useKnownProIds(kind);
  const acct = useAccountSector();
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
      <section ref={formRef} className="mx-auto flex min-h-full max-w-xl flex-col gap-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]">
        {sector ? (
          <>
            <button type="button" onClick={backToSectors} className="-ml-1 inline-flex h-10 w-fit items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowLeft className="size-5" aria-hidden="true" />Indietro
            </button>
            <h1 className="font-display text-[2.6rem] font-extralight leading-[1] tracking-tight">{sector.name}</h1>
            <p className="text-[15px] leading-relaxed text-foreground/60">{profileIntro(sector.kind)}</p>
            <KnownProfiles kind={sector.kind} />
            {signIn}
            {known.length > 0 && !(acct?.kind && acct.kind !== sector.kind) && <p className="px-1 pt-2 text-sm font-semibold text-foreground/70">Oppure registra un altro profilo</p>}
            <IdentifyForm kind={sector.kind} onDone={done} />
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-foreground/60">Micro Digital <span className="text-brand-turquoise">Twin</span></p>
            <h1 className="font-display text-[3.2rem] font-extralight leading-[0.95] tracking-tight sm:text-7xl">Da dove<br />vuoi usarmi?</h1>
            <p className="max-w-xs text-[15px] leading-relaxed text-foreground/60">Scegli il tuo settore e identificati: si apre la tua simulazione.</p>
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
            <div className="mt-auto space-y-3 pt-4">
              {signIn}
              <button type="button" onClick={() => { hapticTick(); enterAsGuest(); toast("Sei entrato come ospite", { description: "Prova la piazza e il vigneto. Quando vuoi, identificati dal tuo account." }); }}
                className="flex w-full items-center gap-3 rounded-3xl px-5 py-4 text-left outline-none ring-1 ring-foreground/15 transition-colors hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring">
                <UserRound className="size-5 shrink-0 text-foreground/70" aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Entra come ospite</span><span className="block text-xs text-foreground/60">Prova la piazza e il vigneto senza identificarti.</span></span>
                <ArrowRight className="size-4 shrink-0 text-foreground/60" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
