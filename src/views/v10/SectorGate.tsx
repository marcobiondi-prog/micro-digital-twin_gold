import { goInApp } from "@/lib/app-nav";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSwipeBack } from "@/lib/use-swipe-back";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Grape, LogIn, Mail, Pencil, Plus, Trash2, UserPlus, UserRound, X } from "lucide-react";
import { openAccount } from "@/lib/camera-dock";
import { addGoogleAccount, leaveAccount, signInAs, switchToAccount } from "@/lib/account-sessions";
import { BioIcon, checkProfileBiometric, ProfileBioButton, proBioKey } from "@/views/v10/Biometric";
import { useBiometricOn } from "@/lib/biometric";
import { supabase } from "@/integrations/supabase/client";
import { introSeen } from "@/lib/intro-seen";
import { clearSectorGate, enterAsGuest, forgetKnownProId, dropProIdOnDevice, keepProIdInAccount, setProIdOnDevice, rememberAddingSector, rememberWantedSector, renameKnownProId, sectorOf, type KnownProId, saveProId, useAccountSector, useGuest, useKnownProIds, useProId, useSectorGateAsk } from "@/lib/use-pro-id";
import { proSummary } from "@/models/professional-id";
import { toast } from "sonner";
import { useSignedIn } from "@/lib/use-signed-in";
import { useAccountAvatar } from "@/lib/account-avatar";
import { hapticTick } from "@/lib/haptics";
import { type ProId, type ProKind } from "@/models/professional-id";
import { openSimTab } from "@/views/v8/console";
import { IdentifyForm, lockShown, profileIntro } from "@/views/v10/Identify";
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
  return createPortal(<SectorPage key={ask.kind ?? "default"} start={ask.kind} />, document.body);
}


/**
 * "Ti abbiamo riconosciuto": the profiles of this kind registered before on this phone (or brought by the account), to
 * continue as one of them — one as a card, more as a list to choose from, each with an ✕ to take it off the phone.
 * Shown on the sector page's form and on a locked section's page.
 */
