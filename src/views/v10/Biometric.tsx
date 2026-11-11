import { goInApp } from "@/lib/app-nav";
import { useEffect, useState } from "react";
import { Fingerprint, ScanFace, UserRound } from "lucide-react";
import { toast } from "sonner";
import { biometricAvailable, biometricName, markUnlocked, biometricOn, disableBiometric, enableBiometric, useBiometricAccounts, useBiometricOn, verifyBiometric } from "@/lib/biometric";
import { hasAccountSession, leaveAccount, signInAs, switchToAccount } from "@/lib/account-sessions";
import { supabase } from "@/integrations/supabase/client";
import { type ProId } from "@/models/professional-id";
import { setRegisteredEmail, notifyAuthChange } from "@/lib/use-signed-in";
import { clearSectorGate, dropProIdOnDevice, getKnownProIds, getProId, getSectorGateKind, keepProIdInAccount, openSectorGate, type KnownProId, rememberWantedSector, saveProId, sectorOf, setProIdOnDevice, useKnownProIds } from "@/lib/use-pro-id";
import { openSimTab } from "@/views/v8/console";
import { exitToGate } from "@/lib/exit-to-gate";

/**
 * Face ID / fingerprint on each professional profile: turned on for a profile, taking it up again on this phone
 * ("Continua come …" in "Ti abbiamo riconosciuto") first asks the phone's recognition. Keyed by the profile's
 * registration time, so a renamed profile keeps it.
 */
export const proBioKey = (id: Pick<ProId, "kind" | "at">) => `pro:${id.kind}:${id.at}`;

const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
export const BioIcon = ({ className }: { className?: string }) => (isApple() ? <ScanFace className={className} aria-hidden="true" /> : <Fingerprint className={className} aria-hidden="true" />);

export function useBiometricAvailable() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { void biometricAvailable().then(setOk); }, []);
  return ok;
}

/** Asks the recognition for a profile that has it on; true when there is none or the person is recognised. */
export async function checkProfileBiometric(id: ProId): Promise<boolean> {
  const r = await verifyBiometric(proBioKey(id));
  if (!r.ok) toast.error("Non ti ho riconosciuto", { description: `Per continuare come ${id.name} serve il riconoscimento del telefono. Riprova.` });
  return r.ok;
}

async function toggle(id: ProId, on: boolean): Promise<string> {
  const n = biometricName(), name = n[0]!.toUpperCase() + n.slice(1);
  if (on) { disableBiometric(proBioKey(id)); return `${name} spento per ${id.name}.`; }
  const r = await enableBiometric(proBioKey(id), id.name);
  if (r.ok) {
    // Turned on while signed out: the profile's account is entered at once (just recognised).
    const { data } = await supabase.auth.getSession();
    const k = knownOf(id);
    if (!data.session && k) { if (await enterWithProfile(k, { recognised: true })) return `${name} attivo: entro come ${id.name}…`; }
  }
  return r.ok ? `${name} attivo: per riprendere ${id.name} su questo telefono ti chiedo il riconoscimento.` : r.reason ?? "Non è stato possibile attivarlo.";
}

/** Small round button on a profile's card (beside the pencil and the bin): turns its Face ID / fingerprint on or off. */
export function ProfileBioButton({ id }: { id: ProId }) {
  const available = useBiometricAvailable();
  const on = useBiometricOn(proBioKey(id));
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  const name = biometricName();
  return (
    <button type="button" aria-pressed={on} disabled={busy} title={`${name} per questo profilo`} aria-label={`${on ? "Spegni" : "Attiva"} ${name} per ${id.name}`}
      onClick={async () => { setBusy(true); const m = await toggle(id, on); setBusy(false); toast(m); }}
      className={`grid size-9 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-turquoise disabled:opacity-60 ${on ? "bg-brand-turquoise/20 text-brand-turquoise" : "text-foreground/50 hover:bg-foreground/10 hover:text-foreground"}`}>
      <BioIcon className="size-4" />
    </button>
  );
}

