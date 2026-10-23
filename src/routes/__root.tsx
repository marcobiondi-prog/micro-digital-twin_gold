import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useLocation, useNavigate, HeadContent, Scripts, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/views/theme-toggle";
import { AccountControl } from "@/views/account-control";
import { TwinMascot } from "@/views/TwinMascot";
import { syncAppOrientation } from "@/lib/ar-orientation";
import { isTouchDevice, markTouchDevice } from "@/lib/touch-device";
import { installUiClicks } from "@/lib/ui-sounds";
import { reloadFresh } from "@/router";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Pagina non trovata</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Torna alla home</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  console.error(error);
  useEffect(() => {
    const msg = String((error as Error)?.message ?? error);
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
      const last = Number(sessionStorage.getItem("chunk-reload-at") ?? 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem("chunk-reload-at", String(Date.now()));
        void reloadFresh();
        return;
      }
    }
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">La pagina non si è caricata</h1>
        {/* The technical reason, small, so a screenshot is enough to diagnose the failure. */}
        <p className="mt-2 break-words text-xs text-muted-foreground">{String((error as Error)?.message ?? error).slice(0, 160)}</p>
        <button onClick={() => void reloadFresh()} className="mt-6 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Riprova</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "MICRO DIGITAL TWIN" },
      { name: "description", content: "Micro digital twin per l'adattamento climatico urbano e vitivinicolo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#ffffff" },
      // iPhone/iPad "Aggiungi a Home": full-screen app with its own name and a light status bar.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Digital Twin" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Keep history flat: going Home from a simulation steps back instead of pushing,
// so the back gesture from Home leaves the app.
function goHomeBack(e: { preventDefault: () => void }, to: string, pathname: string) {
  if (to !== "/" || pathname === "/") return false;
  if ((window.history.state?.__TSR_index ?? 0) > 0) {
    e.preventDefault();
    window.history.back();
    return true;
  }
  return false;
}

// The landing guard below must act only on a real page load, not on the
// re-hydration a hot reload performs inside the same document.

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    // No pinch-zoom on phones or tablets. user-scalable=no is ignored by iPadOS Safari, by
    // Android tablets in desktop mode and by Windows touch (Surface), so pinch is also blocked
    // here: iOS gesture events, iOS two-finger scale moves, and the ctrl+wheel that touchpad and
    // touchscreen pinch produce on touch devices (styles.css adds touch-action: pan-x pan-y).
    // Interactive maps ([data-map-gestures], the 3D view) keep their own pinch and rotate.
    const inMap = (e: Event) => e.target instanceof Element && e.target.closest("[data-map-gestures]") !== null;
    const block = (e: Event) => { if (!inMap(e)) e.preventDefault(); };
    const scaleMove = (e: TouchEvent) => { const scale = (e as TouchEvent & { scale?: number }).scale; if (!inMap(e) && e.touches.length > 1 && scale !== undefined && scale !== 1) e.preventDefault(); };
    const pinchWheel = (e: WheelEvent) => { if (e.ctrlKey && isTouchDevice()) e.preventDefault(); };
    document.addEventListener("gesturestart", block);
    document.addEventListener("gesturechange", block);
    document.addEventListener("touchmove", scaleMove, { passive: false });
    window.addEventListener("wheel", pinchWheel, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
      document.removeEventListener("touchmove", scaleMove);
      window.removeEventListener("wheel", pinchWheel);
    };
  }, []);
  useEffect(() => {
    const landed = window as typeof window & { __mdtLanded?: boolean };
    if (landed.__mdtLanded) return;
    landed.__mdtLanded = true;
    // Back from Google, an email confirmation or a password-recovery link: turn the
    // one-time ?code= into a session first, then clean the URL. Cleaning it earlier
    // (the redirects below) would drop the code and leave the user signed out.
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const code = query.get("code");
    const authError = query.get("error_description") ?? fragment.get("error_description");
    if (code || authError) {
      void (async () => {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) toast.error(`Accesso non riuscito: ${error.message}`);
        } else {
          toast.error(`Accesso non riuscito: ${authError}`);
        }
        const back = sessionStorage.getItem("mdt-auth-return");
        sessionStorage.removeItem("mdt-auth-return");
        void navigate({ href: back ?? window.location.pathname, replace: true });
      })();
      return;
    }
    // A fresh open of the app always lands on the Panoramica (/). This effect
    // runs once per document load, so only the opening page redirects; in-app
    // navigation to /urbano and /vigneto keeps working as before.
    // The move waits a beat: leaving the page while its data is still arriving
    // pulls a match out of the router mid-render and the router throws on a
    // missing routeId.
    // Returning from sign-in keeps the user in the section they left.
    const back = sessionStorage.getItem("mdt-auth-return");
    if (back) {
      sessionStorage.removeItem("mdt-auth-return");
      if (back !== location.pathname + location.searchStr) {
        const id = setTimeout(() => void navigate({ href: back, replace: true }), 250);
        return () => clearTimeout(id);
      }
      return;
    }
    if (location.pathname === "/" || location.pathname === "/index" || location.pathname === "/reset-password") return;
    const id = setTimeout(() => void navigate({ to: "/", replace: true }), 250);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    // Surface Pro-like hybrids: expose real touch capability as a class-independent
    // attribute, so the AI camera controls are not hidden behind pointer queries.
    markTouchDevice();
    void import("@/lib/register-sw").then((m) => m.registerServiceWorker());
  }, []);
  // Soft keyboard-style tap on every button across the app.
  useEffect(() => installUiClicks(), []);
  useEffect(() => {
    const lock = () => {
      void syncAppOrientation();
    };
    lock();
    window.addEventListener("ar-orientation-change", lock);
    window.addEventListener("orientationchange", lock);
    window.addEventListener("resize", lock);
    document.addEventListener("visibilitychange", lock);
    document.addEventListener("pointerdown", lock, { passive: true });
    return () => {
      window.removeEventListener("ar-orientation-change", lock);
      window.removeEventListener("orientationchange", lock);
      window.removeEventListener("resize", lock);
      document.removeEventListener("visibilitychange", lock);
      document.removeEventListener("pointerdown", lock);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[9999999999] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Salta al contenuto principale
      </a>
      <header id="app-header" className="border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link to="/" onClick={(e) => goHomeBack(e, "/", location.pathname)} className="flex min-w-0 items-center gap-1.5 font-display text-base font-semibold sm:gap-2 sm:text-xl">
              <span className="header-logo-frame grid h-12 w-14 shrink-0 place-items-center sm:h-14 sm:w-16">
                <TwinMascot className="header-logo block h-full w-full" />
              </span>
              <span className="truncate whitespace-nowrap">MICRO DIGITAL <span className="text-brand-turquoise">TWIN</span></span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2"><ThemeToggle /><AccountControl /></div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="app-main mx-auto max-w-7xl px-4 py-8 focus:outline-none"><Outlet /></main><Toaster />
      <footer className="mx-auto max-w-7xl px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:pb-10">
        I risultati del simulatore sono indicativi e non sostituiscono modelli fisici calibrati.
      </footer>
    </QueryClientProvider>
  );
}
