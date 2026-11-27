import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Check, Grape, Building2, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { openAccount } from "@/lib/camera-dock";
import { openSharedProject } from "@/lib/project-sync";
import { ROLE_LABEL, type ProjectRole } from "@/lib/project-share";
import { openSimTab } from "@/views/v8/console";

/**
 * Progetti condivisi · the invite page (/invito/<token>): who invites you to which piazza or vineyard, with which role;
 * "Accetta e apri" joins the project (accept_project_invite), makes it this account's project of that kind and opens its
 * simulation. Signed out, it asks to sign in first and stays here, to accept after.
 */
type Info = { project_id: string; kind: "piazza" | "vigneto"; name: string; role: Exclude<ProjectRole, "owner">; inviter: string; accepted: boolean };
const db = () => supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> };

export function InvitePage() {
  const { token } = useParams({ from: "/invito/$token" });
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(!!data.session);
      if (!data.session) return;
      const { data: rows, error: e } = await db().rpc("invite_info", { t: token });
      if (e) { setError(e.message ?? "errore"); return; }
      const row = (rows as Info[] | null)?.[0] ?? null;
      if (!row) setError("Questo invito non esiste più: chiedi a chi te l’ha mandato un link nuovo.");
      setInfo(row);
    };
    void read();
    const { data } = supabase.auth.onAuthStateChange(() => void read());
    return () => data.subscription.unsubscribe();
  }, [token]);
  const accept = async () => {
    if (!info) return;
    setBusy(true);
    const { error: e } = await db().rpc("accept_project_invite", { t: token });
    if (e) { setBusy(false); toast.error("Invito non accettato", { description: /already used/.test(e.message ?? "") ? "Questo invito è già stato usato da un altro account." : e.message }); return; }
    await openSharedProject(info.kind, info.project_id);
    toast.success(`Sei nel progetto ${info.name}`, { description: `${ROLE_LABEL[info.role]} · invitato da ${info.inviter}` });
    openSimTab(info.kind === "piazza" ? "urban" : "vineyard", "mappa");
    void navigate({ to: info.kind === "piazza" ? "/urbano" : "/vigneto", replace: true });
  };
  const Icon = info?.kind === "vigneto" ? Grape : Building2;
  return (
    <div className="mx-auto grid max-w-md gap-6 py-10 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[oklch(0.82_0.12_185)]">Progetto condiviso</p>
      {signedIn === null ? <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /> : !signedIn ? (
        <>
          <h1 className="font-display text-4xl font-light leading-tight">Ti hanno invitato a un progetto</h1>
          <p className="text-muted-foreground">Entra con il tuo account per vedere chi ti invita e accettare: poi lavorerete sullo stesso luogo, ognuno dal suo dispositivo.</p>
          <button type="button" onClick={() => openAccount()} className="mx-auto inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-6 font-semibold text-background"><LogIn className="size-4" /> Accedi per accettare</button>
        </>
      ) : error ? (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">{error}</p>
      ) : !info ? <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /> : (
        <>
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-[oklch(0.78_0.13_185/0.15)] ring-1 ring-[oklch(0.78_0.13_185/0.5)]"><Icon className="size-9 text-[oklch(0.85_0.12_185)]" /></span>
          <h1 className="font-display text-3xl font-light leading-tight"><b className="font-semibold">{info.inviter}</b> ti ha invitato su {info.kind === "piazza" ? "la piazza" : "il vigneto"} «{info.name}»</h1>
          <p className="text-muted-foreground">{info.role === "editor" ? "Potrai modificare gli interventi, l’area e le zone, e vedere chi è connesso." : "Potrai guardare il progetto, senza modificarlo."}</p>
          <span className="mx-auto rounded-full bg-foreground/10 px-3 py-1 text-sm">{ROLE_LABEL[info.role]}</span>
          <div className="grid gap-2">
            <button type="button" disabled={busy} onClick={() => void accept()} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground font-semibold text-background disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {info.accepted ? "Apri il progetto" : "Accetta e apri"}
            </button>
            <button type="button" onClick={() => void navigate({ to: "/benvenuto" })} className="h-11 rounded-full text-sm text-muted-foreground hover:bg-foreground/5">Non ora</button>
          </div>
        </>
      )}
    </div>
  );
}
