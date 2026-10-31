import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Bell, Camera, Check, Loader2, Lock, MapPin, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  PERMS, STATE_LABEL, askPermission, changeMessage, howToChange, markPermsAsked, permsAsked, setAppAllowed, useAppAllowed, usePermissions,
  type AppKind, type PermKind, type PermState,
} from "@/lib/app-permissions";
import { InfoCard, InfoPage, PageLink } from "./InfoPage";

const ICON: Record<PermKind, LucideIcon> = { posizione: MapPin, fotocamera: Camera, notifiche: Bell };
const CHIP: Record<PermState, string> = {
  granted: "bg-ok/15 text-ok", denied: "bg-danger/15 text-danger", prompt: "bg-foreground/10 text-foreground/80", unsupported: "bg-foreground/10 text-muted-foreground",
};

/** One permission: what it is for, its state, the button to ask it and, once given or blocked, where to change it. */
function PermRow({ kind, title, why, state, busy, note, onAsk, app }: {
  kind: PermKind; title: string; why: string; state: PermState | undefined; busy: boolean; note: string | null; onAsk: () => void;
  /** Position and camera on the Autorizzazioni page: the switch that revokes them inside the app. */
  app?: { on: boolean; onToggle: (on: boolean) => void } | undefined;
}) {
  const Icon = ICON[kind];
  const revoked = app && !app.on;
  return (
    <div className="flex gap-3 rounded-2xl bg-foreground/[0.05] p-3.5">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", revoked ? "bg-foreground/10 text-muted-foreground" : "bg-brand-turquoise/15 text-brand-turquoise")}><Icon className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{title}</span>
          {revoked
            ? <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">Revocato nell'app</span>
            : state && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", CHIP[state])}>{STATE_LABEL[state]}</span>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{why}</p>
        {app && state !== "unsupported" && (
          <button type="button" role="switch" aria-checked={app.on} onClick={() => app.onToggle(!app.on)}
            className="mt-2.5 flex w-full items-center gap-3 rounded-xl bg-foreground/[0.06] px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="min-w-0 flex-1 font-medium">{app.on ? "L'app può usarla" : "L'app non la usa"}</span>
            <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none", app.on ? "bg-brand-turquoise" : "bg-foreground/20")} aria-hidden="true">
              <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none", app.on ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
            </span>
          </button>
        )}
        {note && <p className="mt-1.5 text-sm font-medium" role="status">{note}</p>}
        {revoked && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Il telefono conserva comunque il suo permesso{state === "granted" ? `. ${howToChange("granted")}` : "."}</p>}
        {!revoked && (state === "granted" || state === "denied") && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{howToChange(state)}</p>}
        {!revoked && state === "prompt" && (
          <button type="button" onClick={onAsk} disabled={busy}
            className="mt-2.5 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-70">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />} Consenti
          </button>
        )}
        {!revoked && state === "denied" && (
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-danger"><Lock className="size-3.5" aria-hidden="true" /> L'app non può più chiederlo da sola</span>
        )}
      </div>
    </div>
  );
}

/** The three rows with their own messages (written in place: toasts sit under dialogs). */
function usePermRows() {
  const { states, refresh, setStates } = usePermissions();
  const [busy, setBusy] = useState<PermKind | null>(null);
  const [notes, setNotes] = useState<Partial<Record<PermKind, string>>>({});
  const ask = async (kind: PermKind) => {
    setBusy(kind);
    const s = await askPermission(kind);
    setStates((p) => (p ? { ...p, [kind]: s } : p));
    setNotes((n) => ({ ...n, [kind]: changeMessage(kind, s) }));
    setBusy(null);
    return s;
  };
  const setNote = (kind: PermKind, text: string) => setNotes((n) => ({ ...n, [kind]: text }));
  return { states, refresh, busy, notes, ask, setNote };
}

/**
 * At the first start, once the tutorial is over (never on / nor /scegli), a sheet asks the three permissions together.
 * It shows once per device, unless everything is already allowed; Account → Autorizzazioni changes them later.
 */
