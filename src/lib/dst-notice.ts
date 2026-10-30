import { useEffect } from "react";
import { toast } from "sonner";
import { changeNotice, deviceTimeZone } from "@/models/world-clock";
import { worldNow } from "@/lib/world-time";

/**
 * The change of ora told once: inside the app as a notice from 36 hours before the change to 12 hours after, and on
 * the phone as a notification when the person allowed it (shown while the app is open or in the background).
 */
const SEEN_KEY = "mdt-dst-seen-v1", NOTIFY_KEY = "mdt-dst-notify-v1";
export type NotifyState = "on" | "off" | "denied" | "unsupported";

export function changeNotificationsOn(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try { return Notification.permission === "granted" && localStorage.getItem(NOTIFY_KEY) === "1" ? "on" : "off"; } catch { return "off"; }
}

export async function askChangeNotifications(): Promise<NotifyState> {
  if (!("Notification" in window)) return "unsupported";
  const p = await Notification.requestPermission();
  if (p !== "granted") return p === "denied" ? "denied" : "off";
  try { localStorage.setItem(NOTIFY_KEY, "1"); } catch { /* storage off */ }
  void notify("Avvisi del cambio dell'ora attivi", "Ti avviso la sera prima del cambio, quando l'app è aperta.");
  return "on";
}

async function notify(title: string, body: string) {
  const options = { body, icon: "/favicon.png", tag: "mdt-cambio-ora" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, options); return; }
  } catch { /* no service worker: a plain notification */ }
  try { new Notification(title, options); } catch { /* not allowed here */ }
}

function seen(key: string): boolean {
  try { return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]).includes(key); } catch { return false; }
}
function markSeen(key: string) {
  try {
    const list = (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]).filter((k) => k !== key).slice(-9);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, key]));
  } catch { /* storage off: told again next time */ }
}

/** In the root: checks on opening, on return to the app and every half hour while it stays open. */
export function useDstNotice() {
  useEffect(() => {
    const check = () => {
      const n = changeNotice(worldNow(), deviceTimeZone());
      if (!n) return;
      // Told once before the change and once after it.
      const key = `${n.key}:${n.ahead ? "prima" : "dopo"}`;
      if (seen(key)) return;
      markSeen(key);
      toast(n.ahead ? "Cambio dell'ora" : "Ora cambiata", { description: n.text, duration: 12_000 });
      if (changeNotificationsOn() === "on") void notify(n.ahead ? "Cambio dell'ora" : "Ora cambiata", n.text);
    };
    const first = window.setTimeout(check, 2500);
    const id = window.setInterval(check, 30 * 60_000);
    const vis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { window.clearTimeout(first); window.clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);
}
