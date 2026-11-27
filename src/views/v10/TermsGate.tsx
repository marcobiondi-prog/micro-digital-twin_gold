import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "@tanstack/react-router";
import { Check, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { introSeen } from "@/lib/intro-seen";
import { getProId, openSectorGate } from "@/lib/use-pro-id";
import { acceptTerms, installTermsSync, useTermsAcceptedAt } from "@/lib/terms";
import { InfoNav, type InfoPath } from "@/views/v10/InfoPage";
import { Backdrop, useDarkChrome } from "@/views/v10/intro";

const TermsPage = lazy(() => import("@/views/v10/legal-pages").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("@/views/v10/legal-pages").then((m) => ({ default: m.PrivacyPage })));
const CookiePage = lazy(() => import("@/views/v10/legal-pages").then((m) => ({ default: m.CookiePage })));

/** Pages where the gate never shows: the tutorial itself, the admin, a password reset and the legal pages it links to. */
const FREE = ["/legale", "/privacy", "/admin", "/reset-password"];
const shownOn = (path: string) => path !== "/" && !FREE.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Terms of use at the entrance: once the tutorial is over (and on computers, where it is skipped), before the sector
 * choice, a dark page asks to accept the Termini di servizio and the Informativa sulla privacy — both readable in
 * place — with a checkbox and "Accetto e continuo". Accepted once, never asked again (lib/terms).
 */
export function TermsGate() {
  const { pathname } = useLocation();
  const accepted = useTermsAcceptedAt();
  const [seen, setSeen] = useState(false);
  useEffect(() => setSeen(introSeen()), [pathname]);
  useEffect(() => installTermsSync(), []);
  if (accepted || !seen || !shownOn(pathname)) return null;
  return createPortal(<TermsScreen />, document.body);
}

type Reading = null | "/legale/termini" | "/privacy/informativa" | "/privacy/cookie";

function TermsScreen() {
  useDarkChrome();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<Reading>(null);
  useEffect(() => {
    const html = document.documentElement, before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = before; };
  }, []);
  const accept = async () => {
    if (!ok || busy) return;
    setBusy(true);
    await acceptTerms();
    // Straight on to the sector choice ("Da dove vuoi usarmi?"), unless a profile is already in use.
    if (!getProId()) openSectorGate(null);
  };
  const open = (to: InfoPath) => {
    if (to === "/legale/termini" || to === "/privacy/informativa" || to === "/privacy/cookie") setReading(to);
  };
  const Page = reading === "/legale/termini" ? TermsPage : reading === "/privacy/informativa" ? PrivacyPage : reading === "/privacy/cookie" ? CookiePage : null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Termini di utilizzo" className="dark fixed inset-0 z-[1000000020] isolate overflow-y-auto overscroll-contain bg-background px-6 text-foreground [color-scheme:dark] sm:px-12">
      <Backdrop />
      {Page ? (
        <div className="mx-auto max-w-2xl pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2.5rem+env(safe-area-inset-top))]">
          <InfoNav.Provider value={{ back: () => setReading(null), open }}>
            <Suspense fallback={<div className="flex justify-center py-16"><LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Carico" /></div>}>
              <Page />
            </Suspense>
          </InfoNav.Provider>
          <button type="button" onClick={() => setReading(null)} className="mt-6 h-12 w-full rounded-full bg-white font-semibold text-black">Torna all’accettazione</button>
        </div>
      ) : (
        <section className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(3rem+env(safe-area-inset-top))]">
          <span className="grid size-16 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30" aria-hidden="true">
            <ShieldCheck className="size-8" />
          </span>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Prima di iniziare</p>
            <h1 className="font-display text-4xl font-light leading-tight tracking-tight sm:text-5xl">Termini di utilizzo</h1>
            <p className="text-[15px] leading-relaxed text-foreground/75">Per usare Micro Digital Twin accetta i termini di servizio e l’informativa sulla privacy. Lo chiediamo una volta sola.</p>
          </div>
          <ul className="space-y-2 rounded-3xl bg-foreground/[0.05] p-5 text-[15px] leading-relaxed text-foreground/85">
            <li className="flex gap-2.5"><Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />I risultati delle simulazioni sono stime indicative: non sostituiscono rilievi, progetti o il parere di un tecnico.</li>
            <li className="flex gap-2.5"><Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />Sei responsabile dei contenuti che carichi (foto, video, note) e puoi cancellarli quando vuoi.</li>
            <li className="flex gap-2.5"><Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />Posizione, fotocamera e notifiche si usano solo con il tuo permesso.</li>
          </ul>
          <div className="grid gap-2 sm:grid-cols-3">
            {([["/legale/termini", "Termini di servizio"], ["/privacy/informativa", "Informativa privacy"], ["/privacy/cookie", "Cookie"]] as const).map(([to, label]) => (
              <button key={to} type="button" onClick={() => setReading(to)} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground/[0.08] px-4 text-sm font-semibold outline-none hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring">
                <FileText className="size-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-3xl bg-foreground/[0.05] p-4 text-[15px] leading-snug">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[oklch(0.78_0.13_185)]" />
            <span>Ho letto e accetto i <b>Termini di servizio</b> e l’<b>Informativa sulla privacy</b>.</span>
          </label>
          <button type="button" onClick={() => void accept()} disabled={!ok || busy} className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-black transition-opacity disabled:opacity-40">
            {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}Accetto e continuo
          </button>
          <p className="text-center text-xs text-muted-foreground">Li ritrovi quando vuoi in Account → Piani e informazioni → Legale.</p>
        </section>
      )}
    </div>
  );
}
