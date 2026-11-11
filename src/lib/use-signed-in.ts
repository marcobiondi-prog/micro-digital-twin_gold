import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDemoSignedIn } from "@/lib/demo-login";

export const REGISTERED_EMAIL_KEY = "mdt-registered-email";

const subs = new Set<() => void>();
export function notifyAuthChange() {
  subs.forEach((f) => {
    try { f(); } catch {}
  });
}

/** Returns the registered email if any profile or registration on this device has one. */
export function getRegisteredEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const direct = window.localStorage.getItem(REGISTERED_EMAIL_KEY);
    if (direct && direct.includes("@")) return direct.trim();

    // Check last active profile
    const lastPro = window.localStorage.getItem("mdt-pro-id-v1");
    if (lastPro) {
      const parsed = JSON.parse(lastPro);
      if (parsed?.email && String(parsed.email).includes("@")) return String(parsed.email).trim();
      if (parsed?.acct?.email && String(parsed.acct.email).includes("@")) return String(parsed.acct.email).trim();
    }

    // Check last profiles by sector
    const lastBySector = window.localStorage.getItem("mdt-last-pro-v1");
    if (lastBySector) {
      const parsed = JSON.parse(lastBySector);
      for (const k of ["agronomo", "funzionario"]) {
        const item = parsed?.[k];
        if (item?.email && String(item.email).includes("@")) return String(item.email).trim();
        if (item?.acct?.email && String(item.acct.email).includes("@")) return String(item.acct.email).trim();
      }
    }

    // Check known profiles
    const known = window.localStorage.getItem("mdt-known-pro-ids-v1");
    if (known) {
      const parsed = JSON.parse(known);
      for (const list of [parsed?.agronomo, parsed?.funzionario]) {
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item?.email && String(item.email).includes("@")) return String(item.email).trim();
            if (item?.acct?.email && String(item.acct.email).includes("@")) return String(item.acct.email).trim();
          }
        }
      }
    }
  } catch {
    // memory only fallback
  }
  return null;
}

export function setRegisteredEmail(email: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (email && email.includes("@")) {
      window.localStorage.setItem(REGISTERED_EMAIL_KEY, email.trim().toLowerCase());
    } else {
      window.localStorage.removeItem(REGISTERED_EMAIL_KEY);
    }
  } catch {}
  notifyAuthChange();
}

export function useRegisteredEmail(): string | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      subs.add(onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        subs.delete(onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getRegisteredEmail,
    () => null
  );
}

/**
 * Premium / Signed in state:
 * A user is signed in / Premium if:
 * 1. They have a real Supabase session (Google OAuth or verified Supabase auth)
 * 2. OR they are in demo preview mode
 * 3. OR they registered with an email (e.g. avatar8@hotmail.it or in their profile)
 */
export function useSignedIn(): { signedIn: boolean; demo: boolean; email?: string | null } {
  const [real, setReal] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const demo = useDemoSignedIn();
  const registeredEmail = useRegisteredEmail();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setReal(!!data.session);
      if (data.session?.user?.email) {
        setSessionEmail(data.session.user.email);
        setRegisteredEmail(data.session.user.email);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setReal(!!s);
      if (s?.user?.email) {
        setSessionEmail(s.user.email);
        setRegisteredEmail(s.user.email);
      }
      notifyAuthChange();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const effectiveEmail = sessionEmail || registeredEmail;
  const isPremiumWithEmail = Boolean(effectiveEmail);
  const signedIn = real || demo || isPremiumWithEmail;

  return {
    signedIn,
    demo: demo && !real && !isPremiumWithEmail,
    email: effectiveEmail,
  };
}
