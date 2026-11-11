import { keepProIdInAccount, openSectorGate, saveProId, useProId } from "@/lib/use-pro-id";
import { DeviceCacheCard } from "@/views/v10/DeviceCache";
import { AccountDevices } from "@/views/v10/AccountDevices";
import { biometricOn } from "@/lib/biometric";
import { BiometricSignIn, leaveProfile, ProfileBioSwitch, proBioKey } from "@/views/v10/Biometric";
import { getKnownProIds } from "@/lib/use-pro-id";
import { googleOAuth, leaveAccount } from "@/lib/account-sessions";
import { keepLink, keptLink, LINK_TTL_S } from "@/lib/signed-links";
import { dropProIdOnDevice } from "@/lib/use-pro-id";
import { exitToGate } from "@/lib/exit-to-gate";
import { getMedia, removeMedia, useLabMedia } from "@/models/lab-media-store";
import { CLOUD_QUOTA, bytesText, usageTone, useCloudUsage } from "@/lib/use-cloud-usage";
import { ProfileIcon } from "@/views/ProfileIcon";
import { proSummary } from "@/models/professional-id";
import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ChangeEvent, type ComponentType, type FormEvent } from "react";
import { LogOut, UserRound, Mail, LockKeyhole, Camera, ShieldCheck, ChevronRight, LoaderCircle, Trash2, RefreshCw } from "lucide-react";
import { useUpdateProgress } from "@/lib/update-progress";
import { buildLabel, checkForUpdate } from "@/lib/app-version";
import { Link } from "@tanstack/react-router";
import { InfoNav, InfoPage, type InfoPath } from "@/views/v10/InfoPage";
import { useSignedIn, getRegisteredEmail, setRegisteredEmail, notifyAuthChange } from "@/lib/use-signed-in";
import { pushBackGuard } from "@/hooks/use-back-close";
import { PermissionsPage } from "@/views/v10/Permissions";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getMyAdminStatus } from "@/controllers/admin.functions";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEMO_LOGIN_AVAILABLE, setDemoSignedIn, useDemoSignedIn } from "@/lib/demo-login";
import { OPEN_ACCOUNT_EVENT } from "@/lib/camera-dock";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { setAccountAvatar } from "@/lib/account-avatar";
import { syncKnownAccounts } from "@/lib/use-pro-id";
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
    case "email_not_confirmed": return "Devi prima confermare l’email: apri il link che ti abbiamo inviato.";
    case "user_already_exists": return "Esiste già un account con questa email. Accedi oppure reimposta la password.";
    case "weak_password": return "Password troppo debole: usa almeno 6 caratteri.";
    case "over_email_send_rate_limit": return "Troppe email inviate. Riprova più tardi.";
    case "email_address_not_authorized": return "Il servizio email non può scrivere a questo indirizzo. L’amministratore deve configurare l’invio email.";
    case "email_address_invalid": return "Indirizzo email non valido.";
    case "signup_disabled": return "Le registrazioni sono disattivate.";
    default: return /sending confirmation email/i.test(error.message) ? "Invio dell’email di conferma non riuscito. L’amministratore deve configurare l’invio email." : error.message;
  }
}


/** The account panel's plans, help, privacy and legal pages, shown inside the panel; their code is loaded only when
 * one is opened (it was part of every page's first load). */
const legal = (name: "AboutPage" | "ContactsPage" | "CookiePage" | "FaqPage" | "LicensesPage" | "PlansPage" | "PrivacyPage" | "PrivacyPrefsPage" | "TermsPage") =>
  lazy(() => import("@/views/v10/legal-pages").then((m) => ({ default: m[name] })));
const PlansPage = legal("PlansPage"), AboutPage = legal("AboutPage"), FaqPage = legal("FaqPage"), ContactsPage = legal("ContactsPage"),
  CookiePage = legal("CookiePage"), PrivacyPage = legal("PrivacyPage"), PrivacyPrefsPage = legal("PrivacyPrefsPage"),
  LicensesPage = legal("LicensesPage"), TermsPage = legal("TermsPage");
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