export function KnownProfiles({ kind, onPicked }: { kind: ProKind; onPicked?: () => void }) {
  const all = useKnownProIds(kind);
  const accEmail = useAccountSector()?.email ?? null;
  const acc = useAccountSector();
  const avatar = useAccountAvatar();
  // Every profile of the sector registered on this phone shows. Signed in, a profile tied to another personal account
  // is not taken over: its card offers to sign in with that account instead.
  const foreign = (k: KnownProId) => !!accEmail && !!k.acct?.email && k.acct.email !== accEmail;
  // Signed in to an account of the other sector, its own profiles of this sector cannot be used (the form below says
  // why); the other accounts' ones still show, to sign in with them.
  const known = acc?.kind && acc.kind !== kind ? all.filter(foreign) : all;
  const pick = async (k: KnownProId) => {
    // Face ID / fingerprint on for this profile: asked first.
    if (!(await checkProfileBiometric(k))) return;
    const target = k.acct?.email ?? null;
    const flow = k.kind === "funzionario" ? "della piazza" : "del vigneto";
    // The profile's personal account is entered with it: at once when it is kept on this phone (no password, no
    // Google), else the sign-in opens for it.
    if (target && target !== accEmail) {
      rememberWantedSector(kind);
      if (accEmail) await keepProIdInAccount();
      const entered = await switchToAccount(target);
      if (entered === "refused") { toast.error("Non ti ho riconosciuto", { description: `Per entrare con ${target} serve il riconoscimento del telefono. Riprova.` }); return; }
      if (entered) {
        // Its account goes to this profile's sector (the person chose it), then the profile is put in use.
        // One account, one sector: an account of the other sector is not moved (saveProId refuses and says so).
        if (!(await saveProId(k))) return;
        toast.success(`Bentornato, ${k.name}`, { description: `Sei entrato anche con il tuo account ${target}.` });
        // A clean start on that account's simulation: every list and cache read again for it.
        goInApp(k.kind === "funzionario" ? "/urbano" : "/vigneto");
        return;
      }
      // Its account is not kept on this phone: the profile goes in use and its account's sign-in starts by itself
      // (Google straight for that address, else the panel with the email written); signed in, the account and the
      // profile come together (the adopt counts the profile tied to the email) and from then on it is kept here.
      const to = k.kind === "funzionario" ? "/urbano" : "/vigneto";
      if (accEmail) setProIdOnDevice(k); else if (!(await saveProId(k))) return;
      toast(`Accedo con ${target}`, { description: `Collego il tuo account personale a ${k.name}.` });
      await signInAs(target, { provider: k.acct?.provider, back: to });
      return;
    }
    if (!(await saveProId(k))) return;
    toast.success(`Bentornato, ${k.name}`, { description: `Ritrovi la cronologia ${flow}.` });
    onPicked?.();
  };
  // "Aggiungi account": another personal account signs in here (the current one stays kept on the phone).
  const addAccount = async () => {
    rememberWantedSector(kind);
    rememberAddingSector(kind);
    if (accEmail) await keepProIdInAccount();
    if (!(await addGoogleAccount())) openAccount();
  };
  // No profile of this sector on the phone yet (often the vineyard, the first time): the quick "Aggiungi account"
  // still shows, on its own, so another personal account can sign in here and bring its profile.
  // No profile of this sector on the phone yet: the same carousel as the other sector, with only its last slide,
  // "Aggiungi account".
  // The account just added (signed in, of this sector or of none yet) with no profile of this sector on the phone: it
  // is in, and shows here at once — its picture and email — with one step left, the profile below.
  const freshAccount = !!accEmail && (!acc?.kind || acc.kind === kind) && !all.some((k) => k.acct?.email?.toLowerCase() === accEmail.toLowerCase());
  const fresh = freshAccount && <NewAccountCard email={accEmail!} pic={avatar} kind={kind} />;
  if (!known.length) return <div className="space-y-3">{fresh}<ProfileCarousel known={[]} foreign={foreign} onPick={(k) => void pick(k)} onAdd={() => void addAccount()} /></div>;
  if (known.length > 0) return (
    <div className="space-y-2">
      {fresh}
      {known.length > 1 && <p className="px-1 text-sm text-foreground/70">Su questo telefono ci sono {known.length} profili {kind === "funzionario" ? "del settore urbano" : "del settore agricolo"}: scorri e scegli chi sei.</p>}
      <ProfileCarousel known={known} foreign={foreign} onPick={(k) => void pick(k)} onAdd={() => void addAccount()} />
    </div>
  );
  return (
              <div className="space-y-3 rounded-3xl bg-foreground/[0.08] p-5 ring-1 ring-brand-turquoise/40">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-turquoise">Ti abbiamo riconosciuto</p>
                {known.length === 1 ? (
                  <>
                    <div className="flex items-center gap-3.5">
                      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/10 ring-2 ring-brand-turquoise/50">
                        {(known[0]!.acct?.pic ?? avatar) ? <img src={known[0]!.acct?.pic ?? avatar!} alt="Immagine dell’account" referrerPolicy="no-referrer" className="size-full object-cover" /> : <UserRound className="size-7 text-foreground/60" aria-hidden="true" />}
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
                    <ProfileCarousel known={known} foreign={foreign} onPick={(k) => void pick(k)} onAdd={() => void addAccount()} />
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
function ProfileCarousel({ known, foreign, onPick, onAdd }: { known: KnownProId[]; foreign: (k: KnownProId) => boolean; onPick: (k: KnownProId) => void; onAdd: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState<string | null>(null);
  // The card whose name is being changed, and the name typed.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const rename = async (k: KnownProId) => {
    const name = draft.trim();
    if (name.length < 2) { toast.error("Scrivi un nome di almeno 2 lettere"); return; }
    setEditing(null);
    if (name === k.name) return;
    if (await renameKnownProId(k, name)) toast.success("Nome cambiato", { description: `Il profilo ora si chiama ${name}.` });
  };
  const keyOf = (k: KnownProId) => `${k.kind}-${k.name}-${k.at}`;
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bestD = Infinity;
      Array.from(el.children).forEach((c, i) => {
        const card = c as HTMLElement;
        const d = (card.offsetLeft + card.offsetWidth / 2 - mid) / card.offsetWidth; // −1 … 1 for the neighbours
        if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
        const t = Math.max(-1.5, Math.min(1.5, d));
        const inner = card.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transformOrigin = t > 0 ? "left center" : "right center";
          inner.style.transform = `perspective(800px) translateZ(${-Math.abs(t) * 90}px) rotateY(${-t * 42}deg)`;
          inner.style.opacity = String(1 - Math.min(0.5, Math.abs(t) * 0.4));
        }
      });
      setActive(best);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    frame = requestAnimationFrame(paint);
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
        className={`no-scrollbar -mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[11%] py-4 touch-pan-x [scrollbar-width:none] sm:-mx-0`}>
        {known.map((k, i) => (
          <div key={keyOf(k)} role="listitem" className="w-[78%] shrink-0 snap-center">
            <div data-active={i === active || undefined}
              className="relative flex h-full flex-col gap-3 rounded-3xl bg-[oklch(0.24_0.016_258/0.96)] p-4 ring-1 ring-brand-turquoise/25 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.75)] transition-[box-shadow] duration-300 will-change-transform data-[active]:ring-brand-turquoise/55 data-[active]:shadow-[0_18px_40px_-16px_rgb(0_0_0/0.75),0_0_28px_-8px_rgb(45_212_191/0.4)]">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-turquoise">Ti abbiamo riconosciuto</p>
                <div className="-mr-1.5 -mt-1.5 flex shrink-0">
                <ProfileBioButton id={k} />
                <button type="button" onClick={() => { setAsking(null); if (editing === keyOf(k)) setEditing(null); else { setEditing(keyOf(k)); setDraft(k.name); } }} aria-label={`Cambia il nome di ${k.name}`} title="Cambia nome"
                  className="grid size-9 place-items-center rounded-full text-foreground/50 outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-turquoise">
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => { setEditing(null); setAsking(asking === keyOf(k) ? null : keyOf(k)); }} aria-label={`Elimina ${k.name} da questo telefono`} title="Elimina da questo telefono"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-foreground/50 outline-none transition-colors hover:bg-red-500/20 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-brand-turquoise">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
                </div>
              </div>
              <div className="flex items-center gap-3.5">
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-turquoise/15 text-lg font-semibold text-brand-turquoise ring-2 ring-brand-turquoise/50" aria-hidden="true">
                  {k.acct?.pic ? <img src={k.acct.pic} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : initials(k.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-semibold leading-tight [overflow-wrap:anywhere]">{k.name}</p>
                  <p className="text-sm text-foreground/70">{proSummary(k)}</p>
                  {k.acct?.email && <p className="text-xs text-foreground/55 [overflow-wrap:anywhere]">{k.acct.email}</p>}
                </div>
              </div>
              {editing === keyOf(k) ? (
                <form className="mt-auto space-y-2" onSubmit={(e) => { e.preventDefault(); void rename(k); }}>
                  <label className="block text-xs text-foreground/70" htmlFor={`nome-${keyOf(k)}`}>Che nome vuoi dare a questo profilo?</label>
                  <input id={`nome-${keyOf(k)}`} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={60} autoComplete="off"
                    className="h-11 w-full rounded-xl bg-foreground/[0.08] px-3 text-[15px] outline-none ring-1 ring-foreground/15 focus:ring-2 focus:ring-brand-turquoise" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(null)} className="h-11 flex-1 rounded-full bg-foreground/[0.1] text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">Annulla</button>
                    <button type="submit" className="h-11 flex-1 rounded-full bg-white text-sm font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">Salva</button>
                  </div>
                </form>
              ) : asking === keyOf(k) ? (
                <div role="alertdialog" aria-label={`Eliminare ${k.name}?`} className="mt-auto space-y-2">
                  <p className="text-xs text-foreground/70">Eliminare questo profilo dal telefono? Resta nel suo account.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAsking(null)} className="h-11 flex-1 rounded-full bg-foreground/[0.1] text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">Annulla</button>
                    <button type="button" onClick={() => { setAsking(null); forgetKnownProId(k); toast(`${k.name} eliminato da questo telefono`); }} className="h-11 flex-1 rounded-full bg-red-500 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white">Elimina</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-foreground/60">{foreign(k)
                    ? <>Entri anche con il suo account personale {k.acct?.email} e ritrovi la cronologia {k.kind === "funzionario" ? "della piazza" : "del vigneto"}.</>
                    : <>Ti eri già registrato con questo profilo: continua e ritrovi la cronologia {k.kind === "funzionario" ? "della piazza" : "del vigneto"}.</>}</p>
                  <button type="button" onClick={() => (i === active ? onPick(k) : go(i))} aria-label={foreign(k) ? `Accedi con l’account di ${k.name}` : `Continua come ${k.name}`}
                    className="mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">
                    {foreign(k)
                      ? <><LogIn className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">Accedi come {k.name.trim().split(/\s+/)[0]}</span></>
                      : <ContinueLabel k={k} />}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {/* The last slide: add another personal account, quickly. */}
        <div role="listitem" className="w-[78%] shrink-0 snap-center">
          <div data-active={known.length === active || undefined}
            className="relative flex h-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-brand-turquoise/40 bg-[oklch(0.24_0.016_258/0.7)] p-5 text-center will-change-transform data-[active]:border-brand-turquoise/70">
            <span className="grid size-16 place-items-center rounded-full bg-brand-turquoise/15 text-brand-turquoise ring-2 ring-brand-turquoise/50" aria-hidden="true"><UserPlus className="size-7" /></span>
            <p className="text-xl font-semibold">Aggiungi account</p>
            <p className="text-xs text-foreground/65">Scegli un altro account Google: il suo profilo si aggiunge qui.</p>
            <button type="button" onClick={() => (known.length === active ? onAdd() : go(known.length))}
              className="mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">
              <Plus className="size-4" aria-hidden="true" />Aggiungi account
            </button>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden="true">
        {[...known.map(keyOf), "add"].map((key, i) => <button key={key} type="button" tabIndex={-1} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-brand-turquoise" : "w-1.5 bg-white/30"}`} />)}
      </div>
    </div>
  );
}

/** "Continua come <name>", or with Face ID / fingerprint on for the profile, its icon and "con Face ID". */
function ContinueLabel({ k }: { k: KnownProId }) {
  const bio = useBiometricOn(proBioKey(k));
  const first = k.name.trim().split(/\s+/)[0];
  return bio
    ? <><BioIcon className="size-4 shrink-0" /><span className="truncate">Continua come {first}</span></>
    : <><span className="truncate">Continua come {first}</span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></>;
}

/** Two letters for a profile's round badge in the list ("Marco Biondi" → "MB"). */
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

function SectorPage({ start }: { start: ProKind | null }) {
  useDarkChrome();
  const { signedIn } = useSignedIn();
  const [kind, setKind] = useState<ProKind | null>(start);
  useEffect(() => {
    if (start !== undefined) setKind(start);
  }, [start]);
  // On a sector's form a swipe to the right goes back to the two sectors, like "Indietro".
  const formRef = useRef<HTMLElement>(null);
  const backToSectors = useCallback(() => setKind(null), []);
  // The sector being entered, remembered across a sign-in with Google (which leaves the page and comes back).
  useEffect(() => { if (kind) rememberWantedSector(kind); }, [kind]);
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
    const onPop = () => {
      if (lockShown.on) return;
      if (window.history.state?.__sectorForm) return;
      formStep.current = false;
      setKind(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [kind]);
  // Just left an account from the sector lock page: the sector choice holds the phone's Back, which would lead to
  // Google's account chooser and from there back to the lock page.
  useEffect(() => {
    let on = false;
    try { on = sessionStorage.getItem("mdt-gate-guard") === "1"; } catch { /* none */ }
    if (!on) return;
    const guard = () => { if (!window.history.state?.__gateGuard && !window.history.state?.__sectorForm) window.history.pushState({ ...(window.history.state ?? {}), __gateGuard: true }, ""); };
    guard();
    window.addEventListener("popstate", guard);
    return () => window.removeEventListener("popstate", guard);
  }, []);
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
  const signIn = (
    <button type="button" onClick={openAccount} className="flex w-full items-center gap-3 rounded-3xl bg-foreground/[0.06] px-5 py-4 text-left outline-none transition-colors hover:bg-foreground/[0.1] focus-visible:ring-2 focus-visible:ring-ring">
      <LogIn className="size-5 shrink-0 text-brand-turquoise" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">Hai già un account? Accedi</span><span className="block text-xs text-foreground/60">Il profilo che avevi salvato torna da solo.</span></span>
      <ArrowRight className="size-4 shrink-0 text-foreground/60" aria-hidden="true" />
    </button>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label="Scegli il settore" className="dark fixed inset-0 z-[999999999] isolate overflow-y-auto overscroll-contain bg-background px-6 text-foreground [color-scheme:dark] sm:px-12">
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
            {!(acct?.kind && acct.kind !== sector.kind) && <p className="px-1 pt-2 text-sm font-semibold text-foreground/70">Oppure registra un altro profilo</p>}
            <IdentifyForm kind={sector.kind} onDone={done} />
          </>
        ) : (
          <>
            <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-foreground/60"><span className="whitespace-nowrap">Micro Digital</span><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="text-brand-turquoise">Twin</span><span className="rounded-full border border-brand-turquoise/40 bg-brand-turquoise/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-brand-turquoise">BETA</span></span></p>
            <h1 className="font-display text-[3.2rem] font-extralight leading-[0.95] tracking-tight sm:text-7xl">Da dove<br />vuoi usarmi?</h1>
            <p className="max-w-xs text-[15px] leading-relaxed text-foreground/60">Scegli il tuo settore e identificati: si apre la tua simulazione.</p>
            <div role="radiogroup" aria-label="Settore" className="mt-4 space-y-3">
              {SECTORS.map((s) => (
                <button key={s.kind} type="button" role="radio" aria-checked={false} onClick={() => { hapticTick(); setKind(s.kind); document.querySelector('[aria-label="Scegli il settore"]')?.scrollTo({ top: 0 }); }}
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
            <div className="mt-auto space-y-3 pb-8 pt-4 sm:pb-10">
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

/** The personal account just added, still without its profile of this sector: shown at once, with the step left. */
function NewAccountCard({ email, pic, kind }: { email: string; pic: string | null; kind: ProKind }) {
  const toForm = () => {
    const field = document.querySelector<HTMLInputElement>('[aria-label="Scegli il settore"] input[autocomplete="name"]');
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => field?.focus({ preventScroll: true }), 350);
  };
  return (
    <div className="flex items-center gap-3.5 rounded-3xl bg-brand-turquoise/[0.12] p-4 ring-2 ring-brand-turquoise/60 shadow-[0_0_28px_-8px_oklch(0.72_0.15_190/0.7)]">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/10 ring-2 ring-brand-turquoise/60">
        {pic ? <img src={pic} alt="Immagine dell’account" referrerPolicy="no-referrer" className="size-full object-cover" /> : <UserRound className="size-7 text-foreground/60" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-turquoise">Account aggiunto</p>
        <p className="break-all text-[15px] font-semibold">{email}</p>
        <p className="text-xs text-foreground/70">Ultimo passo: registra qui sotto il suo profilo {kind === "funzionario" ? "della piazza" : "del vigneto"}. Poi lo ritrovi tra i profili.</p>
      </div>
      <button type="button" onClick={toForm} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-white px-4 text-sm font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-brand-turquoise">
        Completa<ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
