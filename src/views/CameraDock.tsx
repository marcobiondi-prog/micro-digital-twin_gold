import { useLocation, useNavigate } from "@tanstack/react-router";
import { Building2, Camera, Grape, Images, Lock, MapPin, Pause, Video, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstalledApp } from "@/lib/installed-app";
import { useSignedIn } from "@/lib/use-signed-in";
import { showSimMedia } from "@/views/v8/console";
import { openAccount, requestCapture, setCameraSheetOpen, useCameraSheetOpen, type CaptureAction } from "@/lib/camera-dock";
import { cn } from "@/lib/utils";
import { useProId } from "@/lib/use-pro-id";
import { useLab } from "@/models/lab-store";
import { splitLocation } from "@/views/SimulationGrid";
import aiLogo from "@/assets/ai-logo.png";
import { AI_STANDBY } from "@/lib/ai-standby";

type Kind = "urban" | "vineyard";
const kindOf = (pathname: string): Kind | null => (pathname === "/urbano" ? "urban" : pathname === "/vigneto" ? "vineyard" : null);

/** AI ready = signed in (or simulated in a preview) and, for real accounts, the installed app. */
function useAiReady() {
  const { signedIn, demo } = useSignedIn();
  const installed = useInstalledApp();
  return { signedIn, aiReady: !AI_STANDBY && signedIn && (installed || demo) };
}

/** Fotocamera al centro della barra ad arco, rialzata e luminosa (logo AI dopo l'accesso); apre il pannello con tutte le opzioni. */
/** `focused`: Home has the camera tile selected, so the button glows brighter to show where it leads. */
export function CameraDockButton({ focused = false }: { focused?: boolean }) {
  const { aiReady } = useAiReady();
  return (
    <button
      type="button"
      onClick={() => setCameraSheetOpen(true)}
      aria-label={aiReady ? "Fotocamera AI e altre opzioni" : "Fotocamera: foto, video e galleria"}
      className="ps-nav-camera camera-dock-button" data-ai={aiReady || undefined} data-focus={focused || undefined}
    >
      {aiReady
        ? <img src={aiLogo} alt="" aria-hidden="true" draggable={false} className="size-8 select-none" />
        : <Camera className="size-7" aria-hidden="true" />}
    </button>
  );
}

/** One of the three round actions under the AI card. */
function RoundAction({ icon: Icon, label, tone, onClick }: { icon: LucideIcon; label: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl p-2 text-sm font-semibold outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100">
      <span className={cn("grid size-14 place-items-center rounded-full text-white", tone)}><Icon className="size-6" aria-hidden="true" /></span>
      {label}
    </button>
  );
}

/** A section card with its lock (no profile yet): a tap leads to that profile's identification. */
function LockedSection({ icon: Icon, label, hint, tone, onClick }: { icon: LucideIcon; label: string; hint: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-28 flex-col items-center justify-start gap-2 rounded-2xl bg-muted/60 p-3 pt-4 text-center text-sm font-semibold outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100">
      <span className={cn("relative grid size-12 shrink-0 place-items-center rounded-full text-white", tone)}>
        <Icon className="size-6" aria-hidden="true" />
        <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-foreground text-background ring-2 ring-card"><Lock className="size-3.5" aria-hidden="true" /></span>
      </span>
      <span>{label}<span className="block text-xs font-normal text-muted-foreground">{hint}</span></span>
    </button>
  );
}

/**
 * The camera sheet, mounted once in the app frame. It rises from the bottom on phones. With a professional profile it
 * goes straight to that profile's project (no "where?" question: the other section is locked anyway): the big
 * Fotocamera AI card with the project's place, then Foto, Video and Galleria. Off the project's page the AI camera
 * opens there by itself; Foto, Video and Galleria open the page and the sheet again (the phone's camera needs a tap on
 * the page that shows the photos). With no profile it shows the two sections locked, each leading to its identification.
 */
