import { useLocation, useNavigate } from "@tanstack/react-router";
import { Building2, Camera, Grape, Lock, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstalledApp } from "@/lib/installed-app";
import { useSignedIn } from "@/lib/use-signed-in";
import { showSimMedia } from "@/views/v8/console";
import { deliverFiles, openAccount, requestCapture, setCameraSheetOpen, useCameraSheetOpen } from "@/lib/camera-dock";
import { useEffect } from "react";
import { useLabMedia } from "@/models/lab-media-store";
import { QuickCamera } from "@/views/QuickCamera";
import { cn } from "@/lib/utils";
import { useProId } from "@/lib/use-pro-id";
import { useLab } from "@/models/lab-store";
import { splitLocation } from "@/views/SimulationGrid";
import aiLogo from "@/assets/ai-logo.png";

type Kind = "urban" | "vineyard";
const kindOf = (pathname: string): Kind | null => (pathname === "/urbano" ? "urban" : pathname === "/vigneto" ? "vineyard" : null);

/** AI ready = signed in (or simulated in a preview) and, for real accounts, the installed app. */
function useAiReady() {
  const { signedIn, demo } = useSignedIn();
  const installed = useInstalledApp();
  return { signedIn, aiReady: signedIn && (installed || demo) };
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
 * The camera of the central button, mounted once in the app frame. With a professional profile it opens straight on
 * the live camera (views/QuickCamera) for that profile's project — no "where?" question, the other section is locked
 * anyway — and moves to the project's page underneath, whose photos keep what is shot. With no profile it is a sheet
 * rising from the bottom on phones with the two sections locked, each leading to its identification.
 */
export function CameraSheet() {
  const open = useCameraSheetOpen();
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const proId = useProId();
  const lab = useLab();
  const kind: Kind | null = proId ? (proId.kind === "funzionario" ? "urban" : "vineyard") : null;
  const media = useLabMedia(kind ?? "urban");
  const { signedIn, aiReady } = useAiReady();
  const close = () => setCameraSheetOpen(false);
  // Closing steps history back: what comes next waits for that Back to land (else it would undo a navigation, and the
  // AI camera would read it as "close").
  const afterClose = (next: () => void) => {
    const go = () => { window.removeEventListener("popstate", go); window.clearTimeout(timer); next(); };
    const timer = window.setTimeout(go, 400);
    window.addEventListener("popstate", go);
    close();
  };
  // With a profile the camera opens over the project's page, so its photos are there to take what is shot.
  useEffect(() => {
    if (!open || !kind || kindOf(pathname) === kind) return;
    void navigate({ to: kind === "urban" ? "/urbano" : "/vigneto", replace: pathname !== "/" && pathname !== "/benvenuto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  if (kind) {
    const place = splitLocation((kind === "urban" ? lab.urban : lab.vineyard).location.label).name;
    const last = media[0];
    return (
      <QuickCamera open={open} place={place} aiReady={aiReady} signedIn={signedIn}
        lastShot={last ? { url: last.url, video: last.kind === "video" } : null}
        onFile={(file) => {
          // The page's photos may still be mounting right after the camera opened it: try again for a few seconds.
          const t0 = Date.now();
          const hand = () => { if (deliverFiles(kind, [file])) return; if (Date.now() - t0 < 5000) window.setTimeout(hand, 200); else toast.error("Scatto non salvato, riprova"); };
          hand();
        }}
        onAi={() => afterClose(() => { if (!requestCapture(kind, "ai")) toast.error("Fotocamera non pronta, riprova tra un attimo"); })}
        // Inside the tap: the phone's file picker needs it.
        onGallery={() => { if (!requestCapture(kind, "gallery")) toast.error("Galleria non pronta, riprova tra un attimo"); showSimMedia(kind); close(); }}
        onLogin={() => { close(); openAccount(); }}
        onShowShots={() => { showSimMedia(kind); close(); }}
        onClose={close} />
    );
  }
  const identify = (to: "/identificazione/funzionario" | "/identificazione/agronomo") => afterClose(() => void navigate({ to }));
  return (
    <Dialog open={open} onOpenChange={setCameraSheetOpen}>
      <DialogContent className="gap-4 p-5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2 sm:w-[min(440px,calc(100vw-1.5rem))] sm:rounded-2xl">
        <span className="mx-auto -mt-1 h-1.5 w-10 rounded-full bg-foreground/20 sm:hidden" aria-hidden="true" />
        <DialogHeader className="text-left">
          <DialogTitle>Fotocamera</DialogTitle>
          <DialogDescription>Per scattare, dicci chi sei</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <LockedSection icon={Building2} label="Piazza" hint="Per i funzionari del Comune" tone="bg-urban" onClick={() => identify("/identificazione/funzionario")} />
          <LockedSection icon={Grape} label="Vigneto" hint="Per gli agronomi" tone="bg-vine" onClick={() => identify("/identificazione/agronomo")} />
        </div>
        <p className="text-center text-xs text-muted-foreground">Tocca una sezione per identificarti: ci vuole un minuto.</p>
      </DialogContent>
    </Dialog>
  );
}
