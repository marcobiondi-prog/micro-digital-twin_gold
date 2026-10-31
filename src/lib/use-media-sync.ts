import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshMedia, syncDeviceMedia } from "@/models/lab-media-store";

/** Every minute while the app is in front, and whenever it comes back: another device's photos appear, signed links stay fresh. */
const EVERY_MS = 60_000;

/**
 * Mounted once by the root. Signed in, it sends this device's photos and videos (taken before signing in, or while
 * there was no connection) up to the account — at once when the connection comes back —, and keeps both projects' lists in step with the account: on sign-in, on return to the app and every minute.
 */
export function useMediaSync() {
  useEffect(() => {
    let last = 0;
    const run = async (force = false) => {
      // Offline nothing can go up nor be listed: the photos wait on the phone and the list stays as it is.
      if (document.hidden || !navigator.onLine || (!force && Date.now() - last < EVERY_MS - 1000)) return;
      last = Date.now();
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user.id;
      if (!user) return;
      let id: string | number | undefined;
      const moved = await syncDeviceMedia(user, (n) => { id = toast.loading(n === 1 ? "Porto 1 foto o video nel tuo account…" : `Porto ${n} foto e video nel tuo account…`); });
      if (id !== undefined) {
        if (moved) toast.success(moved === 1 ? "1 file ora è nel tuo account" : `${moved} file ora sono nel tuo account`, { id, description: "Li vedi da tutti i tuoi dispositivi." });
        else toast.error("Non sono riuscito a portarli nell'account: riprovo più tardi", { id });
      }
      if (!moved) { await refreshMedia("urban"); await refreshMedia("vineyard"); }
    };
    void run(true);
    const back = () => { if (!document.hidden) void run(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    const timer = window.setInterval(() => void run(), EVERY_MS);
    // Back online: what was kept on the phone while offline goes up at once.
    const online = () => void run(true);
    window.addEventListener("online", online);
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") void run(true); });
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); window.clearInterval(timer); window.removeEventListener("online", online); data.subscription.unsubscribe(); };
  }, []);
}