export function CameraSheet() {
  const open = useCameraSheetOpen();
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const proId = useProId();
  const lab = useLab();
  const kind: Kind | null = proId ? (proId.kind === "funzionario" ? "urban" : "vineyard") : null;
  const page = kind === "urban" ? "/urbano" : "/vigneto";
  const here = kind !== null && kindOf(pathname) === kind;
  const place = kind ? splitLocation((kind === "urban" ? lab.urban : lab.vineyard).location.label).name : "";
  const { signedIn, aiReady } = useAiReady();
  const close = () => setCameraSheetOpen(false);
  const openPage = () => void navigate({ to: page, replace: pathname !== "/" && pathname !== "/benvenuto" });
  // Closing the sheet steps history back: what comes next waits for that Back to land (else it would undo a navigation,
  // and the AI camera would read it as "close").
  const afterClose = (next: () => void) => {
    // One more beat after the Back: a panel opened in the same task could still see it and close at once.
    let done = false;
    const go = () => { if (done) return; done = true; window.removeEventListener("popstate", go); window.clearTimeout(timer); window.setTimeout(next, 60); };
    const timer = window.setTimeout(go, 400);
    window.addEventListener("popstate", go);
    close();
  };
  // Called inside the tap: the system camera and the file picker need the user gesture.
  const start = (action: CaptureAction) => {
    if (!kind) return;
    if (action === "ai") {
      // The AI camera opens only once the sheet's history entry is gone (its fullscreen falls back to the dark bars).
      afterClose(() => {
        if (here) { if (!requestCapture(kind, "ai")) toast.error("Fotocamera non pronta, riprova tra un attimo"); return; }
        // Off the project's page: open it, then the AI camera once its media are ready (up to 4 s).
        openPage();
        const t0 = Date.now();
        const tryStart = () => { if (requestCapture(kind, "ai")) return; if (Date.now() - t0 < 4000) window.setTimeout(tryStart, 150); else toast.error("Fotocamera non pronta, riprova tra un attimo"); };
        window.setTimeout(tryStart, 150);
      });
      return;
    }
    if (!here) {
      // The phone's camera and file picker open only from a tap on the page that keeps the photos: go there and ask again.
      afterClose(() => { openPage(); window.setTimeout(() => setCameraSheetOpen(true), 350); });
      return;
    }
    if (!requestCapture(kind, action)) toast.error("Fotocamera non pronta, riprova tra un attimo");
    // The new photo or video lands under the simulation: show it.
    showSimMedia(kind);
    close();
  };
  const identify = (to: "/identificazione/funzionario" | "/identificazione/agronomo") => afterClose(() => void navigate({ to }));

  return (
    <Dialog open={open} onOpenChange={setCameraSheetOpen}>
      <DialogContent className="gap-4 p-5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2 sm:w-[min(440px,calc(100vw-1.5rem))] sm:rounded-2xl">
        <span className="mx-auto -mt-1 h-1.5 w-10 rounded-full bg-foreground/20 sm:hidden" aria-hidden="true" />
        <DialogHeader className="text-left">
          <DialogTitle>Fotocamera</DialogTitle>
          <DialogDescription>{kind ? (kind === "urban" ? "Foto e video della tua piazza" : "Foto e video del tuo vigneto") : "Per scattare, dicci chi sei"}</DialogDescription>
        </DialogHeader>
        {!kind ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <LockedSection icon={Building2} label="Piazza" hint="Per i funzionari del Comune" tone="bg-urban" onClick={() => identify("/identificazione/funzionario")} />
              <LockedSection icon={Grape} label="Vigneto" hint="Per gli agronomi" tone="bg-vine" onClick={() => identify("/identificazione/agronomo")} />
            </div>
            <p className="text-center text-xs text-muted-foreground">Tocca una sezione per identificarti: ci vuole un minuto.</p>
          </>
        ) : (
          <>
            {(aiReady || !signedIn || AI_STANDBY) && (
              <button type="button" disabled={signedIn && AI_STANDBY} onClick={() => (aiReady ? start("ai") : afterClose(openAccount))}
                className="relative flex items-center gap-4 overflow-hidden rounded-[1.25rem] border border-brand-turquoise/40 bg-[radial-gradient(120%_120%_at_0%_0%,color-mix(in_oklch,var(--brand-turquoise)_32%,transparent),transparent_60%)] bg-muted/60 p-4 text-left outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:active:scale-100 motion-reduce:active:scale-100">
                <span className="relative grid size-16 shrink-0 place-items-center rounded-full border-[3px] border-brand-turquoise bg-background shadow-[0_0_22px_color-mix(in_oklch,var(--brand-turquoise)_45%,transparent)]">
                  <img src={aiLogo} alt="" aria-hidden="true" className="size-8" />
                  {!aiReady && <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-foreground text-background ring-2 ring-card">{signedIn && AI_STANDBY ? <Pause className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}</span>}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-lg font-bold">Fotocamera AI{signedIn && AI_STANDBY && <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">In pausa</span>}</span>
                  <span className="block text-sm text-muted-foreground">{aiReady ? "Inquadra una pianta: la riconosce e calcola il fresco" : signedIn && AI_STANDBY ? "In pausa per ora: tornerà presto" : "Accedi per usarla"}</span>
                  {place && <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-turquoise/15 px-2.5 py-1 text-xs font-semibold text-brand-turquoise"><MapPin className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{place}</span></span>}
                </span>
              </button>
            )}
            <div className="grid grid-cols-3">
              <RoundAction icon={Camera} label="Foto" tone="bg-primary" onClick={() => start("photo")} />
              <RoundAction icon={Video} label="Video" tone="bg-danger" onClick={() => start("video")} />
              <RoundAction icon={Images} label="Galleria" tone="bg-ok" onClick={() => start("gallery")} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