/** The profile page's row: "Accesso con Face ID" with a switch, for the profile in use. */
export function ProfileBioRow({ id }: { id: ProId }) {
  const available = useBiometricAvailable();
  const on = useBiometricOn(proBioKey(id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!available) return null;
  const name = biometricName();
  return (
    <div className="rounded-2xl bg-foreground/[0.05] p-4">
      <div className="flex items-center gap-3">
        <BioIcon className="size-6 shrink-0 text-brand-turquoise" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Accesso con {name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Per riprendere questo profilo su questo telefono ti chiedo il riconoscimento. Impronta e volto restano sul telefono.</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={`Accesso con ${name} per questo profilo`} disabled={busy}
          onClick={async () => { setBusy(true); setMsg(await toggle(id, on)); setBusy(false); }}
          className={`relative h-7 w-12 shrink-0 rounded-full p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${on ? "bg-brand-turquoise" : "bg-foreground/20"}`}>
          <span className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

/** The account panel's profile card: a compact switch for the profile in use. */
export function ProfileBioSwitch({ id }: { id: ProId }) {
  const available = useBiometricAvailable();
  const on = useBiometricOn(proBioKey(id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!available) return null;
  const name = biometricName();
  return (
    <div className="border-t border-foreground/10 py-3">
      <div className="flex items-center gap-3">
        <BioIcon className="size-6 shrink-0 text-brand-turquoise" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Accesso con {name}</p>
          <p className="text-xs text-muted-foreground">Rientri in questo profilo e nel suo account con il riconoscimento del telefono.</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={`Accesso con ${name}`} disabled={busy}
          onClick={async () => { setBusy(true); setMsg(await toggle(id, on)); setBusy(false); }}
          className={`relative h-7 w-12 shrink-0 rounded-full p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${on ? "bg-brand-turquoise" : "bg-foreground/20"}`}>
          <span className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

/** The profile on this phone matching one (same kind and registration time), with the account it is tied to. */
export function knownOf(id: ProId): KnownProId | null {
  return getKnownProIds().find((k) => proBioKey(k) === proBioKey(id)) ?? null;
}

/**
 * Enters a profile and its personal account at once: the phone's recognition (unless just asked), then the account
 * kept on this phone, its sector moved to the profile's if needed, the profile in use and a clean load of its
 * simulation. False when it could not (not recognised, or the account is not kept here / must be signed in again).
 */
export async function enterWithProfile(k: KnownProId, opts: { recognised?: boolean; quiet?: boolean } = {}): Promise<boolean> {
  const email = k.acct?.email;
  const to = k.kind === "funzionario" ? "/urbano" : "/vigneto";
  const section = k.kind === "funzionario" ? "urban" : "vineyard";
  if (!opts.recognised && !(await checkProfileBiometric(k))) return false;
  if (email && hasAccountSession(email)) {
    const r = await switchToAccount(email);
    if (r === "refused") {
      if (!opts.quiet) toast.error("Non ti ho riconosciuto", { description: `Per entrare con ${email} serve il riconoscimento del telefono. Riprova.` });
      return false;
    }
    if (r === true) {
      rememberWantedSector(k.kind);
      if (!(await saveProId(k))) return false;
      setRegisteredEmail(email);
      notifyAuthChange();
      clearSectorGate();
      openSimTab(section, "mappa");
      toast.success(`Bentornato, ${k.name}`, { description: `Sei entrato con ${email}.` });
      goInApp(to);
      return true;
    }
  }
  // Fallback when session token is not stored or expired: activate registered profile immediately and go to Mappa
  rememberWantedSector(k.kind);
  if (email) setRegisteredEmail(email);
  setProIdOnDevice(k);
  notifyAuthChange();
  clearSectorGate();
  openSimTab(section, "mappa");
  toast.success(`Bentornato, ${k.name}`, { description: email ? `Sei entrato con ${email}.` : "Profilo attivato." });
  goInApp(to);
  return true;
}

/**
 * Opening the app signed out with a profile on this phone that has the recognition on and its account kept here: the
 * phone's recognition is asked at once and, recognised, the profile and its account open by themselves. Once per
 * load; where the browser wants a tap first, the account panel opens with its "Entra con …" button.
 */
export function useBiometricAutoEnter() {
  useEffect(() => {
    let done = false;
    const t = window.setTimeout(async () => {
      if (done) return;
      try { if (sessionStorage.getItem("mdt-bio-skip")) { sessionStorage.removeItem("mdt-bio-skip"); return; } } catch { /* none */ }
      const { data } = await supabase.auth.getSession();
      if (data.session || !(await biometricAvailable())) return;
      const cur = getProId();
      const all = getKnownProIds().filter((k) => biometricOn(proBioKey(k)) && !!k.acct?.email && hasAccountSession(k.acct.email));
      const k = (cur && all.find((x) => proBioKey(x) === proBioKey(cur))) ?? all.sort((a, b) => (b.at > a.at ? 1 : -1))[0];
      if (!k) return;
      // The recognition only unlocks the app: it stays on the sector page (the two sectors), where the person picks the
      // sector and the profile — asked no second time for a few minutes. Nothing is entered by itself.
      const r = await verifyBiometric(proBioKey(k));
      if (r.ok) {
        markUnlocked();
        toast.success("App sbloccata", { description: "Scegli il settore: il tuo profilo ti aspetta lì." });
        return;
      }
      toast("Sblocco non riuscito", { description: "Scegli il settore e il tuo profilo: il riconoscimento ti verrà chiesto lì." });
    }, 900);
    return () => { done = true; window.clearTimeout(t); };
  }, []);
}

/**
 * The account panel signed out, divided by sector: "Settore urbano" and "Settore agricolo" (the one being used first —
 * the page open, else the profile in use, else the sector being entered), each listing the accounts of its
 * professional profiles kept on this phone: with Face ID / fingerprint on and the account kept, "Entra con …" (the
 * recognition, then the account and the profile); kept without recognition, "Entra" at once; not kept, "Accedi" to
 * that account (Google straight for its address, else the panel with the email written). Nothing for a sector with
 * no profile tied to an account.
 */
export function BiometricSignIn({ onDone }: { onDone?: () => void }) {
  const available = useBiometricAvailable();
  const urban = useKnownProIds("funzionario"), farm = useKnownProIds("agronomo");
  useBiometricAccounts(); // re-render when a profile's recognition is turned on or off
  const [busy, setBusy] = useState<string | null>(null);
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  const cur = getProId();
  const first: ProId["kind"] = path.startsWith("/vigneto") ? "agronomo" : path.startsWith("/urbano") ? "funzionario" : cur?.kind ?? "funzionario";
  const withAcct = (l: KnownProId[]) => l.filter((k) => !!k.acct?.email);
  const groups = ([["funzionario", "Settore urbano", withAcct(urban)], ["agronomo", "Settore agricolo", withAcct(farm)]] as const)
    .filter(([, , l]) => l.length > 0)
    .sort((a) => (a[0] === first ? -1 : 1));
  if (!groups.length) return null;
  const name = biometricName();
  const enter = async (k: KnownProId) => {
    setBusy(proBioKey(k));
    try {
      const bio = available && biometricOn(proBioKey(k));
      if (await enterWithProfile(k, bio ? {} : { recognised: true })) {
        onDone?.();
      }
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4">
      {groups.map(([kind, title, list]) => (
        <section key={kind} aria-label={`Account del ${title.toLowerCase()}`} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
          {list.map((k) => {
            const email = k.acct!.email!, bio = available && biometricOn(proBioKey(k));
            const label = busy === proBioKey(k) ? (bio ? "Ti riconosco…" : "Entro…") : bio ? `Entra con ${name}` : `Entra come ${k.name.trim().split(/\s+/)[0]}`;
            return (
              <button key={proBioKey(k)} type="button" disabled={busy !== null} onClick={() => void enter(k)}
                className="flex w-full items-center gap-3 rounded-2xl bg-brand-turquoise/15 px-4 py-3 text-left ring-1 ring-brand-turquoise/40 outline-none transition-colors hover:bg-brand-turquoise/25 focus-visible:ring-2 focus-visible:ring-brand-turquoise disabled:opacity-60">
                {bio ? <BioIcon className="size-7 shrink-0 text-brand-turquoise" />
                  : k.acct?.pic ? <img src={k.acct.pic} alt="" referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full object-cover" />
                  : <UserRound className="size-7 shrink-0 text-brand-turquoise" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{k.name} · {email}</span>
                </span>
              </button>
            );
          })}
        </section>
      ))}
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />oppure<span className="h-px flex-1 bg-border" /></div>
    </div>
  );
}

/**
 * "Esci dal profilo": leaving the professional profile returns to the main gate ("Da dove vuoi usarmi?"),
 * and completely disconnects from both personal and professional accounts.
 */
export const leaveProfile = (_kind?: ProId["kind"]) => exitToGate();
