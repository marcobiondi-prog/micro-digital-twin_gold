import { useEffect, useState } from "react";
import { Fingerprint, ScanFace } from "lucide-react";
import { toast } from "sonner";
import { switchToAccount } from "@/lib/account-sessions";
import { biometricAvailable, biometricName, disableBiometric, enableBiometric, useBiometricAccounts, useBiometricOn } from "@/lib/biometric";
import { hasAccountSession } from "@/lib/account-sessions";

const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const BioIcon = ({ className }: { className?: string }) => (isApple() ? <ScanFace className={className} aria-hidden="true" /> : <Fingerprint className={className} aria-hidden="true" />);

function useAvailable() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { void biometricAvailable().then(setOk); }, []);
  return ok;
}

/**
 * Account panel, signed in: "Accesso con Face ID / impronta" — a switch that turns on the biometric sign-in for this
 * account on this phone (the phone asks its biometrics once), and off again. Hidden where the phone has none.
 */
export function BiometricCard({ email }: { email: string }) {
  const available = useAvailable();
  const on = useBiometricOn(email);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!available) return null;
  const name = biometricName();
  const toggle = async () => {
    setMsg(null);
    if (on) { disableBiometric(email); setMsg(`Accesso con ${name} spento: "Esci" chiuderà di nuovo l'account.`); return; }
    setBusy(true);
    const r = await enableBiometric(email);
    setBusy(false);
    setMsg(r.ok ? `Fatto: da ora entri in questo account con ${name}.` : r.reason ?? "Non è stato possibile attivarlo.");
  };
  return (
    <div className="rounded-md border bg-muted/40 p-4">
      <div className="flex items-center gap-3">
        <BioIcon className="size-6 shrink-0 text-brand-turquoise" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Accesso con {name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Entri in questo account senza password, con il riconoscimento del telefono. Impronta e volto restano sul telefono: l'app non li vede.</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={`Accesso con ${name}`} disabled={busy} onClick={() => void toggle()}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${on ? "bg-brand-turquoise" : "bg-foreground/20"}`}>
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[1.375rem]" : "translate-x-0.5"}`} />
        </button>
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

/**
 * Account panel, signed out: one button per account with the biometric sign-in on and kept on this phone — "Entra
 * con Face ID · email" — that asks the phone's biometrics and enters it, with no password nor Google.
 */
export function BiometricSignIn({ onDone }: { onDone?: () => void }) {
  const available = useAvailable();
  const accounts = useBiometricAccounts().filter((e) => hasAccountSession(e));
  const [busy, setBusy] = useState<string | null>(null);
  if (!available || accounts.length === 0) return null;
  const name = biometricName();
  const enter = async (email: string) => {
    setBusy(email);
    const r = await switchToAccount(email);
    setBusy(null);
    if (r === true) { toast.success("Sei entrato", { description: email }); onDone?.(); return; }
    if (r === "refused") toast.error("Non ti ho riconosciuto", { description: "Riprova, oppure entra con la password o con Google." });
    else toast.error("Questo account va riconnesso", { description: "Entra una volta con la password o con Google, poi riattiva l'accesso col riconoscimento." });
  };
  return (
    <div className="space-y-2">
      {accounts.map((email) => (
        <button key={email} type="button" disabled={busy !== null} onClick={() => void enter(email)}
          className="flex w-full items-center gap-3 rounded-2xl bg-brand-turquoise/15 px-4 py-3 text-left ring-1 ring-brand-turquoise/40 outline-none transition-colors hover:bg-brand-turquoise/25 focus-visible:ring-2 focus-visible:ring-brand-turquoise disabled:opacity-60">
          <BioIcon className="size-7 shrink-0 text-brand-turquoise" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{busy === email ? "Ti riconosco…" : `Entra con ${name}`}</span>
            <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{email}</span>
          </span>
        </button>
      ))}
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />oppure<span className="h-px flex-1 bg-border" /></div>
    </div>
  );
}
