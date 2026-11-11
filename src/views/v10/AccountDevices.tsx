import { useState } from "react";
import { LogOut, Monitor, Smartphone, Tablet, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { keepProIdInAccount } from "@/lib/use-pro-id";
import { exitToGate } from "@/lib/exit-to-gate";
import { thisDeviceId, useAccountDevices, type AccountDevice } from "@/lib/account-devices";

/** "adesso", "12 min fa", "oggi 14:32", "ieri 09:10", "03/11/2026". */
function seenText(at: string): string {
  const d = new Date(at), now = new Date(), min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 2) return "adesso";
  if (min < 60) return `${min} min fa`;
  const hm = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(now)) return `oggi ${hm}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (day(d) === day(y)) return `ieri ${hm}`;
  return d.toLocaleDateString("it-IT");
}
const iconOf = (label: string) => (/Windows|Mac|Linux|Chromebook/.test(label) && !/Android|iPhone/.test(label) ? Monitor : /iPad|Tablet/.test(label) ? Tablet : Smartphone);

/**
 * Account panel: the devices signed in to this account (only its owner sees them), this one marked, each with when it
 * was last used and "Togli" (off the list; the device itself stays signed in until it signs out or its session ends),
 * and "Esci da tutti i dispositivi", which ends every session of the account, this one too, after one confirm in place.
 */
export function AccountDevices() {
  const { devices, ready, loading, remove } = useAccountDevices();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const me = thisDeviceId();
  const outAll = async () => {
    setBusy(true);
    setAsk(false);
    await exitToGate({ global: true });
    setBusy(false);
  };
  const drop = async (d: AccountDevice) => {
    const ok = await remove(d.id);
    setMsg(ok ? `${d.label || "Dispositivo"} tolto dall’elenco. Se è ancora collegato, ricompare al prossimo uso: per farlo uscire usa "Esci da tutti i dispositivi".` : "Non sono riuscito a toglierlo: riprova.");
  };
  return (
    <div className="rounded-md border bg-muted/40 p-4">
      <p className="text-sm font-semibold">Dispositivi collegati</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Telefoni e computer da cui sei entrato con questo account. Li vedi solo tu.</p>
      {!ready ? (
        <p className="mt-3 text-xs text-muted-foreground">L’elenco non è ancora attivo.</p>
      ) : loading && devices.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Carico…</p>
      ) : (
        <ul className="mt-3 divide-y divide-foreground/10">
          {devices.map((d) => {
            const Icon = iconOf(d.label), mine = d.device_id === me;
            return (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{d.label || "Dispositivo"}{mine && <span className="ml-2 rounded-full bg-brand-turquoise/20 px-2 py-0.5 text-[11px] font-semibold text-brand-turquoise">Questo dispositivo</span>}</p>
                  <p className="text-xs text-muted-foreground">Ultimo uso {seenText(d.last_seen)} · primo accesso {new Date(d.first_seen).toLocaleDateString("it-IT")}</p>
                </div>
                {!mine && (
                  <button type="button" onClick={() => void drop(d)} aria-label={`Togli ${d.label || "il dispositivo"} dall’elenco`} className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p role="status" className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      {ready && (ask ? (
        <div role="alertdialog" aria-label="Uscire da tutti i dispositivi?" className="mt-3 space-y-2">
          <p className="text-xs">Esco dall’account su tutti i dispositivi, anche su questo. Per rientrare dovrai accedere di nuovo.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAsk(false)} disabled={busy} className="h-9 flex-1 rounded-full bg-foreground/[0.08] text-sm font-semibold">Annulla</button>
            <button type="button" onClick={() => void outAll()} disabled={busy} className="h-9 flex-1 rounded-full bg-danger text-sm font-semibold text-danger-foreground disabled:opacity-60">{busy ? "Esco…" : "Esci da tutti"}</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsk(true)} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full px-1 text-sm font-semibold text-danger outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LogOut className="size-4" aria-hidden="true" />Esci da tutti i dispositivi
        </button>
      ))}
    </div>
  );
}
