import { useEffect, useState } from "react";
import { Fingerprint, ScanFace } from "lucide-react";
import { toast } from "sonner";
import { biometricAvailable, biometricName, biometricOn, disableBiometric, enableBiometric, useBiometricAccounts, useBiometricOn, verifyBiometric } from "@/lib/biometric";
import { hasAccountSession, switchToAccount } from "@/lib/account-sessions";
import { supabase } from "@/integrations/supabase/client";
import { type KnownProId, rememberWantedSector, saveProId, sectorOf, switchAccountSector, useKnownProIds } from "@/lib/use-pro-id";
import { type ProId } from "@/models/professional-id";

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
          className={`relative h-7 w-12 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${on ? "bg-brand-turquoise" : "bg-foreground/20"}`}>
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`} />
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
          className={`relative h-7 w-12 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${on ? "bg-brand-turquoise" : "bg-foreground/20"}`}>
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`} />
        </button>
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

/**
 * The account panel signed out: one button per professional profile with the recognition on whose personal account
 * is kept on this phone — "Entra con Face ID · name · email": the recognition, then that account and that profile,
 * with no password nor Google.
 */
export function BiometricSignIn({ onDone }: { onDone?: () => void }) {
  const available = useBiometricAvailable();
  const all = [...useKnownProIds("funzionario"), ...useKnownProIds("agronomo")];
  useBiometricAccounts(); // re-render when a profile's recognition is turned on or off
  const [busy, setBusy] = useState<string | null>(null);
  const list = all.filter((k) => biometricOn(proBioKey(k)) && !!k.acct?.email && hasAccountSession(k.acct.email));
  if (!available || list.length === 0) return null;
  const name = biometricName();
  const enter = async (k: KnownProId) => {
    const key = proBioKey(k);
    setBusy(key);
    try {
      if (!(await checkProfileBiometric(k))) return;
      const r = await switchToAccount(k.acct!.email!);
      if (r !== true) { toast.error("Questo account va riconnesso", { description: "Entra una volta con la password o con Google: poi il riconoscimento torna a farti entrare." }); return; }
      const { data } = await supabase.auth.getSession();
      const sec = sectorOf(data.session?.user.user_metadata);
      if (sec && sec !== k.kind) await switchAccountSector(k.kind);
      rememberWantedSector(k.kind);
      await saveProId(k);
      toast.success(`Bentornato, ${k.name}`, { description: `Sei entrato con ${k.acct!.email}.` });
      onDone?.();
      window.location.assign(k.kind === "funzionario" ? "/urbano" : "/vigneto");
    } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2">
      {list.map((k) => (
        <button key={proBioKey(k)} type="button" disabled={busy !== null} onClick={() => void enter(k)}
          className="flex w-full items-center gap-3 rounded-2xl bg-brand-turquoise/15 px-4 py-3 text-left ring-1 ring-brand-turquoise/40 outline-none transition-colors hover:bg-brand-turquoise/25 focus-visible:ring-2 focus-visible:ring-brand-turquoise disabled:opacity-60">
          <BioIcon className="size-7 shrink-0 text-brand-turquoise" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{busy === proBioKey(k) ? "Ti riconosco…" : `Entra con ${name}`}</span>
            <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{k.name} · {k.kind === "funzionario" ? "piazza" : "vigneto"} · {k.acct!.email}</span>
          </span>
        </button>
      ))}
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />oppure<span className="h-px flex-1 bg-border" /></div>
    </div>
  );
}
