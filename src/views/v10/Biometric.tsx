import { useEffect, useState } from "react";
import { Fingerprint, ScanFace } from "lucide-react";
import { toast } from "sonner";
import { biometricAvailable, biometricName, disableBiometric, enableBiometric, useBiometricOn, verifyBiometric } from "@/lib/biometric";
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
