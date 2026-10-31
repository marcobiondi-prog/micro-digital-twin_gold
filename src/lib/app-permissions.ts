import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { askChangeNotifications } from "@/lib/dst-notice";

/**
 * The app's three permissions — position (the map's GPS), camera with microphone (photos and videos with their sound)
 * and notifications (the change of ora) — asked once at the first start and changeable at any time from Account →
 * Autorizzazioni. A web app can ask for a permission but never take one back: once given or blocked, only the phone's
 * or the browser's settings change it, and howToChange says where.
 */
export type PermKind = "posizione" | "fotocamera" | "notifiche";
export type PermState = "granted" | "denied" | "prompt" | "unsupported";

export const PERMS: Array<{ kind: PermKind; title: string; why: string }> = [
  { kind: "posizione", title: "Posizione", why: "Per trovare il luogo sulla mappa e seguirti col GPS." },
  { kind: "fotocamera", title: "Fotocamera e microfono", why: "Per scattare foto, lo scatto multiplo e i video con l'audio." },
  { kind: "notifiche", title: "Notifiche", why: "Per avvisarti del cambio dell'ora, anche con l'app in sottofondo." },
];

const ASKED_KEY = "mdt-perms-asked-v1";
export function permsAsked() { try { return localStorage.getItem(ASKED_KEY) === "1"; } catch { return true; } }
export function markPermsAsked() { try { localStorage.setItem(ASKED_KEY, "1"); } catch { /* storage off: asked again next time */ } }

async function query(name: string): Promise<PermState | null> {
  try {
    const s = await navigator.permissions.query({ name: name as PermissionName });
    return s.state as PermState;
  } catch { return null; }
}

/** The worst of two states: blocked beats still to ask, which beats allowed. */
const worst = (a: PermState, b: PermState): PermState => (a === "denied" || b === "denied" ? "denied" : a === "prompt" || b === "prompt" ? "prompt" : a);

export async function permState(kind: PermKind): Promise<PermState> {
  if (typeof window === "undefined") return "unsupported";
  if (kind === "notifiche") {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission === "default" ? "prompt" : (Notification.permission as PermState);
  }
  if (kind === "posizione") {
    if (!("geolocation" in navigator)) return "unsupported";
    return (await query("geolocation")) ?? "prompt";
  }
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  const [cam, mic] = await Promise.all([query("camera"), query("microphone")]);
  return worst(cam ?? "prompt", mic ?? "prompt");
}

/** Shows the phone's own question for that permission and returns what it became. */
export async function askPermission(kind: PermKind): Promise<PermState> {
  if (kind === "notifiche") {
    if (!("Notification" in window)) return "unsupported";
    // The same switch as the "Avvisami sul telefono" of the time picker: allowed here, the change of ora is notified.
    const r = await askChangeNotifications();
    return r === "on" ? "granted" : r === "denied" ? "denied" : r === "unsupported" ? "unsupported" : await permState(kind);
  }
  if (kind === "posizione") {
    if (!("geolocation" in navigator)) return "unsupported";
    await new Promise<void>((done) => navigator.geolocation.getCurrentPosition(() => done(), () => done(), { timeout: 15_000, maximumAge: 600_000 }));
    return permState(kind);
  }
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Without a microphone (or with it refused) the camera alone is still worth asking.
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* refused */ }
  }
  return permState(kind);
}

export const STATE_LABEL: Record<PermState, string> = { granted: "Consentito", denied: "Bloccato", prompt: "Da chiedere", unsupported: "Non disponibile" };

/** The message said after a change, in plain words. */
export function changeMessage(kind: PermKind, state: PermState): string {
  const what = kind === "posizione" ? "La posizione" : kind === "fotocamera" ? "La fotocamera" : "Le notifiche";
  const plural = kind === "notifiche", f = plural ? "e" : "a", is = plural ? "sono" : "è";
  if (state === "granted") return `${what} ora ${is} consentit${f}.`;
  if (state === "denied") return `${what} ora ${is} bloccat${f}: puoi riattivarl${f} dalle impostazioni.`;
  if (state === "unsupported") return `${what} non ${plural ? "sono disponibili" : "è disponibile"} su questo dispositivo.`;
  return `${what} ${plural ? "verranno chieste" : "verrà chiesta"} la prossima volta che serve${plural ? "no" : ""}.`;
}

/** Where the person changes a permission the app can no longer change itself: the installed app, Chrome, Safari or a computer. */
export function howToChange(state: PermState): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const installed = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: fullscreen)").matches || (navigator as { standalone?: boolean }).standalone === true);
  const verb = state === "granted" ? "toglierlo" : "riattivarlo";
  if (/iPhone|iPad|iPod/i.test(ua)) return `Per ${verb}: Impostazioni dell'iPhone → Safari → Impostazioni per i siti web (fotocamera, microfono, posizione); le notifiche in Impostazioni → Notifiche.`;
  if (/Android/i.test(ua)) return installed
    ? `Per ${verb}: tieni premuta l'icona dell'app → Informazioni app → Autorizzazioni, oppure in Chrome tocca ⋮ → Impostazioni → Impostazioni sito.`
    : `Per ${verb}: tocca l'icona a sinistra dell'indirizzo in Chrome → Autorizzazioni, oppure ⋮ → Impostazioni → Impostazioni sito.`;
  return `Per ${verb}: fai clic sull'icona a sinistra dell'indirizzo nel browser → Impostazioni sito.`;
}

/** The three states, read again on return to the app and whenever the browser reports a change; each change after the first reading is said once. */
export function usePermissions(announce = false) {
  const [states, setStates] = useState<Record<PermKind, PermState> | null>(null);
  const prev = useRef<Record<PermKind, PermState> | null>(null);
  const refresh = useCallback(async () => {
    const next = Object.fromEntries(await Promise.all(PERMS.map(async (p) => [p.kind, await permState(p.kind)] as const))) as Record<PermKind, PermState>;
    if (announce && prev.current) for (const p of PERMS) if (prev.current[p.kind] !== next[p.kind]) toast(changeMessage(p.kind, next[p.kind]));
    prev.current = next;
    setStates(next);
    return next;
  }, [announce]);
  useEffect(() => {
    void refresh();
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    let live = true;
    const statuses: PermissionStatus[] = [];
    const onChange = () => { if (live) void refresh(); };
    for (const name of ["geolocation", "camera", "microphone", "notifications"]) {
      void navigator.permissions?.query({ name: name as PermissionName }).then((s) => { s.addEventListener("change", onChange); statuses.push(s); }).catch(() => undefined);
    }
    return () => { live = false; document.removeEventListener("visibilitychange", onVis); statuses.forEach((s) => s.removeEventListener("change", onChange)); };
  }, [refresh]);
  return { states, refresh, setStates };
}
