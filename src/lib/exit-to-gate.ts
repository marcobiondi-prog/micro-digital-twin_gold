import { dropProIdOnDevice, openSectorGate, rememberWantedSector, clearSectorGate, leaveGuest } from "@/lib/use-pro-id";
import { setRegisteredEmail, notifyAuthChange } from "@/lib/use-signed-in";
import { supabase } from "@/integrations/supabase/client";
import { goInApp } from "@/lib/app-nav";
import { toast } from "sonner";

/**
 * Completely disconnects from both the personal account and professional profile,
 * cleans up all local sessions, and brings the user back to the main gate.
 */
export async function exitToGate(opts: { global?: boolean } = {}): Promise<void> {
  // 1. Immediately drop the professional profile synchronously
  dropProIdOnDevice();
  leaveGuest();
  setRegisteredEmail(null);
  rememberWantedSector(null);
  clearSectorGate();
  openSectorGate(null);

  try {
    sessionStorage.removeItem("mdt-guest");
    sessionStorage.removeItem("mdt-gate-guard");
    sessionStorage.removeItem("mdt-pending-avatar");
    sessionStorage.setItem("mdt-bio-skip", "1");
  } catch {}

  // 2. Clear Supabase auth and local session caches
  try {
    supabase.auth.stopAutoRefresh();
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (key) {
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(`${key}-code-verifier`);
      window.localStorage.removeItem(`${key}-user`);
    }
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith("sb-") || k.includes("supabase"))) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {}

  try {
    window.localStorage.removeItem("mdt-account-sessions-v1");
  } catch {}

  // 3. Notify auth changes across components and close account modal
  notifyAuthChange();
  window.dispatchEvent(new CustomEvent("mdt-close-account"));

  // 4. Remote sign out
  try {
    await supabase.auth.signOut({ scope: opts.global ? "global" : "local" });
  } catch {}

  // 5. Navigate to the main gate
  goInApp("/benvenuto");
  toast("Disconnesso", { description: "Sei uscito dal profilo e dall’account." });
}
