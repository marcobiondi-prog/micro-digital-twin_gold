import { saveProId, useProId } from "@/lib/use-pro-id";
import { ProfileIcon } from "@/views/ProfileIcon";
import { proSummary } from "@/models/professional-id";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ComponentType, type FormEvent } from "react";
import { LogOut, UserRound, Mail, LockKeyhole, Camera, ShieldCheck, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { InfoNav, type InfoPath } from "@/views/v10/InfoPage";
import { pushBackGuard } from "@/hooks/use-back-close";
import { PermissionsPage } from "@/views/v10/Permissions";
import { AboutPage, ContactsPage, CookiePage, FaqPage, LicensesPage, PlansPage, PrivacyPage, PrivacyPrefsPage, TermsPage } from "@/views/v10/legal-pages";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getMyAdminStatus } from "@/controllers/admin.functions";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEMO_LOGIN_AVAILABLE, setDemoSignedIn, useDemoSignedIn } from "@/lib/demo-login";
import { OPEN_ACCOUNT_EVENT } from "@/lib/camera-dock";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import seedling from "@/assets/avatar-seedling.svg";
import city from "@/assets/avatar-city.svg";
import sun from "@/assets/avatar-sun.svg";
import vine from "@/assets/avatar-vine.svg";

const suggestions = [
  { id: "seedling", label: "Germoglio", src: seedling },
  { id: "city", label: "Città", src: city },
  { id: "sun", label: "Sole", src: sun },
  { id: "vine", label: "Vigneto", src: vine },
] as const;
type Choice = (typeof suggestions)[number]["id"] | "upload";
type Account = { email: string; guest: boolean; id?: string; googleAvatar?: string } | null;
/** Google's multicolour "G", kept in its brand colours in both themes. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const guestKey = "micro-digital-twin-guest";
const pendingAvatarKey = "micro-digital-twin-pending-avatar";
const bucket = "account-avatars";

// Supabase Auth messages are English and terse; explain the common ones.
function authMessage(error: { code?: string | undefined; message: string }) {
  switch (error.code) {
    case "invalid_credentials": return "Email o password non corretti. Se non hai ancora un account, registrati.";
    case "email_not_confirmed": return "Devi prima confermare l'email: apri il link che ti abbiamo inviato.";
    case "user_already_exists": return "Esiste già un account con questa email. Accedi oppure reimposta la password.";
    case "weak_password": return "Password troppo debole: usa almeno 6 caratteri.";
    case "over_email_send_rate_limit": return "Troppe email inviate. Riprova più tardi.";
    case "email_address_not_authorized": return "Il servizio email non può scrivere a questo indirizzo. L'amministratore deve configurare l'invio email.";
    case "email_address_invalid": return "Indirizzo email non valido.";
    case "signup_disabled": return "Le registrazioni sono disattivate.";
    default: return /sending confirmation email/i.test(error.message) ? "Invio dell'email di conferma non riuscito. L'amministratore deve configurare l'invio email." : error.message;
  }
}


/** The account panel's plans, help, privacy and legal pages, shown inside the panel. */
const PAGES: Record<InfoPath, ComponentType> = {
  "/piani": PlansPage, "/chi-siamo": AboutPage, "/faq": FaqPage, "/contatti": ContactsPage, "/privacy/cookie": CookiePage, "/privacy/informativa": PrivacyPage,
  "/privacy/preferenze": PrivacyPrefsPage, "/privacy/autorizzazioni": PermissionsPage, "/legale/licenze": LicensesPage, "/legale/termini": TermsPage,
};
const LINK_GROUPS: Array<{ title: string; links: Array<[string, InfoPath]> }> = [
  { title: "Piani", links: [["Free e Premium", "/piani"]] },
  { title: "Progetto", links: [["Chi siamo", "/chi-siamo"]] },
  { title: "Aiuto", links: [["Domande frequenti", "/faq"], ["Contatti", "/contatti"]] },
  { title: "Privacy", links: [["Informativa sui cookie", "/privacy/cookie"], ["Informativa sulla privacy", "/privacy/informativa"], ["Preferenze privacy", "/privacy/preferenze"], ["Autorizzazioni", "/privacy/autorizzazioni"]] },
  { title: "Legale", links: [["Licenze", "/legale/licenze"], ["Termini di servizio", "/legale/termini"]] },
];

