import { historyHome } from "@/lib/back-to";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UpdatePill } from "@/views/UpdatePill";
import { Outlet, Link, createRootRouteWithContext, useLocation, useNavigate, useRouter, HeadContent, Scripts, type ErrorComponentProps } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHomeFocus } from "@/lib/home-focus";
import { introSeen } from "@/lib/intro-seen";
import { PREVIEW_BUILD } from "@/lib/demo-login";
import { THEME_DARK, ThemeToggle, themeBootScript } from "@/views/theme-toggle";
import { AccountControl } from "@/views/account-control";
import { CameraDockButton, CameraSheet } from "@/views/CameraDock";
import { PermissionsSheet } from "@/views/v10/Permissions";
// The sector page is loaded after the first paint (it covers the app only with no profile, or when asked).
const SectorGate = lazy(() => import("@/views/v10/SectorGate").then((m) => ({ default: m.SectorGate })));
import { syncAppOrientation } from "@/lib/ar-orientation";
import { isTouchDevice, markTouchDevice } from "@/lib/touch-device";
import { installUiClicks } from "@/lib/ui-sounds";
import { isChunkError, reloadFresh } from "@/router";
import { History, Building2, Grape, Info, LayoutDashboard, Lock, UserRound } from "lucide-react";
import { clearLockAsk, dropProIdOnDevice, getProId, openingSettled, readLockAsk, rememberWantedSector, useGuest, useProId, useSyncProId } from "@/lib/use-pro-id";
import { installAccountSessions, leaveAccount } from "@/lib/account-sessions";
import { useBiometricAutoEnter } from "@/views/v10/Biometric";
import { useSyncMediaArchive } from "@/models/media-archive";
import { useSyncHistoryArchive } from "@/models/history-archive";
import { useSyncSimHidden } from "@/models/sim-hidden";
import { useRegisterDevice } from "@/lib/account-devices";
import { useMediaSync } from "@/lib/use-media-sync";
import { useDstNotice } from "@/lib/dst-notice";
import { installAppPermissionGuards, usePermissions } from "@/lib/app-permissions";
import { installGoogleUsageSync } from "@/lib/google-usage-sync";
import { hidePreloader, preloadNext, preloaderScript } from "@/lib/preloader";
import { unlocks, type ProId } from "@/models/professional-id";
import { AgronomoIcon, FunzionarioIcon } from "@/views/ProfileIcon";
import { AmbientLayer, openSimTab } from "@/views/v8/console";

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
    if (isChunkError(msg)) {
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
      { name: "description", content: "Micro digital twin per l’adattamento climatico urbano e vitivinicolo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: THEME_DARK },
      // iPhone/iPad "Aggiungi a Home": full-screen app with its own name and a dark status bar that matches the canvas.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Digital Twin" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      // With credentials: protected preview deployments answer the manifest only with the visitor's cookie,
      // otherwise the browser gets the sign-in page instead and does not offer to install the app.
      { rel: "manifest", href: "/manifest.webmanifest", crossOrigin: "use-credentials" },
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
    <html lang="it" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <head><HeadContent /><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: preloaderScript }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const nav: ReadonlyArray<{ to: "/benvenuto" | "/urbano" | "/vigneto" | "/dashboard" | "/profilo"; l: string }> = [
  { to: "/benvenuto", l: "Benvenuto" },
  { to: "/urbano", l: "Simulazione urbana" },
  { to: "/vigneto", l: "Simulazione vigneto" },
  { to: "/dashboard", l: "Dashboard" },
];
/** The desktop pills follow the bottom bar: the locked section gives its place to Profilo once a profile is identified. */
const navFor = (id: ProId | null | undefined, guest = false) => {
  // A guest (no profile, both simulations open, nothing saved) has its badge where Benvenuto was.
  if (guest && !id) return nav.map((n) => (n.to === "/benvenuto" ? { to: "/profilo" as const, l: "Ospite" } : n));
  if (!id) return nav;
  const locked = id.kind === "agronomo" ? "/urbano" : "/vigneto";
  return nav.map((n) => (n.to === locked ? { to: "/profilo" as const, l: id.kind === "agronomo" ? "Profilo agricoltore" : "Profilo funzionario" } : n));
};

const NAV_H = 49;

type NavItem = { to: "/benvenuto" | "/urbano" | "/vigneto" | "/dashboard" | "/profilo"; l: string; I: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean | "true" }> };
const KIND_ICON = { agronomo: AgronomoIcon, funzionario: FunzionarioIcon } as const;
const bottomItems: readonly NavItem[] = [
  { to: "/benvenuto", l: "Cronologia", I: History },
  { to: "/urbano", l: "Urbano", I: Building2 },
  { to: "/vigneto", l: "Vigneto", I: Grape },
  { to: "/dashboard", l: "Dashboard", I: LayoutDashboard },
];
/**
 * Once a profile is identified, the section it locks gives its place to that profile's badge (same column): the
 * agronomist's leaf badge where Urbano was, the municipal officer's town-hall badge where Vigneto was; it opens that
 * profile's page (/profilo). With no profile both sections stay, locked.
 */
