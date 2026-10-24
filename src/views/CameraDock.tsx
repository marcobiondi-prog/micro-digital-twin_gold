import { useLocation, useNavigate } from "@tanstack/react-router";
import { Building2, Camera, Grape, Images, Lock, Video, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstalledApp } from "@/lib/installed-app";
import { useSignedIn } from "@/lib/use-signed-in";
import { openAccount, requestCapture, setCameraSheetOpen, useCameraSheetOpen, type CaptureAction } from "@/lib/camera-dock";
import { cn } from "@/lib/utils";
import aiLogo from "@/assets/ai-logo.png";

type Kind = "urban" | "vineyard";
const kindOf = (pathname: string): Kind | null => (pathname === "/urbano" ? "urban" : pathname === "/vigneto" ? "vineyard" : null);

/** AI ready = signed in (or simulated in a preview) and, for real accounts, the installed app. */
function useAiReady() {
  const { signedIn, demo } = useSignedIn();
  const installed = useInstalledApp();
  return { signedIn, aiReady: signedIn && (installed || demo) };
}

/** Pulsante centrale: fotocamera per gli ospiti, logo AI dopo l'accesso. Apre il pannello con tutte le opzioni. */
export function CameraDockButton({ size = "large" }: { size?: "large" | "small" }) {
  const { aiReady } = useAiReady();
  const large = size === "large";
  return (
    <button
      type="button"
      onClick={() => setCameraSheetOpen(true)}
      aria-label={aiReady ? "Fotocamera AI e altre opzioni" : "Fotocamera: foto, video e galleria"}
      className={cn(
        "camera-dock-button relative grid shrink-0 place-items-center rounded-full text-primary-foreground outline-none transition-transform active:scale-95 focus-visible:ring-4 focus-visible:ring-ring/40 motion-reduce:active:scale-100",
        large ? "size-[4.25rem] shadow-lg ring-4 ring-background" : "size-9 shadow-sm",
        // The AI logo is blue and turquoise: it sits on a light face with a coloured rim.
        aiReady ? "border-[3px] border-primary bg-card" : "bg-primary",
      )}
    >
      {aiReady
        ? <img src={aiLogo} alt="" aria-hidden="true" draggable={false} className={cn("select-none", large ? "size-9" : "size-5")} />
        : <Camera className={large ? "size-8" : "size-5"} aria-hidden="true" />}
    </button>
  );
}

function Option({ icon: Icon, label, hint, onClick, tone, locked, wide }: { icon?: LucideIcon; label: string; hint?: string; onClick: () => void; tone: string; locked?: boolean; wide?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-transparent bg-muted/60 p-3 text-sm font-semibold outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100", wide && "col-span-3 flex-row justify-start gap-4 px-4 text-base", locked && "opacity-80")}>
      <span className={cn("relative grid size-12 shrink-0 place-items-center rounded-full text-white", tone)}>
        {Icon ? <Icon className="size-6" aria-hidden="true" /> : <img src={aiLogo} alt="" aria-hidden="true" className="size-7" />}
        {locked && <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-foreground text-background ring-2 ring-card"><Lock className="size-3.5" aria-hidden="true" /></span>}
      </span>
      <span className={cn("min-w-0", wide && "text-left")}>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

/** Pannello unico della fotocamera, montato una volta nella cornice dell'app. */
export function CameraSheet() {
  const open = useCameraSheetOpen();
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const kind = kindOf(pathname);
  const { signedIn, aiReady } = useAiReady();
  const close = () => setCameraSheetOpen(false);
  // Called inside the tap: the system camera and the file picker need the user gesture.
  const start = (action: CaptureAction) => {
    if (!kind) return;
    if (action === "ai") {
      // Closing the sheet steps history back; the AI camera reads that Back as "close", so it
      // opens only once the sheet's history entry is gone (its fullscreen falls back to the dark bars).
      const go = () => { window.removeEventListener("popstate", go); window.clearTimeout(timer); if (!requestCapture(kind, "ai")) toast.error("Fotocamera non pronta, riprova tra un attimo"); };
      const timer = window.setTimeout(go, 400);
      window.addEventListener("popstate", go);
      close();
      return;
    }
    if (!requestCapture(kind, action)) toast.error("Fotocamera non pronta, riprova tra un attimo");
    close();
  };
  const goTo = (to: "/urbano" | "/vigneto") => void navigate({ to, replace: pathname !== "/" });

  return (
    <Dialog open={open} onOpenChange={setCameraSheetOpen}>
      <DialogContent className="w-[min(440px,calc(100vw-1.5rem))] gap-4 rounded-2xl p-5">
        <DialogHeader className="text-left">
          <DialogTitle>Fotocamera</DialogTitle>
          <DialogDescription>{kind ? (kind === "urban" ? "Foto e video della piazza" : "Foto e video del vigneto") : "Dove vuoi scattare?"}</DialogDescription>
        </DialogHeader>
        {!kind ? (
          <div className="grid grid-cols-2 gap-2">
            <Option icon={Building2} label="Piazza" tone="bg-urban" onClick={() => goTo("/urbano")} />
            <Option icon={Grape} label="Vigneto" tone="bg-vine" onClick={() => goTo("/vigneto")} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {aiReady
              ? <Option wide label="Fotocamera AI" hint="Riconosce piante e terreno" tone="border-[3px] border-primary bg-card" onClick={() => start("ai")} />
              : !signedIn && <Option wide locked label="Fotocamera AI" hint="Accedi per usarla" tone="bg-muted-foreground" onClick={() => { close(); openAccount(); }} />}
            <Option icon={Camera} label="Foto" tone="bg-primary" onClick={() => start("photo")} />
            <Option icon={Video} label="Video" tone="bg-danger" onClick={() => start("video")} />
            <Option icon={Images} label="Galleria" tone="bg-ok" onClick={() => start("gallery")} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