export function AccountControl() {
  const [open, setOpen] = useState(false);
  const demo = useDemoSignedIn();
  const proId = useProId();
  // The locked AI option of the camera sheet opens this dialog to sign in.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_ACCOUNT_EVENT, show);
    return () => window.removeEventListener(OPEN_ACCOUNT_EVENT, show);
  }, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [account, setAccount] = useState<Account>(null);
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const draftFileRef = useRef<File | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  // Only offer Google when the provider is enabled in Supabase; otherwise it opens a raw error page.
  useEffect(() => {
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { external?: { google?: boolean } } | null) => setGoogleEnabled(Boolean(s?.external?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const saveAvatar = useCallback(async (userId: string, selected: Choice, file?: File | null) => {
    let path: string | null = null;
    if (selected === "upload") {
      if (!file) throw new Error("Scegli un'immagine prima di salvare.");
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      if (error) throw error;
    }
    const { data: previous } = await supabase.from("profiles").select("avatar_path").eq("user_id", userId).maybeSingle();
    const { error } = await supabase.from("profiles").upsert({ user_id: userId, avatar_choice: selected, avatar_path: path });
    if (error) {
      if (path) await supabase.storage.from(bucket).remove([path]);
      throw error;
    }
    if (previous?.avatar_path && previous.avatar_path !== path) {
      await supabase.storage.from(bucket).remove([previous.avatar_path]);
    }
    if (path) {
      const { data, error: urlError } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (urlError) throw urlError;
      setAvatarUrl(data.signedUrl);
    } else setAvatarUrl(null);
    setChoice(selected);
    draftFileRef.current = null;
    setDraftPreview(null);
    sessionStorage.removeItem(pendingAvatarKey);
  }, []);

  const selectAvatar = async (selected: Choice, file?: File) => {
    if (savingAvatar) return;
    setNotice("");
    if (account?.id) {
      setSavingAvatar(true);
      try { await saveAvatar(account.id, selected, file); }
      catch { setNotice("Non è stato possibile salvare l'immagine. Riprova."); }
      finally { setSavingAvatar(false); }
    } else {
      setChoice(selected);
      draftFileRef.current = file ?? null;
      setDraftPreview((old) => { if (old) URL.revokeObjectURL(old); return file ? URL.createObjectURL(file) : null; });
      // Presets survive the email confirmation or Google redirect.
      if (selected !== "upload") sessionStorage.setItem(pendingAvatarKey, selected);
      else sessionStorage.removeItem(pendingAvatarKey);
    }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setNotice("Scegli un'immagine JPG, PNG o WebP fino a 2 MB.");
      return;
    }
    void selectAvatar("upload", file);
  };

  const placePanel = useCallback((element: HTMLDivElement | null) => {
    if (!element || !triggerRef.current || !window.matchMedia("(max-width: 639px)").matches) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const panel = element.getBoundingClientRect();
    element.style.setProperty("--account-x", `${trigger.left + trigger.width / 2 - panel.left}px`);
    element.style.setProperty("--account-y", `${trigger.top + trigger.height / 2 - panel.top}px`);
  }, []);

  useEffect(() => {
    let active = true;
    const loadUser = async (user: { id: string; email?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null) => {
      if (!active) return;
      if (!user) {
        setAccount(sessionStorage.getItem(guestKey) ? { email: "Ospite", guest: true } : null);
        setIsAdmin(false);
        setAvatarUrl(null);
        return;
      }
      sessionStorage.removeItem(guestKey);
      const googleAvatar = typeof user.user_metadata?.['avatar_url'] === "string" ? user.user_metadata['avatar_url'] : typeof user.user_metadata?.['picture'] === "string" ? user.user_metadata['picture'] : undefined;
      setAccount({ id: user.id, email: user.email ?? "Account", guest: false, ...(user.app_metadata?.['provider'] === "google" && googleAvatar ? { googleAvatar } : {}) });
      void getMyAdminStatus().then((r) => { if (active) setIsAdmin(r.isAdmin); }, () => { if (active) setIsAdmin(false); });
      const { data: profile } = await supabase.from("profiles").select("avatar_choice, avatar_path").eq("user_id", user.id).maybeSingle();
      if (!active) return;
      if (profile?.avatar_choice) setChoice(profile.avatar_choice as Choice);
      else setChoice(null);
      if (profile?.avatar_path) {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(profile.avatar_path, 3600);
        if (active) setAvatarUrl(data?.signedUrl ?? null);
      } else setAvatarUrl(null);
      const pending = sessionStorage.getItem(pendingAvatarKey);
      const selected = draftFileRef.current ? "upload" : (pending && suggestions.some((item) => item.id === pending) ? pending as Choice : null);
      if (selected) {
        try { await saveAvatar(user.id, selected, draftFileRef.current); }
        catch { if (active) setNotice("Non è stato possibile salvare l'immagine. Riprova."); }
      }
    };
    void supabase.auth.getUser().then(({ data }) => void loadUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Run database reads outside the auth callback to avoid auth-lock contention.
      setTimeout(() => { if (active) void loadUser(session?.user ?? null); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [saveAvatar]);

  const enterGuest = () => {
    sessionStorage.setItem(guestKey, "1");
    setAccount({ email: "Ospite", guest: true });
    setNotice("");
  };

  const signOut = async () => {
    setPending(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    if (!account?.guest) {
      const { error } = await supabase.auth.signOut();
      if (error) { setNotice(error.message); setPending(false); return; }
    }
    sessionStorage.removeItem(guestKey);
    sessionStorage.removeItem(pendingAvatarKey);
    setAccount(null);
    setChoice(null);
    setAvatarUrl(null);
    draftFileRef.current = null;
    setDraftPreview(null);
    setOpen(false);
    setPending(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setPending(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        setNotice(error ? authMessage(error) : "Se l'indirizzo è registrato, riceverai un link per reimpostare la password.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        // With email confirmation off Supabase signs the user in right away.
        if (error) setNotice(authMessage(error));
        else if (data.session) { setPassword(""); setNotice(""); }
        // An existing confirmed email returns a user without identities instead of an error.
        else if (data.user && data.user.identities?.length === 0) setNotice(authMessage({ code: "user_already_exists", message: "" }));
        else setNotice("Controlla la tua email per confermare l'account prima di accedere.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setNotice(authMessage(error));
        else { setPassword(""); setNotice(""); }
      }
    } catch { setNotice("Impossibile completare l'operazione. Riprova."); }
    finally { setPending(false); }
  };

  const googleSignIn = async () => {
    setPending(true);
    setNotice("");
    try {
      // Remember the current section so the post-login reload stays here.
      sessionStorage.setItem("mdt-auth-return", window.location.pathname + window.location.search);
      const result = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
      if (result.error) setNotice(result.error.message);
    } catch { setNotice("Accesso Google non disponibile. Riprova."); }
    finally { setPending(false); }
  };

  // The pages open inside the panel, which stays open: the arrow, a swipe to the right or the phone's Back return to the list.
  const [page, setPage] = useState<InfoPath | null>(null);
  const openPage = (to: InfoPath) => {
    if (!page) window.history.pushState({ ...(window.history.state ?? {}), __panel: true, __accountPage: true }, "");
    setPage(to);
    document.querySelector(".account-panel")?.scrollTo({ top: 0 });
  };
  const closePage = () => { if (window.history.state?.__accountPage) window.history.back(); else setPage(null); };
  // While a page shows, the Back gesture returns to the list instead of closing the panel.
  useEffect(() => (page ? pushBackGuard(() => { setPage(null); return true; }) : undefined), [page]);
  const changeOpen = (next: boolean) => {
    // Closing with a page open drops its history step too (the panel's own step goes with the panel).
    if (!next && page) { setPage(null); if (window.history.state?.__accountPage) window.history.back(); }
    setOpen(next);
  };
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const premiumPlan = demo || Boolean(account && !account.guest);
  const changeMode = (next: typeof mode) => { setMode(next); setNotice(""); setPassword(""); };

  const displayedAvatar = (choice === "upload" ? draftPreview ?? avatarUrl : suggestions.find((item) => item.id === choice)?.src ?? account?.googleAvatar) ?? undefined;
  const avatar = (size: string) => <Avatar className={`${size} border border-border bg-muted`}><AvatarImage src={displayedAvatar} alt="Immagine account" referrerPolicy="no-referrer" className="object-cover" /><AvatarFallback><UserRound className="size-1/2" aria-hidden="true" /></AvatarFallback></Avatar>;


  return (
    <Dialog open={open} onOpenChange={changeOpen}>
        <Button ref={triggerRef} variant="outline" size="icon" className="size-9 shrink-0 rounded-full sm:size-10" aria-label="Apri account" title="Account" onClick={() => setOpen(true)}>
          {avatar("size-9 sm:size-10")}
        </Button>
      <DialogContent ref={placePanel} overlayClassName="account-overlay" className="account-panel flex max-h-[min(680px,90dvh)] w-[min(420px,calc(100vw-2rem))] flex-col gap-0 overflow-y-auto rounded-lg border bg-popover p-0 text-popover-foreground shadow-xl sm:rounded-lg">
        {page ? (() => {
          const Page = PAGES[page];
          return (
            // A page inside the panel: it slides in, follows a finger dragging it to the right and goes back past 70 px.
            <div className="touch-pan-y px-5 py-5 animate-in fade-in-0 slide-in-from-right-6 duration-200 motion-reduce:animate-none"
              style={{ transform: dragX ? `translateX(${dragX}px)` : undefined, transition: dragX ? "none" : "transform 200ms ease" }}
              onTouchStart={(e) => { const t = e.touches[0]; if (t && e.touches.length === 1) swipe.current = { x: t.clientX, y: t.clientY }; }}
              onTouchMove={(e) => { const t = e.touches[0], s0 = swipe.current; if (!t || !s0) return; const dx = t.clientX - s0.x, dy = t.clientY - s0.y; if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) { swipe.current = null; setDragX(0); return; } if (dx > 0) setDragX(dx); }}
              onTouchEnd={(e) => { const t = e.changedTouches[0], s0 = swipe.current; swipe.current = null; setDragX(0); if (t && s0 && t.clientX - s0.x > 70) closePage(); }}
              onTouchCancel={() => { swipe.current = null; setDragX(0); }}>
              <DialogTitle className="sr-only">Account</DialogTitle>
              <InfoNav.Provider value={{ back: closePage, open: openPage }}><Page /></InfoNav.Provider>
            </div>
          );
        })() : (<>
        <DialogHeader className="border-b px-6 py-5 text-left">
          <div className="mb-2">{avatar("size-10")}</div>
          <DialogTitle className="text-xl">Account</DialogTitle>
          <DialogDescription>{account ? account.email : demo ? "Accesso simulato (solo anteprima)" : "Accedi o continua come ospite."}</DialogDescription>
          {/* The plan in use, at a glance (Premium is free with an account). */}
          <p className="pt-1"><span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${premiumPlan ? "bg-primary text-primary-foreground" : "bg-foreground/[0.08] text-foreground"}`}>Piano {premiumPlan ? "Premium" : "Free"}</span></p>
        </DialogHeader>
        <div className="space-y-6 px-6 py-6">
          {/* The professional profile first: the bottom bar's profile badge opens this panel. Who is identified (one at a time), and the identification pages that open each simulation. */}
          <section aria-label="Profilo professionale" className="rounded-3xl bg-foreground/[0.05] px-5 py-3">
            <h3 className="py-2 text-base font-semibold">Profilo professionale</h3>
            {proId ? (
              <div className="flex items-start gap-3 pb-2">
                <ProfileIcon kind={proId.kind} className="mt-0.5 size-7 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{proId.name}</p>
                  <p className="text-sm text-muted-foreground">{proSummary(proId)}</p>
                  <button type="button" onClick={() => void saveProId(null)} className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><LogOut className="size-4" aria-hidden="true" />Esci dal profilo</button>
                </div>
              </div>
            ) : <p className="pb-2 text-sm text-muted-foreground">Nessun profilo: piazza e vigneto sono bloccati.</p>}
            {/* Identified, the card shows only that profile: the ways to identify appear when there is none. */}
            {!proId && <ul>
              {([["Agronomo · apre il vigneto", "/identificazione/agronomo"], ["Funzionario comunale · apre la piazza", "/identificazione/funzionario"]] as const).map(([label, to]) => (
                <li key={to}>
                  <Link to={to} onClick={() => setOpen(false)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl text-left text-[15px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="min-w-0 flex-1">{label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>}
          </section>
          {mode !== "reset" && <section className="space-y-3" aria-label="Immagine account">
            <div className="flex items-center gap-3">
              {avatar("size-14")}
              <div><h3 className="text-sm font-semibold">Immagine account</h3><p className="text-xs text-muted-foreground">{account?.id ? "Scegli un'immagine per il tuo account" : "Scegli un'immagine da usare quando accedi"}</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {suggestions.map((item) => <Button key={item.id} type="button" variant="ghost" size="icon" disabled={savingAvatar} aria-label={`Scegli ${item.label}`} aria-pressed={choice === item.id} title={item.label} className={`size-12 shrink-0 rounded-full p-0.5 ${choice === item.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`} onClick={() => void selectAvatar(item.id)}><img src={item.src} alt="" className="size-full rounded-full" /></Button>)}
              <Button type="button" variant="outline" size="icon" disabled={savingAvatar} aria-label="Carica immagine account" title="Carica immagine" className="size-12 shrink-0 rounded-full" onClick={() => fileRef.current?.click()}><Camera className="size-5" /></Button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Seleziona immagine account" onChange={chooseFile} />
            </div>
          </section>}
          {demo && !account ? (
            <section className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-4">
                <p className="text-sm font-semibold">Accesso simulato</p>
                <p className="mt-1 text-xs text-muted-foreground">Solo nelle anteprime: mostra le funzioni riservate a chi accede, come la fotocamera AI. Non è un account e le analisi AI richiedono un accesso vero.</p>
              </div>
              <Button variant="ghost" className="w-full justify-start" onClick={() => { setDemoSignedIn(false); setOpen(false); }}><LogOut />Esci dalla simulazione</Button>
            </section>
          ) : account ? (
            <section className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-4">
                <p className="text-sm font-semibold">{account.guest ? "Sessione ospite" : account.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{account.guest ? "Accesso di base su questo dispositivo. Non è un account e non salva dati online." : "Accesso effettuato"}</p>
              </div>
              {account.guest && <Button variant="outline" className="w-full" onClick={() => { sessionStorage.removeItem(guestKey); setAccount(null); changeMode("signup"); }}>Crea un account</Button>}
              {account && notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
              {isAdmin && <Button asChild variant="outline" className="w-full justify-start"><Link to="/admin" onClick={() => setOpen(false)}><ShieldCheck />Pannello di controllo</Link></Button>}
              <Button variant="ghost" className="w-full justify-start" disabled={pending} onClick={() => void signOut()}><LogOut />Esci</Button>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex gap-1 border-b" aria-label="Modalità account">
                <Button variant="ghost" className={`rounded-none border-b-2 px-3 ${mode === "signin" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`} onClick={() => changeMode("signin")}>Accedi</Button>
                <Button variant="ghost" className={`rounded-none border-b-2 px-3 ${mode === "signup" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`} onClick={() => changeMode("signup")}>Registrati</Button>
              </div>
              {mode === "reset" && <p className="text-sm font-medium">Reimposta la password</p>}
              <form className="space-y-4" onSubmit={(event) => void submit(event)}>
                <div className="space-y-1.5"><Label htmlFor="account-email">Email</Label><div className="relative"><Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="pl-9" /></div></div>
                {mode !== "reset" && <div className="space-y-1.5"><Label htmlFor="account-password">Password</Label><div className="relative"><LockKeyhole className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input id="account-password" type="password" minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} required value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" /></div></div>}
                {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
                <Button type="submit" className="w-full" disabled={pending}>{pending ? "Attendi…" : mode === "reset" ? "Invia link" : mode === "signup" ? "Crea account" : "Accedi"}</Button>
              </form>
              {mode === "signin" && <Button variant="link" className="h-auto px-0" onClick={() => changeMode("reset")}>Password dimenticata?</Button>}
              {mode === "reset" && <Button variant="link" className="h-auto px-0" onClick={() => changeMode("signin")}>Torna all'accesso</Button>}
              {mode !== "reset" && googleEnabled && <><div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />oppure<span className="h-px flex-1 bg-border" /></div><Button variant="outline" className="w-full" disabled={pending} onClick={() => void googleSignIn()}><GoogleLogo />{mode === "signup" ? "Registrati con Google" : "Accedi con Google"}</Button></>}
              <Button variant="ghost" className="w-full" onClick={enterGuest}>Continua come ospite</Button>
              {DEMO_LOGIN_AVAILABLE && <Button variant="outline" className="w-full border-dashed" onClick={() => { setDemoSignedIn(true); setOpen(false); }}>Simula l’accesso (solo anteprima)</Button>}
            </section>
          )}
          {/* Help, privacy and legal, as grouped rows; each opens its own page. */}
          <nav aria-label="Aiuto e informazioni" className="space-y-3 border-t pt-6">
            {LINK_GROUPS.map((g) => (
              <section key={g.title} className="rounded-3xl bg-foreground/[0.05] px-5 py-3">
                <h3 className="py-2 text-base font-semibold">{g.title}</h3>
                <ul>
                  {g.links.map(([label, to]) => (
                    <li key={to}>
                      <button type="button" onClick={() => openPage(to)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl text-left text-[15px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="min-w-0 flex-1">{label}</span>
                        {to === "/piani" && <span className="shrink-0 text-sm text-muted-foreground">Il tuo: {premiumPlan ? "Premium" : "Free"}</span>}
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
          {/* Twin closes the panel: still (no animation, no name), smiling. */}
          <TwinStill className="mx-auto block h-16 w-auto" />
        </div>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

/** Twin drawn still, with smiling eyes: the account panel's sign-off (no animation, no name). */
function TwinStill({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 452" className={className} role="img" aria-label="Twin">
      <path d="M258 125 L262 72" stroke="#3aa99f" strokeWidth="9" strokeLinecap="round" />
      <circle cx="258" cy="48" r="19" fill="#f4fbf6" stroke="#b9dcc8" strokeWidth="8" />
      <rect x="38" y="252" width="56" height="118" rx="28" fill="#3aa99f" transform="rotate(28 66 311)" />
      <rect x="418" y="252" width="56" height="118" rx="28" fill="#3aa99f" transform="rotate(-28 446 311)" />
      <ellipse cx="256" cy="300" rx="160" ry="110" fill="#3aa99f" />
      <ellipse cx="256" cy="268" rx="162" ry="148" fill="#4cc9bd" />
      <rect x="143" y="176" width="228" height="140" rx="58" fill="#0f2326" stroke="#2c3e44" strokeWidth="6" />
      {/* Smiling eyes, as on the header mascot. */}
      <path d="M192 234 Q215 198 240 234 Q215 220 192 234 Z" fill="#fff" />
      <path d="M272 234 Q297 198 320 234 Q297 220 272 234 Z" fill="#fff" />
      <ellipse cx="255" cy="288" rx="24" ry="14" fill="#f2806f" />
      <ellipse cx="150" cy="343" rx="22" ry="13" fill="#f2a0a6" opacity=".9" />
      <ellipse cx="362" cy="343" rx="22" ry="13" fill="#f2a0a6" opacity=".9" />
    </svg>
  );
}