function itemsFor(id: ProId | null | undefined, guest = false): readonly NavItem[] {
  if (guest && !id) return bottomItems.map((b) => (b.to === "/benvenuto" ? { to: "/profilo", l: "Ospite", I: UserRound } : b));
  if (!id) return bottomItems;
  const locked = id.kind === "agronomo" ? "/urbano" : "/vigneto";
  return bottomItems.map((b) => (b.to === locked ? { to: "/profilo", l: id.kind === "agronomo" ? "Agricoltore" : "Funzionario", I: KIND_ICON[id.kind] } : b));
}
/** Pages that light the Profilo item: the profile page and the identification pages. */
const isProfilePath = (p: string) => p === "/profilo" || p.startsWith("/identificazione");

// Keep history flat: sections replace each other, so the back gesture from
// any section returns to Home instead of the previously visited tab.
function goHomeBack(e: { preventDefault: () => void }, to: string, pathname: string) {
  if (to !== "/" || pathname === "/") return false;
  if ((window.history.state?.__TSR_index ?? 0) > 0) {
    e.preventDefault();
    window.history.back();
    return true;
  }
  return false;
}

// Where the selection light sits for each of the five columns on the 108 px bar: the crescent edge
// "M0 74 Q50 52 100 74" (viewBox 100×90) is y = 74 − 44·t(1 − t); tilt = its tangent on a ~390 px wide phone.
const PS_LIGHT: Record<number, { left: string; top: string; tilt: string }> = {
  0: { left: "10%", top: "81.5px", tilt: "-6deg" },
  1: { left: "30%", top: "75.5px", tilt: "-3deg" },
  3: { left: "70%", top: "75.5px", tilt: "3deg" },
  4: { left: "90%", top: "81.5px", tilt: "6deg" },
};

// The icons follow the arch's top edge (M0 22 Q50 2 100 22 on the 108 px bar): the outer columns sit lower by the
// curve's drop between 10 % and 30 % (≈ 6 px) and each icon tilts with the edge's tangent, like the light on the crescent.
const ARC: Record<number, { y: number; tilt: number }> = { 0: { y: 6, tilt: -6 }, 1: { y: 0, tilt: -3 }, 3: { y: 0, tilt: 3 }, 4: { y: 6, tilt: 6 } };