/** The panel's "Piani e informazioni" page: the grouped rows, each opening its own page (back returns here). */
function InfoMenu() {
  const nav = useContext(InfoNav);
  const { signedIn, demo } = useSignedIn();
  const premium = signedIn || demo;
  return (
    <InfoPage title="Piani e informazioni">
      <nav aria-label="Piani e informazioni" className="space-y-3">
        {LINK_GROUPS.map((g) => (
          <section key={g.title} className="rounded-3xl bg-foreground/[0.05] px-5 py-3">
            <h3 className="py-2 text-base font-semibold">{g.title}</h3>
            <ul>
              {g.links.map(([label, to]) => (
                <li key={to}>
                  <button type="button" onClick={() => nav?.open(to)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl text-left text-[15px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="min-w-0 flex-1">{label}</span>
                    {to === "/piani" && <span className="shrink-0 text-sm text-muted-foreground">Il tuo: {premium ? "Premium" : "Free"}</span>}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </InfoPage>
  );
}

/** The ring round the account picture: a faint track and the share of the 50 GB in use (always a sliver once something is stored). */
function StorageRing({ share }: { share: number }) {
  const r = 22, c = 2 * Math.PI * r;
  const shown = share > 0 ? Math.max(share, 0.03) : 0;
  return (
    <svg viewBox="0 0 48 48" className="pointer-events-none absolute -inset-[4px] size-[calc(100%+8px)] -rotate-90" aria-hidden="true">
      <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
      {shown > 0 && <circle cx="24" cy="24" r={r} fill="none" stroke={usageTone(share)} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${shown * c} ${c}`} className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none" />}
    </svg>
  );
}

/** In the account panel: the cloud space as a bar, how much is used of 50 GB and how much is left. */
function StorageBar({ used, share, google = 0 }: { used: number; share: number; files: number; google?: number }) {
  const pct = share * 100;
  // The profile's project only: the piazza for the municipal officer, the vineyard for the agronomist; both without one.
  const proId = useProId();
  const kinds: Array<"urban" | "vineyard"> = proId ? [proId.kind === "funzionario" ? "urban" : "vineyard"] : ["urban", "vineyard"];
  const ofWhat = proId ? (proId.kind === "funzionario" ? "della piazza" : "del vigneto") : "della piazza e del vigneto";
  const urban = useLabMedia("urban"), vineyard = useLabMedia("vineyard");
  const mine = kinds.flatMap((k) => (k === "urban" ? urban : vineyard)).filter((m) => m.path);
  const files = mine.length;
  const mineBytes = mine.reduce((t, m) => t + (m.size || 0), 0);
  // "Svuota": every photo and video of the account deleted from the cloud, after one confirm in place (toasts sit under the panel).
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const empty = async () => {
    setBusy(true);
    try {
      for (const k of kinds) {
        const inCloud = getMedia(k).filter((m) => m.path);
        if (inCloud.length) await removeMedia(k, inCloud);
      }
      setMsg(`Spazio liberato: ${files === 1 ? "1 file eliminato" : `${files} file eliminati`} ${ofWhat} dal cloud.`);
    } catch {
      setMsg("Non sono riuscito a svuotare tutto: controlla la connessione e riprova.");
    }
    setBusy(false);
    setAsk(false);
  };
  return (
    <div className="rounded-md border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Spazio nel cloud</p>
          <p className="text-xs tabular-nums text-muted-foreground">{bytesText(used)} di 50 GB</p>
        </div>
        <button type="button" onClick={() => { setAsk(true); setMsg(null); }} disabled={files === 0 || busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold text-danger outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
          <Trash2 className="size-3.5" aria-hidden="true" />Svuota
        </button>
      </div>
      <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-label="Spazio nel cloud usato" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={`${bytesText(used)} di 50 GB`}>
        <div className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${used > 0 ? Math.max(pct, 1.5) : 0}%`, background: usageTone(share) }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {files === 1 ? "1 foto o video" : `${files} foto e video`} {ofWhat} nel tuo account · liberi {bytesText(Math.max(0, CLOUD_QUOTA - used))}
      </p>
      {google > 0 && <p className="mt-0.5 text-xs text-muted-foreground">Comprende {bytesText(google)} già usati nel tuo account Google (posta, file e foto).</p>}
      {share >= 0.95 && (
        <p className="mt-1.5 text-xs font-semibold" style={{ color: usageTone(share) }} role="status">
          {CLOUD_QUOTA - used < 50 * 1024 ** 2 ? "Spazio esaurito: i nuovi file restano sul telefono finché non elimini qualche foto o video." : "Quasi pieno: oltre i 50 GB i nuovi file restano sul telefono."}
        </p>
      )}
      {ask && (
        <div role="alertdialog" aria-label={`Svuotare lo spazio ${ofWhat}?`} className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="font-semibold">Svuotare lo spazio {ofWhat}?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Elimino dal tuo account {files === 1 ? "1 foto o video" : `tutte le ${files} foto e video`} {ofWhat} ({bytesText(mineBytes)}), anche quelli archiviati. Non si possono recuperare.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsk(false)} disabled={busy} className="h-10 flex-1 rounded-full bg-foreground/[0.08] text-sm font-semibold">Annulla</button>
            <button type="button" onClick={() => void empty()} disabled={busy} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-danger text-sm font-semibold text-white disabled:opacity-70">
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}Svuota
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs font-medium" role="status">{msg}</p>}
    </div>
  );
}

export function AccountControl() {
  const [open, setOpen] = useState(false);
  const demo = useDemoSignedIn();
  const proId = useProId();
  // The locked AI option of the camera sheet opens this dialog to sign in.
  useEffect(() => {
    // An email or mode given with the request is set in the form.
    const show = (e: Event) => {
      const detail = (e as CustomEvent<{ email?: string; mode?: "signin" | "signup" | "reset" } | undefined>).detail;
      const em = detail?.email;
      if (em) { setEmail(em); }
      setMode(detail?.mode ?? "signin");
      setOpen(true);
    };
    const close = () => setOpen(false);
    window.addEventListener(OPEN_ACCOUNT_EVENT, show);
    window.addEventListener("mdt-close-account", close);
    return () => {
      window.removeEventListener(OPEN_ACCOUNT_EVENT, show);
      window.removeEventListener("mdt-close-account", close);
    };
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
  // "Accedi con Google" is always offered; it hides only when Supabase says plainly that Google is switched off (a
  // settings read that failed or was slow used to hide it, so the button vanished from the panel).
  const [googleEnabled, setGoogleEnabled] = useState(true);
  useEffect(() => {
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { external?: { google?: boolean } } | null) => { if (s?.external && s.external.google === false) setGoogleEnabled(false); })
      .catch(() => undefined);
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const saveAvatar = useCallback(async (userId: string, selected: Choice, file?: File | null) => {
    let path: string | null = null;
    if (selected === "upload") {
      if (!file) throw new Error("Scegli un’immagine prima di salvare.");
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
      const { data, error: urlError } = await supabase.storage.from(bucket).createSignedUrl(path, LINK_TTL_S);
      if (urlError) throw urlError;
      keepLink(bucket, path, data.signedUrl);
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
      catch { setNotice("Non è stato possibile salvare l’immagine. Riprova."); }
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
      setNotice("Scegli un’immagine JPG, PNG o WebP fino a 2 MB.");
      return;
    }
    void selectAvatar("upload", file);
  };

  // Where the last tap landed, for the panel opened by a button elsewhere on the page.
  const lastTap = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const note = (e: PointerEvent) => { lastTap.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointerdown", note, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", note, { capture: true });
  }, []);
  const placePanel = useCallback((element: HTMLDivElement | null) => {
    if (!element || !triggerRef.current || !window.matchMedia("(max-width: 639px)").matches) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const panel = element.getBoundingClientRect();
    // The sheet unfolds from the account button; opened from further down the page (the dashboard's "Accedi per
    // sbloccare", a locked tool), the button has scrolled out of sight and a circle grown from there never covered the
    // screen — the panel stayed invisible behind its dark veil. Then it unfolds from the tap that opened it.
    const onScreen = trigger.bottom > 0 && trigger.top < window.innerHeight;
    const at = onScreen ? { x: trigger.left + trigger.width / 2, y: trigger.top + trigger.height / 2 } : lastTap.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    element.style.setProperty("--account-x", `${at.x - panel.left}px`);
    element.style.setProperty("--account-y", `${at.y - panel.top}px`);
  }, []);

  useEffect(() => {
    let active = true;
    const loadUser = async (user: { id: string; email?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null) => {
      if (!active) return;
      if (!user) {
        const regEmail = getRegisteredEmail();
        if (regEmail) {
          sessionStorage.removeItem(guestKey);
          setAccount({ id: "local-" + regEmail, email: regEmail, guest: false });
          setIsAdmin(false);
          setAvatarUrl(null);
          return;
        }
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
        // The same link for days (kept on the device), so the picture comes from the browser's cache, not downloaded again.
        const kept = keptLink(bucket, profile.avatar_path);
        const url = kept ?? (await supabase.storage.from(bucket).createSignedUrl(profile.avatar_path, LINK_TTL_S)).data?.signedUrl ?? null;
        if (url && !kept) keepLink(bucket, profile.avatar_path, url);
        if (active) setAvatarUrl(url);
      } else setAvatarUrl(null);
      const pending = sessionStorage.getItem(pendingAvatarKey);
      const selected = draftFileRef.current ? "upload" : (pending && suggestions.some((item) => item.id === pending) ? pending as Choice : null);
      if (selected) {
        try { await saveAvatar(user.id, selected, draftFileRef.current); }
        catch { if (active) setNotice("Non è stato possibile salvare l’immagine. Riprova."); }
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
    setAccount(null);
    setMode("signin");
    setEmail("");
    setPassword("");
    setChoice(null);
    setAvatarUrl(null);
    draftFileRef.current = null;
    setDraftPreview(null);
    setOpen(false);
    setPending(false);
    await exitToGate();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setPending(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        setNotice(error ? authMessage(error) : "Se l’indirizzo è registrato, riceverai un link per reimpostare la password.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) {
          setNotice(authMessage(error));
        } else if (data.session) {
          setRegisteredEmail(data.session.user.email ?? email);
          setPassword("");
          setNotice("");
          setOpen(false);
          notifyAuthChange();
          toast.success("Account registrato", { description: "Piano Premium attivato." });
        } else if (data.user && data.user.identities?.length === 0) {
          setNotice("Questo indirizzo è già registrato. Clicca su 'Accedi' per entrare.");
        } else {
          setNotice("Controlla la tua email per confermare l’account prima di accedere.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setNotice(authMessage(error));
        } else {
          if (data?.session?.user?.email) setRegisteredEmail(data.session.user.email);
          setPassword("");
          setNotice("");
          setOpen(false);
          notifyAuthChange();
          toast.success("Accesso eseguito", { description: `Benvenuto ${data?.session?.user?.email ?? email}` });
        }
      }
    } catch {
      setNotice("Impossibile completare l’operazione. Controlla la connessione e riprova.");
    } finally {
      setPending(false);
    }
  };

  const googleSignIn = async () => {
    setPending(true);
    setNotice("");
    try {
      // Remember the current section so the post-login reload stays here.
      localStorage.setItem("mdt-auth-return", window.location.pathname + window.location.search);
      const result = await googleOAuth(window.location.origin + window.location.pathname);
      if (result.error) setNotice(result.error.message);
    } catch { setNotice("Accesso Google non disponibile. Riprova."); }
    finally { setPending(false); }
  };

  // The pages open inside the panel, which stays open: the arrow, a swipe to the right or the phone's Back return to the list.
  // "menu" is the page listing Piani, Progetto, Aiuto, Privacy and Legale; a page opened from it goes back to it.
  const [page, setPage] = useState<InfoPath | "menu" | null>(null);
  const fromMenu = useRef(false);
  const openPage = (to: InfoPath | "menu") => {
    if (!page) window.history.pushState({ ...(window.history.state ?? {}), __panel: true, __accountPage: true }, "");
    fromMenu.current = page === "menu" && to !== "menu" ? true : to === "menu" ? false : fromMenu.current;
    setPage(to);
    document.querySelector(".account-panel")?.scrollTo({ top: 0 });
  };
  const closePage = () => {
    if (page !== "menu" && fromMenu.current) { fromMenu.current = false; setPage("menu"); return; }
    if (window.history.state?.__accountPage) window.history.back(); else setPage(null);
  };
  // While a page shows, the Back gesture returns to the menu or the list instead of closing the panel.
  useEffect(() => (page ? pushBackGuard(() => { if (page !== "menu" && fromMenu.current) { fromMenu.current = false; setPage("menu"); } else setPage(null); return true; }) : undefined), [page]);
  const changeOpen = (next: boolean) => {
    // Closing with a page open drops its history step too (the panel's own step goes with the panel).
    if (!next && page) { setPage(null); if (window.history.state?.__accountPage) window.history.back(); }
    setOpen(next);
  };
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const premiumPlan = demo || Boolean(account && !account.guest) || Boolean(getRegisteredEmail());
  // A real account has cloud space for its photos and videos: 50 GB, shown round the picture and as a bar in the panel.
  const cloudAccount = Boolean(account && !account.guest) || Boolean(getRegisteredEmail());
  const usage = useCloudUsage(cloudAccount);
  const changeMode = (next: typeof mode) => { setMode(next); setNotice(""); setPassword(""); };

  const displayedAvatar = (choice === "upload" ? draftPreview ?? avatarUrl : suggestions.find((item) => item.id === choice)?.src ?? account?.googleAvatar) ?? undefined;
  const signedAvatar = account && !account.guest ? displayedAvatar ?? null : null;
  useEffect(() => {
    setAccountAvatar(signedAvatar);
    // The profiles on this phone that are this account's get its picture and email ("Ti abbiamo riconosciuto").
    if (cloudAccount) void syncKnownAccounts();
  }, [signedAvatar, cloudAccount]);
  const avatar = (size: string) => <Avatar className={`${size} border border-border bg-muted`}><AvatarImage src={displayedAvatar} alt="Immagine account" referrerPolicy="no-referrer" className="object-cover" /><AvatarFallback><UserRound className="size-1/2" aria-hidden="true" /></AvatarFallback></Avatar>;


  return (
    <Dialog open={open} onOpenChange={changeOpen}>
        <span className="relative inline-grid shrink-0 place-items-center">
          <Button ref={triggerRef} variant="outline" size="icon" className="size-9 shrink-0 rounded-full sm:size-10" aria-label={cloudAccount ? `Apri account · spazio nel cloud ${bytesText(usage.used)} di 50 GB` : "Apri account"} title="Account" onClick={() => setOpen(true)}>
            {avatar("size-9 sm:size-10")}
          </Button>
          {/* Signed in, a ring round the picture fills with the cloud space in use, out of 50 GB. */}
          {cloudAccount && <StorageRing share={usage.share} />}
        </span>
      <DialogContent ref={placePanel} overlayClassName="account-overlay" className="account-panel flex max-h-[min(680px,90dvh)] w-[min(420px,calc(100vw-2rem))] flex-col gap-0 overflow-y-auto rounded-lg border bg-popover p-0 text-popover-foreground shadow-xl sm:rounded-lg">
        {page ? (() => {
          const Page = page === "menu" ? InfoMenu : PAGES[page];
          return (
            // A page inside the panel: it slides in, follows a finger dragging it to the right and goes back past 70 px.
            <div className="touch-pan-y px-5 py-5 animate-in fade-in-0 slide-in-from-right-6 duration-200 motion-reduce:animate-none"
              style={{ transform: dragX ? `translateX(${dragX}px)` : undefined, transition: dragX ? "none" : "transform 200ms ease" }}
              onTouchStart={(e) => { const t = e.touches[0]; if (t && e.touches.length === 1) swipe.current = { x: t.clientX, y: t.clientY }; }}
              onTouchMove={(e) => { const t = e.touches[0], s0 = swipe.current; if (!t || !s0) return; const dx = t.clientX - s0.x, dy = t.clientY - s0.y; if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) { swipe.current = null; setDragX(0); return; } if (dx > 0) setDragX(dx); }}
              onTouchEnd={(e) => { const t = e.changedTouches[0], s0 = swipe.current; swipe.current = null; setDragX(0); if (t && s0 && t.clientX - s0.x > 70) closePage(); }}
              onTouchCancel={() => { swipe.current = null; setDragX(0); }}>
              <DialogTitle className="sr-only">Account</DialogTitle>
              <InfoNav.Provider value={{ back: closePage, open: openPage }}><Suspense fallback={<div className="flex justify-center py-10"><LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Carico" /></div>}><Page /></Suspense></InfoNav.Provider>
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
                  <button type="button" onClick={() => { setOpen(false); void leaveProfile(); }} className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><LogOut className="size-4" aria-hidden="true" />Esci dal profilo</button>
                </div>
              </div>
            ) : <p className="pb-2 text-sm text-muted-foreground">Nessun profilo: piazza e vigneto sono bloccati.</p>}
            {proId && <ProfileBioSwitch id={proId} />}
            {/* Identified, the card shows only that profile: the ways to identify appear when there is none. */}
            {!proId && <ul>
              {/* Straight to that profile's registration form (the sector page, over everything), past the profile page. */}
              {([["Agricoltore · apre il vigneto", "agronomo"], ["Funzionario comunale · apre la piazza", "funzionario"]] as const).map(([label, kind]) => (
                <li key={kind}>
                  <button type="button" onClick={() => { setOpen(false); openSectorGate(kind); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl text-left text-[15px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="min-w-0 flex-1">{label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>}
          </section>
          {mode !== "reset" && <section className="space-y-3" aria-label="Immagine account">
            <div className="flex items-center gap-3">
              {avatar("size-14")}
              <div><h3 className="text-sm font-semibold">Immagine account</h3><p className="text-xs text-muted-foreground">{account?.id ? "Scegli un’immagine per il tuo account" : "Scegli un’immagine da usare quando accedi"}</p></div>
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
              {cloudAccount && <StorageBar used={usage.used} share={usage.share} files={usage.files} google={usage.google} />}
              {cloudAccount && <AccountDevices />}
              <DeviceCacheCard />
              {account.guest && <Button variant="outline" className="w-full" onClick={() => { sessionStorage.removeItem(guestKey); setAccount(null); changeMode("signup"); }}>Crea un account</Button>}
              {account && notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
              {isAdmin && <Button asChild variant="outline" className="w-full justify-start"><Link to="/admin" onClick={() => setOpen(false)}><ShieldCheck />Pannello di controllo</Link></Button>}
              <Button variant="ghost" className="w-full justify-start" disabled={pending} onClick={() => void signOut()}><LogOut />Esci</Button>
            </section>
          ) : (
            <section className="space-y-4">
              <BiometricSignIn onDone={() => setOpen(false)} />
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
              {mode === "reset" && <Button variant="link" className="h-auto px-0" onClick={() => changeMode("signin")}>Torna all’accesso</Button>}
              {mode !== "reset" && googleEnabled && <><div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />oppure<span className="h-px flex-1 bg-border" /></div><Button variant="outline" className="w-full" disabled={pending} onClick={() => void googleSignIn()}><GoogleLogo />{mode === "signup" ? "Registrati con Google" : "Accedi con Google"}</Button></>}
              {/* Kept apart from the sign-in buttons, so the two labels never read as one. */}
              {" "}
              <div className="border-t pt-4"><Button variant="ghost" className="w-full" onClick={enterGuest}>Continua come ospite</Button></div>
              {DEMO_LOGIN_AVAILABLE && <Button variant="outline" className="w-full border-dashed" onClick={() => { setDemoSignedIn(true); setOpen(false); }}>Simula l’accesso (solo anteprima)</Button>}
            </section>
          )}
          {/* Plans, project, help, privacy and legal live on their own page in the panel: one row here opens it. */}
          <div className="border-t pt-6">
            <button type="button" onClick={() => openPage("menu")} className="flex w-full items-center gap-3 rounded-3xl bg-foreground/[0.05] px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="min-w-0 flex-1"><span className="block text-base font-semibold">Piani e informazioni</span><span className="block text-sm text-muted-foreground">Piano {premiumPlan ? "Premium" : "Free"} · Chi siamo · Aiuto · Privacy · Legale</span></span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <AppVersion />
          {/* Twin closes the panel: still (no animation, no name), smiling. */}
          <TwinStill className="mx-auto block h-16 w-auto" />
        </div>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

/** Which version is running (its build date) and a button to look for a newer one now. */
function AppVersion() {
  const install = useUpdateProgress();
  const [state, setState] = useState<"idle" | "checking" | "latest" | "updated" | "offline">("idle");
  // The arrows turn while it looks, at least one full second, so a quick answer still shows the search happened.
  const check = async () => {
    setState("checking");
    const [result] = await Promise.all([checkForUpdate(), new Promise((r) => window.setTimeout(r, 1000))]);
    setState(result);
  };
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl bg-foreground/[0.05] p-3 text-center">
      <p className="text-sm text-muted-foreground">Versione dell’app · <span className="tabular-nums text-foreground">{buildLabel()}</span></p>
      <button type="button" onClick={() => void check()} disabled={state === "checking" || state === "updated"}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground/10 px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
        <RefreshCw className={`size-4 ${state === "checking" || state === "updated" ? "animate-spin" : ""}`} aria-hidden="true" />
        {install.phase === "installing" ? `Installo… ${install.pct} %` : install.phase === "applying" ? `Carico la nuova versione… ${install.pct} %` : state === "checking" ? "Cerco…" : state === "updated" ? "Aggiorno…" : "Cerca aggiornamenti"}
      </button>
      {/* One line of fixed height for the answer or, while updating, a thin bar in its place: nothing grows, so Twin
          below never moves nor gets squeezed. */}
      <div className="flex h-4 w-full items-center justify-center">
        {install.phase !== "idle"
          ? <UpdateBar pct={install.pct} searching={install.phase === "checking"} />
          : <p role="status" className="text-xs leading-4 text-muted-foreground">{state === "latest" ? "Hai già l’ultima versione." : state === "offline" ? "Senza rete: riprova quando sei connesso." : ""}</p>}
      </div>
    </div>
  );
}

/** The installation of a new version as a thin bar with its percentage. */
function UpdateBar({ pct, searching = false }: { pct: number; searching?: boolean }) {
  return (
    <div role="progressbar" aria-label="Installazione della nuova versione" aria-valuemin={0} aria-valuemax={100} aria-valuenow={searching ? undefined : pct} className="h-[3px] w-full max-w-60 overflow-hidden rounded-full bg-foreground/10">
      <div className={`h-full rounded-full bg-[var(--brand-turquoise)] transition-[width] duration-300 motion-reduce:transition-none ${searching ? "w-1/4 animate-pulse" : ""}`} style={searching ? undefined : { width: `${pct}%` }} />
    </div>
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
