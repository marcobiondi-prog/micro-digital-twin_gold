import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDemoSignedIn } from "@/lib/demo-login";

export const REGISTERED_EMAIL_KEY = "mdt-registered-email";

const subs = new Set<() => void>();
/** Called whenever notifyAuthChange runs (the remembered account changed); returns the unsubscribe. */
export function subscribeAuthChange(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }

// Coalesced: many components call it on the same auth event (each useSignedIn), and every listener reads the account
// again; one round per burst, 60 ms after the last call, instead of dozens of reads that also fought for the auth lock.
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
export function notifyAuthChange() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    subs.forEach((f) => {
      try { f(); } catch {}
    });
  }, 60);
}

/** Returns the registered email if the user is currently registered or signed in on this device. */
export function getRegisteredEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const direct = window.localStorage.getItem(REGISTERED_EMAIL_KEY);
    if (direct && direct.includes("@")) return direct.trim();
  } catch {
    // memory only fallback
  }
  return null;
}

export function setRegisteredEmail(email: string | null) {
  if (typeof window === "undefined") return;
  const next = email && email.includes("@") ? email.trim().toLowerCase() : null;
  try {
    if (window.localStorage.getItem(REGISTERED_EMAIL_KEY) === next) return; // nothing changed: nobody to tell
    if (next) window.localStorage.setItem(REGISTERED_EMAIL_KEY, next);
    else window.localStorage.removeItem(REGISTERED_EMAIL_KEY);
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