/** Elements a tap belongs to, so it never lowers the bottom bar. */
const TAP_OWNERS = "a,button,input,select,textarea,label,summary,option,video,canvas,[contenteditable],[role=button],[role=link],[role=slider],[role=tab],[role=radio],[role=checkbox],[role=switch],[role=menuitem],[role=option],[role=combobox],[role=dialog],[role=alertdialog],[data-map-gestures],[data-sys-camera-root],[data-no-nav-tap],nav,.maplibregl-map";
/** True when a tap landed on an empty part of the page: no control, field, map or dialog under it, nothing clickable. */
function emptyTap(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest(TAP_OWNERS)) return false;
  if (document.documentElement.hasAttribute("data-sys-camera")) return false;
  // Clickable cards and rows wear a pointer cursor even without a button role.
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    if (getComputedStyle(el).cursor === "pointer") return false;
  }
  return true;
}

function BottomNav() {
  const proId = useProId();
  const guest = useGuest() && !proId;
  const pathname = useLocation({ select: (l) => l.pathname });
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    // Hide the bar while scrolling down, bring it back on the first upward
    // move. A minimum downward distance avoids jitter from small scroll bumps.
    let lastY = window.scrollY;
    let downDist = 0;
    let lastReflow = -1e9;
    const ro = new ResizeObserver(() => {
      // Any layout change (content mounting, switching Lab flow) marks a brief
      // window in which a scroll jump is the browser clamping the position,
      // not a finger swipe.
      lastReflow = performance.now();
    });
    ro.observe(document.documentElement);
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (y <= 0) {
        downDist = 0;
        setHidden(false);
        return;
      }
      if (dy > 0) {
        downDist += dy;
        if (downDist > 48) setHidden(true);
      } else if (dy < -2) {
        if (performance.now() - lastReflow < 250) return;
        downDist = 0;
        setHidden(false);
      }
    };
    // A still tap on an empty part of the screen (touch or pen) lowers the bar for more room, another one brings it
    // back. Taps on controls, fields, maps, dialogs and the bar itself never toggle it.
    let down: { x: number; y: number; t: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = e.pointerType === "mouse" || !e.isPrimary ? null : { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || performance.now() - d.t > 500) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
      if (!emptyTap(e.target)) return;
      setHidden((h) => !h);
    };
    const onCancel = () => { down = null; };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      ro.disconnect();
    };
  }, [pathname]);
  // A new page always starts with the bar up.
  useEffect(() => setHidden(false), [pathname]);
  const items = itemsFor(proId, guest);
  const item = ({ to, l, I }: NavItem, index: number) => {
    const active = pathname === to || ((pathname.startsWith("/cronologia") || pathname === "/archivio") && to === historyHome(pathname === "/archivio" ? "/archivio" : "/cronologia")) || (to === "/profilo" && isProfilePath(pathname));
    // Piazza and vineyard wear a small lock until the profile that opens them is identified.
    const locked = !guest && (to === "/urbano" || to === "/vigneto") && proId !== undefined && !unlocks(proId, to === "/urbano" ? "urban" : "vineyard");
    const col = index < 2 ? index : index + 1, arc = ARC[col];
    return (
      <li key={to} style={arc ? { transform: `translateY(${arc.y}px) rotate(${arc.tilt}deg)` } : undefined}>
        <Link to={to} replace={pathname !== "/"} aria-current={active ? "page" : undefined} aria-label={to === "/profilo" ? (guest ? "Profilo ospite" : `Profilo ${l.toLowerCase()}`) : locked ? `${l}, bloccato` : l}
          onClick={(e) => {
            if (goHomeBack(e, to, pathname)) return;
            if (!active) return;
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
          className="ps-nav-item" data-active={active || undefined}>
          <span className="ps-nav-icon relative"><I className="size-6" strokeWidth={2} aria-hidden="true" />{locked && <Lock className="absolute -bottom-1 -right-2 size-3.5 rounded-full bg-background p-[1px]" strokeWidth={2.5} aria-hidden="true" />}</span>
        </Link>
      </li>
    );
  };
  // The Cronologia page belongs to Benvenuto: its item stays lit there.
  const navPath = pathname.startsWith("/cronologia") || pathname === "/archivio" ? historyHome(pathname === "/archivio" ? "/archivio" : "/cronologia") : isProfilePath(pathname) ? "/profilo" : pathname;
  const index = items.findIndex((b) => b.to === navPath);
  const current = items[index];
  // On Home the bar points at the tile selected there: the light slides under Urbano or Vigneto, or the camera lights up.
  const homeFocus = useHomeFocus();
  const focusing = pathname === "/" && homeFocus !== null;
  const focusCol = homeFocus === "urban" ? 1 : homeFocus === "vine" ? 3 : null;
  // The selection light rides the edge of the lower crescent: grid column (the camera owns column 2), its height on the curve and the tangent's tilt.
  const light = focusing ? (focusCol === null ? null : PS_LIGHT[focusCol]) : index < 0 ? null : PS_LIGHT[index < 2 ? index : index + 1];
  const caption = focusing ? (homeFocus === "camera" ? "Fotocamera AI" : homeFocus === "urban" ? "Urbano" : "Vigneto") : current?.l ?? "";
  return (
    <nav aria-label="Menu principale" className={`ps-nav fixed inset-x-0 bottom-0 z-[999999998] transition-transform duration-300 motion-reduce:transition-none sm:hidden ${hidden ? "translate-y-[calc(100%-3px)]" : "translate-y-0"}`}>
      {/* PlayStation-app slab: a frosted slate arch for the icons with a darker crescent laid over its foot; a straight light slides along the crescent's edge under the open page, whose name sits in the crescent; the AI camera rises in the middle. */}
      <div className="relative h-[108px]">
        <div className="ps-nav-glass pointer-events-none absolute inset-0" aria-hidden="true" />
        <svg className="ps-nav-bg pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 90" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="ps-nav-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3d4552" stopOpacity="0.86" /><stop offset="1" stopColor="#232831" stopOpacity="0.94" /></linearGradient>
            <linearGradient id="ps-nav-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a1d24" /><stop offset="0.45" stopColor="#121419" /><stop offset="1" stopColor="#0e1014" /></linearGradient>
            <linearGradient id="ps-nav-edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0.08" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.32" /><stop offset="1" stopColor="#fff" stopOpacity="0.08" /></linearGradient>
          </defs>
          <path d="M0 22 Q50 2 100 22 V90 H0 Z" fill="url(#ps-nav-fill)" />
          <path d="M0 22 Q50 2 100 22" fill="none" stroke="url(#ps-nav-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path className="ps-nav-crescent" d="M0 74 Q50 52 100 74 V90 H0 Z" fill="url(#ps-nav-band)" />
          <path d="M0 74 Q50 52 100 74" fill="none" stroke="url(#ps-nav-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        {light && <span className="ps-nav-light" style={{ left: light.left, top: light.top, "--ps-tilt": light.tilt } as CSSProperties} aria-hidden="true" />}
        <ul className="relative grid grid-cols-5 items-start pt-6">
          {items.slice(0, 2).map((b, i) => item(b, i))}
          <li className="flex justify-center"><CameraDockButton focused={focusing && homeFocus === "camera"} /></li>
          {items.slice(2).map((b, i) => item(b, i + 2))}
        </ul>
        <p className="relative h-8 text-center text-[13px] font-medium leading-8 tracking-wide text-white/90" aria-hidden="true">{caption}</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[env(safe-area-inset-bottom)] bg-[#0e1014]" aria-hidden="true" />
    </nav>
  );
}

function SmartNav() {
  const proId = useProId();
  const guest = useGuest() && !proId;
  const [pinned, setPinned] = useState(false);
  const [placeholderTop, setPlaceholderTop] = useState(0);
  useEffect(() => {
    // Tablet/desktop: the logo header scrolls away with the page, so the
    // pinned menu only ever needs its own height.
    document.documentElement.style.setProperty("--nav-h", pinned ? `${NAV_H}px` : "0px");
    return () => document.documentElement.style.setProperty("--nav-h", "0px");
  }, [pinned]);
  useEffect(() => {
    const ph = document.getElementById("smart-nav-slot");
    let lastY = window.scrollY;
    let upDist = 0;
    let cur = false;
    const set = (next: boolean) => {
      if (next === cur) return;
      cur = next;
      setPinned(next);
    };
    const update = () => {
      const top = ph ? ph.getBoundingClientRect().top + window.scrollY : 0;
      setPlaceholderTop(top);
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      // Back in the natural slot: let the menu flow with the page.
      if (y <= top) { upDist = 0; set(false); return; }
      if (dy > 0) { upDist = 0; set(false); }
      else if (dy < 0) { upDist -= dy; if (upDist > 24) set(true); }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.setProperty("--nav-h", "0px");
    };
  }, []);
  void placeholderTop;
  const navRef = useRef<HTMLElement>(null);
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    // Center the active item on every page change. This is the single place
    // that scrolls on navigation, so it never fights the tap handler below.
    // The active marker is applied after the route commits, so measure on the
    // next frame (and match by href as a fallback) instead of right away.
    const nav = navRef.current;
    if (!nav) return;
    const frame = requestAnimationFrame(() => {
      const active =
        nav.querySelector<HTMLElement>('[data-status="active"]') ??
        nav.querySelector<HTMLElement>(`a[href="${pathname}"]`);
      if (!active) return;
      const n = nav.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      nav.scrollTo({ left: nav.scrollLeft + (a.left - n.left) - (n.width - a.width) / 2, behavior: reduce ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  // Tapping the item that is already active (e.g. Home again) does not
  // change the pathname, so the effect above would not run; center it here.
  // Taps on other items are centered by the effect once the route changes.
  const centerTapped = (el: HTMLElement, isActive: boolean) => {
    if (!isActive) return;
    const nav = navRef.current;
    if (!nav) return;
    const n = nav.getBoundingClientRect();
    const a = el.getBoundingClientRect();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nav.scrollTo({ left: nav.scrollLeft + (a.left - n.left) - (n.width - a.width) / 2, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div id="smart-nav-slot" style={{ height: NAV_H }}>
      <div
        className={`${pinned ? "fixed inset-x-0 top-0 animate-in slide-in-from-top duration-300 backdrop-blur-xl" : "relative"} z-[999999999] isolate bg-transparent motion-reduce:animate-none`}
        style={{ height: NAV_H }}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-1 px-2 sm:px-4">
          <nav
            ref={navRef}
            aria-label="Menu principale"
            className="no-scrollbar min-w-0 touch-pan-x overflow-x-auto"
          >
            <div className="flex items-center gap-1">
              {navFor(proId, guest).map((n) => (
                <Link key={n.to} to={n.to}
                  aria-current={pathname === n.to || (n.to === "/profilo" && isProfilePath(pathname)) ? "page" : undefined}
                  replace={pathname !== "/"}
                  onClick={(e) => { if (goHomeBack(e, n.to, pathname)) return; centerTapped(e.currentTarget, pathname === n.to); }}
                  className={`nav-glass nav-glass-gloss relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${pathname === n.to ? "nav-glass-on bg-nav-accent text-nav-accent-foreground" : "text-muted-foreground dark:text-nav-accent-foreground"}`}>
                  {n.l}{!guest && (n.to === "/urbano" || n.to === "/vigneto") && proId !== undefined && !unlocks(proId, n.to === "/urbano" ? "urban" : "vineyard") && <Lock className="ml-1 inline size-3.5 align-[-2px]" aria-label="bloccato" />}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

// The landing guard below must act only on a real page load, not on the
// re-hydration a hot reload performs inside the same document.

function RootComponent() {
  // The professional profile follows the account: adopted on sign-in, or uploaded to an account without one.
  useSyncProId();
  // Every personal account used on this phone is kept, so a recognised profile enters its account in one tap.
  useEffect(() => { installAccountSessions(); }, []);
  // Signed out with a profile that has Face ID / fingerprint on: the recognition is asked at once to enter it.
  useBiometricAutoEnter();
  useSyncMediaArchive();
  useSyncHistoryArchive();
  useSyncSimHidden();
  useMediaSync();
  // This device registers itself in the account's "Dispositivi collegati".
  useRegisterDevice();
  useDstNotice();
  // A permission changed in the phone's settings is said once on return to the app.
  usePermissions(true);
  // Position and camera revoked inside the app are refused whoever asks for them.
  useEffect(() => { installAppPermissionGuards(); installGoogleUsageSync(); }, []);
  // The index's preloader goes once the app has started and its fonts are in.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
    // It also waits for the app to land on its page (from "/" to the profile's simulation) and for the account's
    // profile to be read, so no in-between screen (the empty "/", another page, the sector page) shows for a moment.
    // At most 4 s in all, then it goes anyway.
    const landed = new Promise<void>((resolve) => {
      const start = Date.now();
      const check = () => {
        const onIndex = window.location.pathname === "/";
        const tutorial = onIndex && (!introSeen() || PREVIEW_BUILD || /[?&](rivedi|scenario)=/.test(window.location.search));
        if (!onIndex || tutorial || Date.now() - start > 3000) resolve(); else setTimeout(check, 60);
      };
      check();
    });
    const settled = Promise.all([Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]), landed, openingSettled])
      .then(() => new Promise((r) => setTimeout(r, 250)));
    void Promise.race([settled, new Promise((r) => setTimeout(r, /[?&]code=/.test(window.location.search) ? 7000 : 4000))]).then(() => requestAnimationFrame(hidePreloader));
  }, []);
  // The other pages' code is fetched once the app is idle, so moving between them never waits for the network
  // (on a first open, before the offline worker has cached anything, a page appeared in jumps while its file came in).
  const router = useRouter();
  useEffect(() => {
    const warm = () => {
      for (const id of ["/benvenuto", "/urbano", "/vigneto", "/dashboard", "/cronologia", "/archivio", "/profilo", "/scegli", "/"]) {
        const route = (router.routesById as unknown as Record<string, unknown>)[id];
        if (route) void router.loadRouteChunk(route as Parameters<typeof router.loadRouteChunk>[0])?.catch(() => {});
      }
    };
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    const t = w.requestIdleCallback ? w.requestIdleCallback(warm, { timeout: 2500 }) : window.setTimeout(warm, 1200);
    return () => { if (!w.requestIdleCallback) window.clearTimeout(t); };
  }, [router]);
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const location = useLocation();
  const slidePath = useRef<string | null>(null);
  useLayoutEffect(() => {
    // Every page opens sliding in from the right towards the left, like a page pushed on a phone (laid out before
    // paint, so it never shows at rest first); none on the app's first page nor with reduced motion.
    const prev = slidePath.current;
    slidePath.current = location.pathname;
    const main = document.getElementById("main-content");
    if (!prev || prev === location.pathname || !main || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    main.animate([{ transform: "translate3d(100%,0,0)", opacity: 0.6 }, { transform: "translate3d(0,0,0)", opacity: 1 }], { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [location.pathname]);
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
  // Entering an account or a profile moves the app in place (lib/app-nav goInApp), never with a reload: the lists are
  // read again for the account, and the simulation opens on its map.
  useEffect(() => {
    const go = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      if (typeof href !== "string") return;
      void queryClient.invalidateQueries();
      if (href.startsWith("/vigneto")) openSimTab("vineyard", "mappa");
      else if (href.startsWith("/urbano")) openSimTab("urban", "mappa");
      void navigate({ href, replace: true });
    };
    window.addEventListener("mdt-go", go);
    return () => window.removeEventListener("mdt-go", go);
  }, [navigate, queryClient]);
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
          // Signed in: once the account's profile is read, straight into its simulation (no sector page between).
          else await Promise.race([openingSettled, new Promise((r) => setTimeout(r, 6000))]);
        } else {
          toast.error(`Accesso non riuscito: ${authError}`);
        }
        const back = localStorage.getItem("mdt-auth-return");
        localStorage.removeItem("mdt-auth-return");
        const pro = getProId();
        if (pro) openSimTab(pro.kind === "agronomo" ? "vineyard" : "urban", "mappa");
        const target = pro ? (pro.kind === "agronomo" ? "/vigneto" : "/urbano") : back ?? window.location.pathname;
        // Google's pages stand in the history behind this one: step back past them to the page before the sign-in and
        // open the app from there (the push drops them), so the phone's Back never lands on Google's account chooser.
        let hist: { n?: number; at?: number } | null = null;
        try { hist = JSON.parse(localStorage.getItem("mdt-auth-hist") ?? "null"); localStorage.removeItem("mdt-auth-hist"); } catch { /* none */ }
        const delta = hist?.n && Date.now() - (hist.at ?? 0) < 15 * 60_000 ? (hist.n - 2) - (window.history.length - 1) : 0;
        if (hist?.n && hist.n >= 2 && delta < 0 && delta >= -25) {
          try { localStorage.setItem("mdt-after-google", JSON.stringify({ href: target, at: Date.now() })); } catch { /* none */ }
          preloadNext();
          // A beat later: a traversal asked while the router is still moving is dropped by it.
          // The entries this page pushed meanwhile (the sector page's steps) count too: measured when it goes.
          setTimeout(() => { window.history.go((hist!.n! - 2) - (window.history.length - 1)); }, 300);
          return;
        }
        // Back from the simulation returns to the page that was open before Google's account chooser (not to the
        // chooser itself): that page takes this entry's place and the simulation is pushed after it.
        if (back && back !== target) {
          await navigate({ href: back, replace: true });
          void navigate({ href: target });
        } else void navigate({ href: target, replace: true });
      })();
      return;
    }
    // Stepped back past Google's pages (above): the app opens where the sign-in was going, pushed, so the pages
    // ahead (Google's) are dropped.
    let after: { href?: string; at?: number } | null = null;
    try { after = JSON.parse(localStorage.getItem("mdt-after-google") ?? "null"); localStorage.removeItem("mdt-after-google"); } catch { /* none */ }
    if (after?.href && Date.now() - (after.at ?? 0) < 60_000) {
      const href = after.href;
      if (href.startsWith("/vigneto")) openSimTab("vineyard", "mappa");
      else if (href.startsWith("/urbano")) openSimTab("urban", "mappa");
      const id = setTimeout(() => void navigate({ href }), 150);
      return () => { clearTimeout(id); landed.__mdtLanded = false; localStorage.setItem("mdt-after-google", JSON.stringify(after)); };
    }
    // The sector lock page was up for this account and this opening is not its own: the phone's Back went past it.
    // That Back does what the lock's "Indietro" does — leave the account (kept on the phone) for the sector choice.
    const lock = readLockAsk();
    if (lock) {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user.id !== lock.user) { clearLockAsk(); return; }
        clearLockAsk();
        dropProIdOnDevice();
        rememberWantedSector(null);
        try { sessionStorage.setItem("mdt-gate-guard", "1"); } catch { /* none */ }
        leaveAccount({ openPanel: false, to: "/benvenuto", replace: true });
      });
      return;
    }
    // A fresh open of the app lands on the entrance (/) the first time, then on the map. This effect
    // runs once per document load, so only the opening page redirects; in-app
    // navigation to /urbano, /vigneto, /dashboard keeps working as before.
    // The move waits a beat: leaving the page while its data is still arriving
    // pulls a match out of the router mid-render and the router throws on a
    // missing routeId.
    // Returning from sign-in keeps the user in the section they left.
    const back = localStorage.getItem("mdt-auth-return");
    if (back) {
      localStorage.removeItem("mdt-auth-return");
      if (back !== location.pathname + location.searchStr) {
        const id = setTimeout(() => void navigate({ href: back, replace: true }), 250);
        return () => { clearTimeout(id); landed.__mdtLanded = false; localStorage.setItem("mdt-auth-return", back); };
      }
      return;
    }
    if (location.pathname === "/reset-password") return;
    // The entrance shows once, at the first access: afterwards a fresh open lands on the urban simulation (a shared
    // scenario link or the "i" still open the tutorial).
    const params = new URLSearchParams(location.searchStr);
    if (location.pathname === "/" && (params.has("scenario") || params.has("rivedi"))) return;
    // After the tutorial a fresh open lands on the Mappa tab of the profile's simulation (the agronomist's vineyard,
    // otherwise the piazza).
    const seen = introSeen(), vine = getProId()?.kind === "agronomo";
    const home = seen ? (vine ? "/vigneto" : "/urbano") : "/";
    if (seen) openSimTab(vine ? "vineyard" : "urban", "mappa");
    if (location.pathname === home || (home === "/" && location.pathname === "/index")) return;
    const id = setTimeout(() => void navigate({ to: home, replace: true }), 250);
    // Unmounted before the move (StrictMode's double mount): let the next mount try again.
    return () => { clearTimeout(id); landed.__mdtLanded = false; };
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
  const intro = location.pathname === "/" || location.pathname === "/scegli";
  return (
    <QueryClientProvider client={queryClient}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[9999999999] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Salta al contenuto principale
      </a>
      {/* The entrance pages have no header, but their "Accedi" opens the account panel: its control is mounted hidden. */}
      {intro && <div hidden><AccountControl /></div>}
      {/* The opening page (/) stands alone: no header, no menus, no footer. */}
      {!intro && <>
      {/* v8: a solid console top bar painted with the page's own ambient light, so it carries the same shades without being see-through. */}
      {/* The page's light, drawn once for every page so a page change never shows the bare background. */}
      {!intro && <AmbientLayer />}
      {/* Transparent: the page's light and its drifting pools show through behind the account button, the "i" and the theme switch. */}
      <header id="app-header" className="relative pt-[env(safe-area-inset-top)]">
        <div className="relative mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 sm:px-4 sm:py-3">
          {/* No logo nor name here: the account sits where the logo was, the theme switch on the right. */}
          <div className="flex min-w-0 items-center"><AccountControl /></div>
          <div className="flex shrink-0 items-center gap-2">
            {/* "i" shows the tutorial again (only the tutorial: it ends by coming back here). */}
            <button type="button" onClick={() => void navigate({ href: "/?rivedi=1" })} aria-label="Come funziona" title="Come funziona"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-foreground/15 bg-foreground/[0.06] text-foreground outline-none transition-colors hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring sm:size-10">
              <Info className="size-4 sm:size-[1.15rem]" aria-hidden="true" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="hidden sm:block"><SmartNav /></div>
      </>}

      <main id="main-content" tabIndex={-1} className={intro ? "focus:outline-none" : "app-main mx-auto max-w-7xl px-4 pb-8 pt-6 focus:outline-none sm:pt-8"}><Outlet /></main><Toaster /><UpdatePill />
      {!intro && <footer className="mx-auto max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-sm leading-relaxed text-muted-foreground sm:pb-10 sm:text-[15px]">
        I risultati del simulatore sono indicativi e non sostituiscono modelli fisici calibrati.
      </footer>}
      {!intro && <BottomNav />}
      <CameraSheet />
      <PermissionsSheet />
      <Suspense fallback={null}><SectorGate /></Suspense>
    </QueryClientProvider>
  );
}
