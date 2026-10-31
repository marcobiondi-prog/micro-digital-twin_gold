import { useEffect, useState } from "react";
import { Eraser, LoaderCircle } from "lucide-react";
import { bytesText } from "@/lib/use-cloud-usage";
import { clearDeviceCache, deviceCacheBytes } from "@/lib/device-cache";

/** "Cache del dispositivo": how much the phone keeps for offline use, and a button that empties it (no user data lost). */
export function DeviceCacheCard() {
  const [bytes, setBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void deviceCacheBytes().then(setBytes); }, []);
  const empty = async () => {
    setBusy(true);
    try {
      const freed = await clearDeviceCache();
      setMsg(freed ? `Cache svuotata: liberati ${bytesText(freed)}. Pagine e mappe si ricaricano dalla rete.` : "Cache svuotata. Pagine e mappe si ricaricano dalla rete.");
      setBytes(await deviceCacheBytes());
    } catch {
      setMsg("Non sono riuscito a svuotare la cache: riprova.");
    }
    setBusy(false);
  };
  return (
    <div className="rounded-md border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Cache del dispositivo</p>
          <p className="text-xs tabular-nums text-muted-foreground">{bytes === null ? "Pagine e mappe salvate per l'uso offline" : `${bytesText(bytes)} di pagine e mappe salvate`}</p>
        </div>
        <button type="button" onClick={() => void empty()} disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold outline-none hover:bg-foreground/[0.14] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <Eraser className="size-3.5" aria-hidden="true" />}Svuota cache
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Non tocca simulazioni, cronologia, impostazioni né le foto in attesa sul telefono.</p>
      {msg && <p className="mt-1.5 text-xs font-medium" role="status">{msg}</p>}
    </div>
  );
}
