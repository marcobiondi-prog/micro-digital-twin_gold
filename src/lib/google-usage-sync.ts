import { supabase } from "@/integrations/supabase/client";
import { fetchGoogleUsage, getGoogleUsage, setGoogleUsage } from "@/models/google-usage";

/**
 * Reads the Google account's used space whenever a Google session carries its token (right after the sign-in), and
 * forgets it on sign-out. Installed once by the root.
 */
let installed = false;
export function installGoogleUsageSync() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const read = async (s: { user: { id: string; app_metadata?: { provider?: string } }; provider_token?: string | null } | null) => {
    if (!s?.provider_token || s.user.app_metadata?.provider !== "google") return;
    const bytes = await fetchGoogleUsage(s.provider_token);
    if (bytes != null) setGoogleUsage({ userId: s.user.id, bytes, at: new Date().toISOString() });
  };
  void supabase.auth.getSession().then(({ data }) => read(data.session));
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") { if (getGoogleUsage()) setGoogleUsage(null); return; }
    void read(session);
  });
}