export function PermissionsSheet() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const [open, setOpen] = useState(false);
  const { states, busy, notes, ask } = usePermRows();
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (open || pathname === "/" || pathname === "/scegli" || permsAsked() || !states) return;
    if (PERMS.every((p) => states[p.kind] !== "prompt")) { markPermsAsked(); return; }
    // A beat after the page shows, so the sheet does not land on top of the page change.
    const t = window.setTimeout(() => { markPermsAsked(); setOpen(true); }, 1200);
    return () => window.clearTimeout(t);
  }, [pathname, states, open]);
  const askAll = async () => {
    setAll(true);
    // One after the other: the phone shows one question at a time.
    for (const p of PERMS) if (states?.[p.kind] === "prompt") await ask(p.kind);
    setAll(false);
  };
  const pending = !!states && PERMS.some((p) => states[p.kind] === "prompt");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-4 border-foreground/20 bg-card dark:bg-[oklch(0.25_0.016_258)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_-24px_60px_rgb(0_0_0/0.6)] p-5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2 sm:w-[min(460px,calc(100vw-1.5rem))] sm:rounded-2xl">
        <span className="mx-auto -mt-1 h-1.5 w-10 rounded-full bg-foreground/20 sm:hidden" aria-hidden="true" />
        <DialogHeader className="text-left">
          <DialogTitle>Autorizzazioni</DialogTitle>
          <DialogDescription>Per funzionare bene l'app ha bisogno di tre permessi. Il telefono te li chiede uno alla volta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {PERMS.map((p) => (
            <PermRow key={p.kind} {...p} state={states?.[p.kind]} busy={busy === p.kind} note={notes[p.kind] ?? null} onAsk={() => void ask(p.kind)} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Puoi cambiarle quando vuoi in Account → Autorizzazioni.</p>
        <div className="grid gap-2">
          {pending ? (
            <button type="button" onClick={() => void askAll()} disabled={all} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white font-semibold text-black disabled:opacity-70">
              {all && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Consenti tutto
            </button>
          ) : (
            <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-full bg-white font-semibold text-black">Fatto</button>
          )}
          {pending && <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full font-semibold text-muted-foreground">Più tardi</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const GPS_KEY = "mdt-gps-v1", NOTIFY_KEY = "mdt-dst-notify-v1";
const readFlag = (key: string, on: string) => { try { return localStorage.getItem(key) === on; } catch { return false; } };

/** Account → Autorizzazioni: each permission's state, to ask it or to see where to change it, plus the app's own switches. */
export function PermissionsPage() {
  const { states, refresh, busy, notes, ask, setNote } = usePermRows();
  const posOn = useAppAllowed("posizione"), camOn = useAppAllowed("fotocamera");
  const toggleApp = (kind: AppKind) => (on: boolean) => {
    setAppAllowed(kind, on);
    const what = kind === "posizione" ? "Posizione" : "Fotocamera";
    setNote(kind, on
      ? `${what} di nuovo consentita all'app.`
      : kind === "posizione" ? "Posizione revocata: l'app non la chiede più e il GPS della mappa si spegne." : "Fotocamera revocata: l'app non apre più foto, video né scatto multiplo. La galleria resta.");
    if (on && states?.[kind] === "prompt") void ask(kind);
  };
  const appOf = (kind: PermKind) => (kind === "posizione" ? { on: posOn, onToggle: toggleApp("posizione") } : kind === "fotocamera" ? { on: camOn, onToggle: toggleApp("fotocamera") } : undefined);
  const [gps, setGps] = useState(false);
  const [notify, setNotify] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setGps(readFlag(GPS_KEY, "on")); setNotify(readFlag(NOTIFY_KEY, "1")); }, []);
  const toggleGps = (on: boolean) => {
    setGps(on);
    try { if (on) localStorage.setItem(GPS_KEY, "on"); else localStorage.removeItem(GPS_KEY); } catch { /* storage off */ }
    setMsg(on ? "GPS acceso: la mappa ti seguirà da quando la apri." : "GPS spento: la mappa non segue più la tua posizione.");
    if (on && states?.posizione === "prompt") void ask("posizione");
  };
  const toggleNotify = async (on: boolean) => {
    if (on && states?.notifiche !== "granted") {
      const s = await ask("notifiche");
      setNotify(s === "granted");
      setMsg(s === "granted" ? "Avvisi del cambio dell'ora accesi." : "Senza il permesso delle notifiche gli avvisi restano dentro l'app.");
      return;
    }
    setNotify(on);
    try { if (on) localStorage.setItem(NOTIFY_KEY, "1"); else localStorage.removeItem(NOTIFY_KEY); } catch { /* storage off */ }
    setMsg(on ? "Avvisi del cambio dell'ora accesi." : "Avvisi sul telefono spenti: il cambio dell'ora te lo dico solo dentro l'app.");
  };
  const row = "flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 text-left";
  return (
    <InfoPage title="Autorizzazioni" intro="Cosa può usare l'app sul tuo telefono. Posizione e fotocamera le revochi qui quando vuoi, con l'interruttore.">
      <div className="space-y-2">
        {PERMS.map((p) => (
          <PermRow key={p.kind} {...p} state={states?.[p.kind]} busy={busy === p.kind} note={notes[p.kind] ?? null} onAsk={() => void ask(p.kind)} app={appOf(p.kind)} />
        ))}
      </div>
      <button type="button" onClick={() => void refresh().then(() => setMsg("Stato aggiornato."))} className="h-11 w-full rounded-full bg-foreground/[0.08] text-sm font-semibold">
        Ho cambiato le impostazioni: aggiorna
      </button>
      <InfoCard title="Nell'app">
        <label className={row}>
          <span className="min-w-0 flex-1">GPS sempre attivo sulla mappa<span className="block text-sm text-muted-foreground">{posOn ? "La mappa segue la tua posizione quando ti sposti." : "Spento finché la posizione è revocata."}</span></span>
          <input type="checkbox" className="size-6 accent-current" checked={gps && posOn} disabled={!posOn} onChange={(e) => toggleGps(e.target.checked)} />
        </label>
        <label className={row}>
          <span className="min-w-0 flex-1">Avvisi del cambio dell'ora sul telefono<span className="block text-sm text-muted-foreground">La sera prima, anche con l'app in sottofondo.</span></span>
          <input type="checkbox" className="size-6 accent-current" checked={notify && states?.notifiche === "granted"} disabled={states?.notifiche === "denied" || states?.notifiche === "unsupported"} onChange={(e) => void toggleNotify(e.target.checked)} />
        </label>
        {msg && <p className="text-sm font-medium" role="status">{msg}</p>}
        <p className="text-sm text-muted-foreground">Altre scelte su cosa resta salvato sono in <PageLink to="/privacy/preferenze">Preferenze privacy</PageLink>.</p>
      </InfoCard>
    </InfoPage>
  );
}
